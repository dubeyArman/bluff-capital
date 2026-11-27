// ─── Bluff Capital – Production Backend Server ───────────────────────────────────
// Designed for live events hosting up to 300+ participants (~75 teams)
// Real-time multi-client synchronization via Socket.IO

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const os = require('os');
const fs = require('fs');
const QRCode = require('qrcode');

if (fs.existsSync(path.join(__dirname, '..', '.env.local'))) {
  try {
    const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
    for (const line of envContent.split('\n')) {
      const idx = line.indexOf('=');
      if (idx > 0) {
        const k = line.substring(0, idx).trim();
        let v = line.substring(idx + 1).trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        if (!process.env[k]) process.env[k] = v;
      }
    }
  } catch (e) {}
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e6,
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// URL Normalizer & Remote State Sync Middleware
app.use((req, res, next) => {
  if (req.query && req.query.slug) {
    const slugArr = Array.isArray(req.query.slug) ? req.query.slug : [req.query.slug];
    const joined = slugArr.join('/');
    const matchedPath = req.headers['x-matched-path'] || req.url || '';
    if (matchedPath.includes('/api/host') || matchedPath.includes('/host/')) {
      req.url = '/api/host/' + joined;
    } else {
      req.url = '/api/' + joined;
    }
  } else if (!req.url.startsWith('/api') && 
      !req.url.startsWith('/host.html') && 
      !req.url.startsWith('/projector.html') && 
      !req.url.startsWith('/index.html') && 
      !req.url.startsWith('/style.css') && 
      !req.url.startsWith('/app.js') && 
      !req.url.startsWith('/socket.io') && 
      req.url !== '/' && req.url !== '/host' && req.url !== '/projector') {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  next();
});

app.use(async (req, res, next) => {
  if (req.url.startsWith('/api') || req.url.startsWith('/state') || req.url.startsWith('/leaderboard')) {
    await syncStateFromRemote().catch(() => {});
  }
  next();
});

const HOST_PASSWORD = 'bluffcapital2026';
let STARTING_CAPITAL = 10000;
const TIMER_SECONDS = 90;
let projectorView = 'auto';
const PORT = process.env.PORT || 3000;

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ─── Round Data (Official Bluff Capital Master Key) ───────────────────────────
const ROUNDS = [
  {
    round: 1,
    theme: 'Campus Food Economy',
    companies: [
      {
        name: 'The Caffeine Vault',
        shortName: 'Caffeine Vault',
        icon: '☕',
        pitch: 'Campus coffee brand offering cold brews, lattes, energy drinks and snack combos. Targets students through affordable drinks, repeat purchases and loyalty plans. Plans two new campus outlets and bottled cold brew.',
        hint: 'Campus beverage retail is seeing rising footfalls, but cold brew bottling and rapid expansion require heavy upfront commercial equipment.',
        returnPct: -100,
        isBluff: true,
        why: 'Bottled distribution and multi-outlet expansion with razor-thin student margins burned cash rapidly. The expansion claims outpaced actual unit economics.',
      },
      {
        name: 'Momo District',
        shortName: 'Momo District',
        icon: '🥟',
        pitch: 'Quick-service momo brand offering steamed, fried and innovative varieties. Targets students through affordable snacks, combos and bulk orders. Plans franchise kiosks across nearby college campuses.',
        hint: 'High repeat orders and low preparation times give quick-service momo kiosks strong operating margins in dense student clusters.',
        returnPct: 22,
        isBluff: false,
        why: 'Low cost of goods, rapid table turnover, and high-margin bulk student party orders drove solid 22% gains.',
      },
      {
        name: 'The Chaat Society',
        shortName: 'Chaat Society',
        icon: '🍟',
        pitch: 'Street-food brand offering chaat, gol gappa, bhel and loaded fries. Targets students with affordable, customisable snacks and group platters. Plans seasonal menus and late-evening combos.',
        hint: 'Late-evening street food and customizable group platters capture strong snack demand after classes.',
        returnPct: 14,
        isBluff: false,
        why: 'Consistent evening footfall and high-margin loaded snack platters delivered steady 14% returns.',
      },
      {
        name: 'Bukhara x Beijing',
        shortName: 'Bukhara x Beijing',
        icon: '🚚',
        pitch: 'Food truck combining North Indian and Indo-Chinese cuisines. Targets students through late-night meals, combos and event catering. Plans two additional trucks and college festival partnerships.',
        hint: 'Late-night food trucks with dual-cuisine appeal and college festival catering contracts enjoy peak off-peak utilization.',
        returnPct: 28,
        isBluff: false,
        why: 'Monopolizing late-night campus hunger and landing high-ticket college festival catering contracts yielded a massive 28% profit.',
      },
    ],
    bluffHint: "Ask: 'Can a single-campus coffee booth fund commercial cold-brew bottling lines and two new outlets purely from student lattes?'",
  },
  {
    round: 2,
    theme: 'Travel & Tourism',
    companies: [
      {
        name: 'Nonlocals',
        shortName: 'Nonlocals',
        icon: '🏔️',
        pitch: 'Student-led travel community organising group trips to Manali, Jibhi, Shimla and Dharamshala. Focuses on social experiences, group bookings and repeat customers. Plans to build a recognisable youth travel community.',
        hint: 'Youth group travel communities benefit from organic viral campus word-of-mouth and bulk transport discounts.',
        returnPct: 20,
        isBluff: false,
        why: 'Viral campus word-of-mouth, zero ad spend, and high repeat group bookings generated a robust 20% return.',
      },
      {
        name: 'RidgeRoute Experiences',
        shortName: 'RidgeRoute',
        icon: '🥾',
        pitch: 'Adventure travel company offering guided treks and outdoor experiences. Targets students and young professionals through group trips and corporate retreats. Plans local partnerships and Northeast adventure circuits.',
        hint: 'Guided adventure treks and combined corporate weekend retreats provide balanced weekday-weekend booking utilization.',
        returnPct: 16,
        isBluff: false,
        why: 'Premium corporate weekend retreat contracts stabilized cash flows and delivered 16% profits.',
      },
      {
        name: 'StayCircle',
        shortName: 'StayCircle',
        icon: '🏡',
        pitch: 'TravelTech marketplace connecting independent homestays, hostels and boutique stays with budget travellers. Earns through booking commissions and premium listings. Plans a verified-stay programme and expansion into 20 destinations.',
        hint: 'Marketplace expansion across 20 new destinations requires heavy host acquisition incentives and verification costs.',
        returnPct: -10,
        isBluff: false,
        why: 'Real platform, but aggressive 20-city expansion and host onboarding subsidies outpaced booking fee commissions, resulting in a 10% drag.',
      },
      {
        name: 'PeakPass Holidays',
        shortName: 'PeakPass',
        icon: '🎟️',
        pitch: 'Student travel company offering affordable group packages across mountain destinations. Earns through advance bookings, campus referrals and travel add-ons. Plans expansion to 50 colleges and an annual travel membership.',
        hint: 'Unregulated annual multi-destination travel memberships often struggle to fulfill fixed hotel commitments during peak holiday surges.',
        returnPct: -100,
        isBluff: true,
        why: 'Ponzi-like advance cash collection: promised cheap peak-season mountain stays without contracted hotel inventory. Cash collapsed when season began.',
      },
    ],
    bluffHint: "Ask: 'How does an early-stage operator guarantee fixed-cost mountain stays across 50 campuses without pre-buying hotel inventory?'",
  },
  {
    round: 3,
    theme: 'AI SaaS',
    companies: [
      {
        name: 'ModelForge AI',
        shortName: 'ModelForge AI',
        icon: '🤖',
        pitch: 'Enterprise AI platform connecting business data with AI models to automate workflows. Targets mid-sized businesses through subscriptions, API usage and implementation fees. Plans industry-specific AI templates and Southeast Asian expansion.',
        hint: 'Mid-sized enterprises are aggressively adopting workflow automation platforms that integrate seamlessly with existing proprietary databases.',
        returnPct: 25,
        isBluff: false,
        why: 'High enterprise retention, recurring annual SaaS licenses, and sticky workflow integrations powered a standout 25% gain.',
      },
      {
        name: 'LedgerLens AI',
        shortName: 'LedgerLens AI',
        icon: '📑',
        pitch: 'AI accounting software automating reconciliation, transaction categorisation and financial reporting. Targets SMEs through subscriptions and financial integrations. Plans more accounting integrations and automated tax-document preparation.',
        hint: 'Automated tax reconciliation and accounting software show very low customer churn once integrated into SME banking feeds.',
        returnPct: 14,
        isBluff: false,
        why: 'Low churn and automated bookkeeping subscriptions created dependable, high-margin 14% gains.',
      },
      {
        name: 'PromptPilot Technologies',
        shortName: 'PromptPilot',
        icon: '🪄',
        pitch: 'Enterprise platform helping businesses create and optimise prompts across AI models. Claims to improve response quality while reducing API costs. Plans a proprietary model evaluation engine and US expansion.',
        hint: 'Front-end prompt wrappers face rapid obsolescence as major foundational LLM providers incorporate automated prompt optimizations natively.',
        returnPct: -100,
        isBluff: true,
        why: 'Pure API wrapper with zero technical moat. Built-in LLM system updates rendered their prompt optimization tool redundant overnight.',
      },
      {
        name: 'SignalDesk AI',
        shortName: 'SignalDesk AI',
        icon: '🎧',
        pitch: 'AI customer support platform automating queries and assisting support agents. Targets e-commerce and service businesses through subscriptions and integrations. Plans voice-based support and expansion into banking and insurance.',
        hint: 'E-commerce brands are prioritizing automated tier-1 support to handle seasonal surges without expanding human headcount.',
        returnPct: 20,
        isBluff: false,
        why: 'Strong e-commerce tier-1 ticket resolution rates saved clients 40% in staffing, fueling 20% portfolio gains.',
      },
    ],
    bluffHint: "Ask: 'Is prompt optimization a defensible multi-million-dollar software product, or just a temporary wrapper around LLM APIs?'",
  },
  {
    round: 4,
    theme: 'SpaceTech',
    companies: [
      {
        name: 'TerraOrbit Intelligence',
        shortName: 'TerraOrbit',
        icon: '🛰️',
        pitch: 'Satellite data company providing insights for agriculture, infrastructure and environmental monitoring. Processes imagery from external satellite providers into actionable business intelligence. Plans insurance risk assessment and international agriculture expansion.',
        hint: 'Asset-light satellite analytics companies that process third-party imagery avoid heavy rocket manufacturing capital expenditure.',
        returnPct: 22,
        isBluff: false,
        why: 'Asset-light model buying open satellite data and selling high-value crop monitoring contracts delivered an impressive 22% return.',
      },
      {
        name: 'AstraForge Propulsion',
        shortName: 'AstraForge',
        icon: '🚀',
        pitch: 'Aerospace company developing propulsion components for private satellite launch companies. Earns through manufacturing contracts, engineering services and supply agreements. Plans expanded testing facilities and next-generation propulsion components.',
        hint: 'Specialized rocket propulsion component manufacturing commands high barriers to entry and locked-in supplier contracts.',
        returnPct: 28,
        isBluff: false,
        why: 'Exclusive propulsion supply contracts with private rocket launchers delivered high-margin aerospace contracts and a huge 28% gain.',
      },
      {
        name: 'StratoLeap Aerospace',
        shortName: 'StratoLeap',
        icon: '🌌',
        pitch: 'Aerospace company developing reusable small-satellite launch vehicles to reduce launch costs. Claims two successful launch missions and plans commercial satellite launch services. Targets commercial orbital launches within 18 months and international expansion.',
        hint: 'Building orbital reusable launch vehicles within 18 months requires billions in capital, specialized launch sites, and extensive regulatory approvals.',
        returnPct: -100,
        isBluff: true,
        why: 'Faked mission track record: the two "successful launches" were suborbital model tests. Complete failure to develop an orbital rocket; investor funds evaporated.',
      },
      {
        name: 'SkyTrace Orbital',
        shortName: 'SkyTrace',
        icon: '📡',
        pitch: 'Satellite intelligence company monitoring land use, floods and infrastructure development. Serves businesses, insurers and government agencies through analytics and monitoring contracts. Plans expansion into disaster prediction and insurance risk intelligence.',
        hint: 'Government infrastructure and flood-risk reinsurance monitoring contracts provide multi-year locked-in revenue streams.',
        returnPct: 18,
        isBluff: false,
        why: 'Multi-year disaster monitoring contracts with state agencies and insurance underwriters yielded an 18% return.',
      },
    ],
    bluffHint: "Ask: 'Has an early-stage startup really achieved two commercial orbital launches with reusable rockets in 18 months, or are they suborbital prototypes?'",
  },
];

// ─── Game State ──────────────────────────────────────────────────────────────
const STATE_SEQUENCE = [
  'waiting',
  'round_1_invest',
  'round_1_results',
  'round_2_invest',
  'round_2_results',
  'round_3_invest',
  'round_3_results',
  'round_4_invest',
  'round_4_results',
  'game_over',
];

// Map<teamId, TeamObject>
let teams = new Map();
let gameState = 'waiting';
let timerInterval = null;
let timerRemaining = 0;
let timerTargetEnd = null;
let roundStartedAt = null;
let countdownStartedAt = null;
let countdownRoundNum = 1;
let countdownRemaining = 0;
let isCountingDown = false;
let countdownInterval = null;
let isPaused = false;
let pitchMode = 'auto';
let pitchVisible = true;
let roundStatuses = { 1: 'pending', 2: 'pending', 3: 'pending', 4: 'pending' };

// ─── State Persistence Engine with Vercel Blob & Local Fallback ──────────────
const STORE_DIR = process.env.VERCEL ? '/tmp' : path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(STORE_DIR, 'bluff_capital_store.json');
const BLOB_STORE_URL = 'https://abkq5w6avnbgojio.public.blob.vercel-storage.com/bluff_capital_store.json';
let lastBlobSyncTime = 0;
let isSavingBlob = false;

function saveStateToDisk() {
  try {
    if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
    const data = {
      gameState,
      timerRemaining,
      timerTargetEnd,
      roundStartedAt,
      countdownStartedAt,
      countdownRoundNum,
      isPaused,
      pitchMode,
      pitchVisible,
      roundStatuses,
      teams: Array.from(teams.entries()),
      savedAt: Date.now()
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(data), 'utf8');
  } catch (e) {}
}

async function saveStateToRemote() {
  saveStateToDisk();
  if (process.env.BLOB_READ_WRITE_TOKEN && !isSavingBlob) {
    isSavingBlob = true;
    try {
      const { put } = require('@vercel/blob');
      const data = {
        gameState,
        timerRemaining,
        timerTargetEnd,
        roundStartedAt,
        countdownStartedAt,
        countdownRoundNum,
        isPaused,
        pitchMode,
        pitchVisible,
        roundStatuses,
        teams: Array.from(teams.entries()),
        savedAt: Date.now()
      };
      lastBlobSyncTime = data.savedAt;
      await put('bluff_capital_store.json', JSON.stringify(data), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true
      });
    } catch (e) {
    } finally {
      isSavingBlob = false;
    }
  }
}

function loadStateFromDisk() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (data && data.teams) {
        teams = new Map(data.teams);
        if (data.gameState) gameState = data.gameState;
        if (data.pitchMode) pitchMode = data.pitchMode;
        if (data.pitchVisible !== undefined) pitchVisible = data.pitchVisible;
        if (data.isPaused !== undefined) isPaused = data.isPaused;
        if (data.roundStatuses) roundStatuses = Object.assign(roundStatuses, data.roundStatuses);
        if (data.roundStartedAt) roundStartedAt = data.roundStartedAt;
        if (data.timerTargetEnd) timerTargetEnd = data.timerTargetEnd;
        if (data.countdownStartedAt) countdownStartedAt = data.countdownStartedAt;
        if (data.countdownRoundNum) countdownRoundNum = data.countdownRoundNum;
        if (data.timerRemaining !== undefined && !timerInterval) timerRemaining = data.timerRemaining;
      }
    }
  } catch (e) {}
}

async function syncStateFromRemote() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const res = await fetch(BLOB_STORE_URL + '?t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.teams && data.savedAt && data.savedAt > lastBlobSyncTime) {
          teams = new Map(data.teams);
          if (data.gameState) gameState = data.gameState;
          if (data.pitchMode) pitchMode = data.pitchMode;
          if (data.pitchVisible !== undefined) pitchVisible = data.pitchVisible;
          if (data.isPaused !== undefined) isPaused = data.isPaused;
          if (data.roundStatuses) roundStatuses = Object.assign(roundStatuses, data.roundStatuses);
          if (data.roundStartedAt) roundStartedAt = data.roundStartedAt;
          if (data.timerTargetEnd) timerTargetEnd = data.timerTargetEnd;
          if (data.countdownStartedAt) countdownStartedAt = data.countdownStartedAt;
          if (data.countdownRoundNum) countdownRoundNum = data.countdownRoundNum;
          if (data.timerRemaining !== undefined) timerRemaining = data.timerRemaining;
          lastBlobSyncTime = data.savedAt;
          saveStateToRemote();
          return;
        }
      }
    } catch (e) {}
  }
  loadStateFromDisk();
}

function checkAutoTransitions() {
  const now = Date.now();
  if (countdownStartedAt) {
    const elapsedSec = (now - countdownStartedAt) / 1000;
    const rem = Math.max(0, Math.ceil(5 - elapsedSec));
    countdownRemaining = rem;
    if (rem > 0) {
      isCountingDown = true;
    } else {
      isCountingDown = false;
      countdownRemaining = 0;
      const targetState = 'round_' + countdownRoundNum + '_invest';
      gameState = targetState;
      roundStatuses[countdownRoundNum] = 'active';
      countdownStartedAt = null;
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      for (const team of teams.values()) {
        team.lockedIn = false;
      }
      startTimer();
      broadcastState();
      broadcastLeaderboard();
      saveStateToRemote();
    }
  }

  if (isInvestPhase() && !isPaused && timerTargetEnd) {
    const rem = Math.max(0, Math.ceil((timerTargetEnd - now) / 1000));
    timerRemaining = rem;
    if (rem <= 0) {
      stopTimer();
      autoLockInvestments();
    }
  }
}

// Initial state load
loadStateFromDisk();

function updatePitchVisibilityOnRoundStart() {
  pitchMode = 'auto';
  pitchVisible = true;
}

function generateCode() {
  const existing = new Set([...teams.values()].map((t) => t.code));
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (existing.has(code));
  return code;
}

function currentRoundIndex() {
  const m = gameState.match(/^round_(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function isInvestPhase() {
  return gameState.endsWith('_invest');
}

function isResultsPhase() {
  return gameState.endsWith('_results');
}

function getRoundData(roundNum) {
  return ROUNDS[roundNum - 1] || null;
}

function getRoundTheme(roundNum) {
  const rd = getRoundData(roundNum);
  return rd ? rd.theme : '';
}

function getSubmittedCount() {
  const roundNum = currentRoundIndex();
  if (!roundNum) return 0;
  let count = 0;
  for (const team of teams.values()) {
    if (team.investments[roundNum]) count++;
  }
  return count;
}

function getLeaderboard() {
  const roundNum = currentRoundIndex();
  return [...teams.values()]
    .map((t) => {
      const isSubmitted = roundNum ? !!t.investments[roundNum] : false;
      let change = 0;
      if (t.history.length > 0) {
        const last = t.history[t.history.length - 1];
        if (last.capitalBefore !== 0) {
          change = Math.round(((last.capitalAfter - last.capitalBefore) / Math.abs(last.capitalBefore)) * 100);
        }
      }
      return {
        teamId: t.id,
        id: t.id,
        name: t.name,
        leaderName: t.leaderName || '',
        enrollmentNo: t.enrollmentNo || '',
        capital: Math.round(t.capital * 100) / 100,
        isDebt: t.capital < 0,
        submitted: isSubmitted,
        change,
        rank: 0,
      };
    })
    .sort((a, b) => b.capital - a.capital)
    .map((t, i) => ({ ...t, rank: i + 1 }));
}

function broadcastState() {
  const roundNum = currentRoundIndex();
  const roundData = roundNum ? getRoundData(roundNum) : null;

  let companies = null;
  if (roundData) {
    companies = roundData.companies.map((c) => ({
      name: c.name,
      shortName: c.shortName,
      icon: c.icon,
      pitch: c.pitch,
      hint: c.hint,
      ...(isResultsPhase() || gameState === 'game_over'
        ? { returnPct: c.returnPct, isBluff: !!c.isBluff }
        : {}),
    }));
  }

  // Derive matrix status for all 4 rounds
  const statuses = {};
  for (let r = 1; r <= 4; r++) {
    if (roundStatuses[r] && roundStatuses[r] !== 'pending') {
      statuses[r] = roundStatuses[r];
    } else if (roundNum === r) {
      if (isInvestPhase()) {
        statuses[r] = isPaused ? 'paused' : (isCountingDown && countdownRoundNum === r ? 'countdown' : 'active');
      } else if (isResultsPhase()) {
        statuses[r] = 'ended';
      } else {
        statuses[r] = 'pending';
      }
    } else if (roundNum && roundNum > r) {
      statuses[r] = 'ended';
    } else if (gameState === 'game_over') {
      statuses[r] = 'ended';
    } else {
      statuses[r] = 'pending';
    }
  }

  const payload = {
    state: gameState,
    isCountingDown: !!isCountingDown,
    countdown: countdownRemaining > 0 ? countdownRemaining : null,
    countdownSeconds: countdownRemaining,
    countdownRound: countdownRoundNum,
    round: roundNum,
    theme: roundData ? roundData.theme : '',
    companies,
    pitchVisible: isResultsPhase() || gameState === 'game_over' ? true : !!pitchVisible,
    pitchMode: pitchMode,
    isPaused: !!isPaused,
    roundStatuses: statuses,
    timer: isInvestPhase() ? timerRemaining : null,
    timerRemaining: isInvestPhase() ? timerRemaining : null,
    seconds: isInvestPhase() ? timerRemaining : null,
    total: TIMER_SECONDS,
    startingCapital: STARTING_CAPITAL,
    projectorView: projectorView || 'auto',
    teamCount: teams.size,
    totalTeams: teams.size,
    submittedCount: getSubmittedCount(),
  };

  io.emit('state_change', payload);
}

function broadcastLeaderboard() {
  io.emit('leaderboard_update', { leaderboard: getLeaderboard() });
}

// ─── Timer System ────────────────────────────────────────────────────────────
function startTimer() {
  stopTimer();
  isPaused = false;
  timerRemaining = TIMER_SECONDS;
  roundStartedAt = Date.now();
  timerTargetEnd = Date.now() + (TIMER_SECONDS * 1000);
  io.emit('timer_tick', {
    seconds: timerRemaining,
    remaining: timerRemaining,
    total: TIMER_SECONDS,
    isPaused: false,
  });

  timerInterval = setInterval(() => {
    checkAutoTransitions();
    io.emit('timer_tick', {
      seconds: timerRemaining,
      remaining: timerRemaining,
      total: TIMER_SECONDS,
      isPaused: false,
    });
  }, 1000);
  saveStateToRemote();
}

function pauseTimer() {
  if (timerTargetEnd && !isPaused) {
    timerRemaining = Math.max(0, Math.ceil((timerTargetEnd - Date.now()) / 1000));
  }
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  isPaused = true;
  timerTargetEnd = null;
  io.emit('timer_paused', { remaining: timerRemaining, round: currentRoundIndex() });
  broadcastState();
  saveStateToRemote();
}

function resumeTimer() {
  if (isPaused && timerRemaining > 0) {
    isPaused = false;
    timerTargetEnd = Date.now() + (timerRemaining * 1000);
    io.emit('timer_resumed', { remaining: timerRemaining, round: currentRoundIndex() });
    broadcastState();
    timerInterval = setInterval(() => {
      checkAutoTransitions();
      io.emit('timer_tick', {
        seconds: timerRemaining,
        remaining: timerRemaining,
        total: TIMER_SECONDS,
        isPaused: false,
      });
    }, 1000);
    saveStateToRemote();
  }
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  isPaused = false;
  timerTargetEnd = null;
  saveStateToRemote();
}

function autoLockInvestments() {
  const roundNum = currentRoundIndex();
  if (!roundNum) return;
  // If timer expires, any team that did NOT submit is treated as having held 100% Cash!
  // They do NOT lose capital to the bluff, nor do they gain equity returns.
  // Their capital stays completely intact.
  for (const team of teams.values()) {
    if (!team.investments[roundNum]) {
      team.investments[roundNum] = null; // Stays null = 0% invested (100% Cash)
      team.lockedIn = true;
    }
  }
  io.emit('timer_expired', { round: roundNum });
  broadcastState();
  broadcastLeaderboard();
}

// ─── Capital Economics Engine ────────────────────────────────────────────────
const calculatedRounds = new Set();
const roundResultsCache = {};

function calculateResults(roundNum) {
  const roundData = getRoundData(roundNum);
  if (!roundData) return;

  // Idempotency Guard: If this round has ALREADY been calculated, do NOT re-deduct or re-multiply capital!
  if (calculatedRounds.has(roundNum) && roundResultsCache[roundNum]) {
    const cached = roundResultsCache[roundNum];
    const lb = getLeaderboard();
    lb.forEach((entry) => {
      if (cached.teamResultsMap[entry.teamId]) {
        cached.teamResultsMap[entry.teamId].rank = entry.rank;
      }
    });
    io.emit('results_reveal', {
      round: roundNum,
      theme: roundData.theme,
      companies: roundData.companies.map((c) => ({
        name: c.name,
        shortName: c.shortName,
        icon: c.icon,
        returnPct: c.returnPct,
        isBluff: !!c.isBluff,
      })),
      teamResults: cached.teamResults,
      teamResultsMap: cached.teamResultsMap,
      leaderboard: lb,
    });
    broadcastLeaderboard();
    return;
  }

  const teamResultsMap = {};
  const teamResults = [];

  for (const team of teams.values()) {
    const rawAllocations = team.investments[roundNum];
    const capitalBefore = team.capital;
    let newCapital = 0;
    let heldCash = false;

    // Bankrupt check: If team has 0 capital, they cannot invest and remain at 0
    if (capitalBefore <= 0) {
      team.capital = 0;
      team.isBankrupt = true;
      const companyResults = roundData.companies.map((company) => ({
        name: company.name,
        shortName: company.shortName,
        returnPct: company.returnPct,
        isBluff: !!company.isBluff,
        allocated: 0,
        amountInvested: 0,
        amountAfter: 0,
        gained: 0,
      }));

      const tRes = {
        teamId: team.id,
        name: team.name,
        leaderName: team.leaderName || '',
        enrollmentNo: team.enrollmentNo || '',
        capitalBefore: 0,
        capitalAfter: 0,
        isBankrupt: true,
        heldCash: true,
        allocations: [0, 0, 0, 0],
        companyResults,
      };
      teamResults.push(tRes);
      teamResultsMap[team.id] = tRes;
      continue;
    }

    // Check if team submitted allocations or held cash
    if (!rawAllocations || !Array.isArray(rawAllocations)) {
      // TEAM PLAYED WITH ZERO INVESTMENT (HELD 100% CASH)
      heldCash = true;
      newCapital = capitalBefore; // No gain, no loss!

      const companyResults = roundData.companies.map((company) => ({
        name: company.name,
        shortName: company.shortName,
        returnPct: company.returnPct,
        isBluff: !!company.isBluff,
        allocated: 0,
        amountInvested: 0,
        amountAfter: 0,
        gained: 0,
      }));

      team.capital = newCapital;
      const historyEntry = {
        round: roundNum,
        capitalBefore,
        capitalAfter: newCapital,
        heldCash: true,
        allocations: [0, 0, 0, 0],
        companyResults,
      };
      const exIdx = team.history.findIndex((h) => h.round === roundNum);
      if (exIdx >= 0) team.history[exIdx] = historyEntry;
      else team.history.push(historyEntry);

      const tRes = {
        teamId: team.id,
        name: team.name,
        leaderName: team.leaderName || '',
        enrollmentNo: team.enrollmentNo || '',
        capitalBefore,
        capitalAfter: newCapital,
        isBankrupt: false,
        heldCash: true,
        allocations: [0, 0, 0, 0],
        companyResults,
      };
      teamResults.push(tRes);
      teamResultsMap[team.id] = tRes;
    } else {
      // TEAM SUBMITTED INVESTMENT ALLOCATIONS
      const allocations = rawAllocations;
      const totalInvestedPct = allocations.reduce((a, b) => a + b, 0);
      const cashPct = Math.max(0, 100 - totalInvestedPct);
      const cashPreserved = (cashPct / 100) * capitalBefore;
      newCapital = cashPreserved;

      const companyResults = roundData.companies.map((company, i) => {
        const pctAllocated = allocations[i] || 0;
        const amountInvested = (pctAllocated / 100) * capitalBefore;
        // If company is bluff, return is -100%, investment goes to 0
        const returnMultiplier = company.isBluff ? 0 : (1 + company.returnPct / 100);
        const amountAfter = amountInvested * returnMultiplier;
        const gained = amountAfter - amountInvested;
        newCapital += amountAfter;

        return {
          name: company.name,
          shortName: company.shortName,
          returnPct: company.returnPct,
          isBluff: !!company.isBluff,
          allocated: pctAllocated,
          amountInvested: Math.round(amountInvested * 100) / 100,
          amountAfter: Math.round(amountAfter * 100) / 100,
          gained: Math.round(gained * 100) / 100,
        };
      });

      // Capital cannot drop below 0: if <= 0, exhausted / bankrupt
      newCapital = Math.max(0, Math.round(newCapital * 100) / 100);
      team.capital = newCapital;
      team.isBankrupt = newCapital <= 0;

      const historyEntry = {
        round: roundNum,
        capitalBefore,
        capitalAfter: newCapital,
        heldCash: false,
        cashReservePct: cashPct,
        allocations,
        companyResults,
      };
      const exIdx = team.history.findIndex((h) => h.round === roundNum);
      if (exIdx >= 0) team.history[exIdx] = historyEntry;
      else team.history.push(historyEntry);

      const tRes = {
        teamId: team.id,
        name: team.name,
        leaderName: team.leaderName || '',
        enrollmentNo: team.enrollmentNo || '',
        capitalBefore,
        capitalAfter: newCapital,
        isBankrupt: newCapital <= 0,
        heldCash: false,
        cashReservePct: cashPct,
        allocations,
        companyResults,
      };
      teamResults.push(tRes);
      teamResultsMap[team.id] = tRes;
    }
  }

  const lb = getLeaderboard();
  lb.forEach((entry) => {
    if (teamResultsMap[entry.teamId]) {
      teamResultsMap[entry.teamId].rank = entry.rank;
    }
  });

  // Broadcast results to all connected displays
  io.emit('results_reveal', {
    round: roundNum,
    theme: roundData.theme,
    companies: roundData.companies.map((c) => ({
      name: c.name,
      shortName: c.shortName,
      icon: c.icon,
      returnPct: c.returnPct,
      isBluff: !!c.isBluff,
    })),
    teamResults,
    teamResultsMap,
    leaderboard: lb,
  });

  // Cache results for idempotency so subsequent views do NOT re-deduct
  calculatedRounds.add(roundNum);
  roundResultsCache[roundNum] = { teamResults, teamResultsMap };

  broadcastLeaderboard();
}

// ─── Public REST APIs ────────────────────────────────────────────────────────

// 1. Team Registration (with Duplicate Prevention & Up to 15 Alphanumeric Enrollment No, Case-Insensitive)
app.post(['/api/register', '/register'], async (req, res) => {
  loadStateFromDisk();
  const { name, leaderName, enrollmentNo, password } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Team name is required.' });
  }

  const trimmedName = name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 30) {
    return res.status(400).json({ error: 'Team name must be between 2 and 30 characters.' });
  }

  const trimmedLeader = (leaderName && typeof leaderName === 'string') ? leaderName.trim() : '';
  if (!trimmedLeader || trimmedLeader.length < 2) {
    return res.status(400).json({ error: 'Team leader name is required (min 2 characters).' });
  }

  // Enrollment Validation: Maximum 15 characters (letters & numbers allowed, case-insensitive)
  const trimmedEnrollment = (enrollmentNo && typeof enrollmentNo === 'string') ? enrollmentNo.trim().toUpperCase() : '';
  if (!trimmedEnrollment || trimmedEnrollment.length < 1 || trimmedEnrollment.length > 15) {
    return res.status(400).json({ error: 'Enrollment number must be between 1 and 15 alphanumeric characters.' });
  }
  if (!/^[A-Z0-9]{1,15}$/.test(trimmedEnrollment)) {
    return res.status(400).json({ error: 'Enrollment number must contain only letters and numbers (max 15 characters).' });
  }

  const trimmedPassword = (password && typeof password === 'string') ? password.trim() : '';
  if (!trimmedPassword || trimmedPassword.length < 3) {
    return res.status(400).json({ error: 'Password is required (min 3 characters).' });
  }

  // 1. Check duplicate team name (Case-Insensitive)
  for (const t of teams.values()) {
    if (t.name.trim().toLowerCase() === trimmedName.toLowerCase()) {
      return res.status(409).json({ error: 'Team name is already registered. Please choose another or login.' });
    }
  }

  // 2. Prevent duplicate enrollment across teams (Case-Insensitive)
  for (const t of teams.values()) {
    if (t.enrollmentNo && t.enrollmentNo.trim().toUpperCase() === trimmedEnrollment) {
      return res.status(409).json({
        error: `Enrollment ${trimmedEnrollment} is already registered under team "${t.name}". Each student can only register once! Please login instead.`
      });
    }
  }

  const teamId = uuidv4();
  const code = generateCode();

  const team = {
    id: teamId,
    name: trimmedName,
    leaderName: trimmedLeader,
    enrollmentNo: trimmedEnrollment,
    password: trimmedPassword,
    code,
    capital: STARTING_CAPITAL,
    investments: {},
    history: [],
    lockedIn: false,
    createdAt: Date.now(),
  };

  teams.set(teamId, team);
  await saveStateToRemote();
  broadcastState();
  broadcastLeaderboard();

  res.json({
    teamId,
    code,
    name: trimmedName,
    leaderName: trimmedLeader,
    enrollmentNo: trimmedEnrollment,
    capital: STARTING_CAPITAL,
    teamCount: teams.size,
  });
});

// 2. Team Login (via Team Name OR Enrollment Number + Password, Case-Insensitive)
app.post(['/api/login', '/login'], (req, res) => {
  loadStateFromDisk();
  const { identifier, name, password } = req.body;
  const loginId = (identifier || name || '').trim().toLowerCase();

  if (!loginId || !password) {
    return res.status(400).json({ error: 'Team name or enrollment number, and password are required.' });
  }

  const trimmedPassword = password.trim();

  let matchedTeam = null;
  for (const t of teams.values()) {
    const tName = (t.name || '').trim().toLowerCase();
    const tEnroll = (t.enrollmentNo || '').trim().toLowerCase();
    if (tName === loginId || tEnroll === loginId) {
      matchedTeam = t;
      break;
    }
  }

  if (!matchedTeam || matchedTeam.password !== trimmedPassword) {
    return res.status(401).json({ error: 'Invalid credentials. Please verify your team name / enrollment number and password.' });
  }

  const roundNum = currentRoundIndex();

  res.json({
    teamId: matchedTeam.id,
    name: matchedTeam.name,
    leaderName: matchedTeam.leaderName || '',
    enrollmentNo: matchedTeam.enrollmentNo || '',
    code: matchedTeam.code,
    capital: Math.round(matchedTeam.capital * 100) / 100,
    currentRoundInvested: roundNum ? !!matchedTeam.investments[roundNum] : false,
    allocations: roundNum ? (matchedTeam.investments[roundNum] || null) : null,
    history: matchedTeam.history,
  });
});

// 3. Submit Portfolio Allocations
app.post(['/api/invest', '/invest'], async (req, res) => {
  const { teamId, allocations } = req.body;

  loadStateFromDisk();
  const team = teams.get(teamId);
  if (!team) {
    return res.status(404).json({ error: 'Team not registered. Please register or login.' });
  }

  if (team.capital <= 0) {
    return res.status(403).json({
      error: 'Oops! Better luck next time! Wait for tournament to end.',
      isBankrupt: true
    });
  }

  if (!isInvestPhase()) {
    return res.status(400).json({ error: `Not in an investment phase. Current state: ${gameState}` });
  }

  const roundNum = currentRoundIndex();

  if (team.investments[roundNum]) {
    return res.status(400).json({ error: 'Investment already submitted for this round.' });
  }

  if (!Array.isArray(allocations) || allocations.length !== 4) {
    return res.status(400).json({ error: 'Allocations must be exactly 4 numbers.' });
  }

  for (let i = 0; i < 4; i++) {
    const val = allocations[i];
    if (!Number.isInteger(val) || val < 0 || val > 100) {
      return res.status(400).json({ error: `Allocation for company ${i + 1} must be an integer between 0% and 100%.` });
    }
  }

  const sum = allocations.reduce((a, b) => a + b, 0);
  if (sum < 0 || sum > 100) {
    return res.status(400).json({ error: `Portfolio allocations cannot exceed 100%. Current sum: ${sum}%.` });
  }

  team.investments[roundNum] = allocations;
  team.lockedIn = true;

  saveStateToRemote();
  broadcastState();
  broadcastLeaderboard();

  res.json({
    success: true,
    round: roundNum,
    allocations,
    capital: team.capital,
    message: 'Portfolio allocations locked in successfully.',
  });
});

// 4. Leaderboard
app.get(['/api/leaderboard', '/leaderboard'], (req, res) => {
  loadStateFromDisk();
  res.json({ leaderboard: getLeaderboard() });
});

// 5. Game State
app.get(['/api/state', '/state'], (req, res) => {
  checkAutoTransitions();
  const roundNum = currentRoundIndex();
  const roundData = roundNum ? getRoundData(roundNum) : null;

  let companies = null;
  if (roundData) {
    companies = roundData.companies.map((c) => ({
      name: c.name,
      shortName: c.shortName,
      icon: c.icon,
      pitch: c.pitch,
      hint: c.hint,
      ...(isResultsPhase() || gameState === 'game_over'
        ? { returnPct: c.returnPct, isBluff: !!c.isBluff }
        : {}),
    }));
  }

  // Derive matrix status for all 4 rounds
  const statuses = {};
  for (let r = 1; r <= 4; r++) {
    if (roundStatuses[r] && roundStatuses[r] !== 'pending') {
      statuses[r] = roundStatuses[r];
    } else if (roundNum === r) {
      if (isInvestPhase()) {
        statuses[r] = isPaused ? 'paused' : (isCountingDown && countdownRoundNum === r ? 'countdown' : 'active');
      } else if (isResultsPhase()) {
        statuses[r] = 'ended';
      } else {
        statuses[r] = 'pending';
      }
    } else if (roundNum && roundNum > r) {
      statuses[r] = 'ended';
    } else if (gameState === 'game_over') {
      statuses[r] = 'ended';
    } else {
      statuses[r] = 'pending';
    }
  }

  res.json({
    state: gameState,
    isCountingDown: !!isCountingDown,
    countdown: countdownRemaining > 0 ? countdownRemaining : null,
    countdownSeconds: countdownRemaining,
    countdownRound: countdownRoundNum,
    round: roundNum,
    theme: roundData ? roundData.theme : '',
    companies,
    pitchVisible: isResultsPhase() || gameState === 'game_over' ? true : !!pitchVisible,
    pitchMode: pitchMode,
    isPaused: !!isPaused,
    roundStatuses: statuses,
    timer: isInvestPhase() ? timerRemaining : null,
    timerRemaining: isInvestPhase() ? timerRemaining : null,
    seconds: isInvestPhase() ? timerRemaining : null,
    total: TIMER_SECONDS,
    startingCapital: STARTING_CAPITAL,
    projectorView: projectorView || 'auto',
    teamCount: teams.size,
    totalTeams: teams.size,
    submittedCount: getSubmittedCount(),
  });
});

function getActiveJoinUrl(req) {
  try {
    const tunnelFile = path.join(__dirname, '..', 'tunnel_url.txt');
    if (fs.existsSync(tunnelFile)) {
      const url = fs.readFileSync(tunnelFile, 'utf8').trim();
      if (url.startsWith('http')) return url;
    }
  } catch (e) {}

  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  const hostHeader = (req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) ? (req.headers['x-forwarded-host'] || req.headers.host) : `localhost:${PORT}`;
  if (hostHeader.startsWith('localhost') || hostHeader.startsWith('127.0.0.1')) {
    const localIp = getLocalIp();
    return `http://${localIp}:${PORT}`;
  }
  const protocol = (req && req.headers && req.headers['x-forwarded-proto']) ? req.headers['x-forwarded-proto'] : ((req && req.protocol) ? req.protocol : 'https');
  return `${protocol}://${hostHeader}`;
}

// 6. Dynamic QR Code Endpoint
app.get(['/api/qrcode', '/qrcode'], async (req, res) => {
  try {
    const customUrl = req.query && req.query.url ? req.query.url.trim() : null;
    const joinUrl = (customUrl && customUrl.startsWith('http')) ? customUrl : getActiveJoinUrl(req);

    if (req.query && req.query.format === 'json') {
      const qrDataUrl = await QRCode.toDataURL(joinUrl, {
        margin: 2,
        width: 360,
        color: { dark: '#000000', light: '#ffffff' },
      });
      return res.json({ url: joinUrl, dataUrl: qrDataUrl });
    }

    const pngBuffer = await QRCode.toBuffer(joinUrl, {
      margin: 2,
      width: 360,
      color: { dark: '#000000', light: '#ffffff' },
    });
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': pngBuffer.length,
      'Cache-Control': 'public, max-age=86400',
    });
    res.end(pngBuffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// 7. Server Info (LAN IP / Public URL for Projector Display)
app.get(['/api/server-info', '/server-info'], (req, res) => {
  const localIp = getLocalIp();
  const joinUrl = getActiveJoinUrl(req);
  res.json({
    localIp,
    port: PORT,
    joinUrl,
  });
});

// 8. Team Details
app.get(['/api/team/:id', '/team/:id'], (req, res) => {
  const team = teams.get(req.params.id);
  if (!team) {
    return res.status(404).json({ error: 'Team not found.' });
  }

  const roundNum = currentRoundIndex();

  res.json({
    teamId: team.id,
    id: team.id,
    name: team.name,
    leaderName: team.leaderName || '',
    enrollmentNo: team.enrollmentNo || '',
    code: team.code,
    capital: Math.round(team.capital * 100) / 100,
    history: team.history,
    currentRoundInvested: roundNum ? !!team.investments[roundNum] : false,
    allocations: roundNum ? team.investments[roundNum] || null : null,
    createdAt: team.createdAt,
  });
});

// ─── Host Administration Controls ─────────────────────────────────────────────
function verifyHost(req, res) {
  const { password } = req.body;
  if (password !== HOST_PASSWORD) {
    res.status(403).json({ error: 'Invalid host credentials.' });
    return false;
  }
  return true;
}

// Host Password Verification Endpoint
app.post(['/api/host/verify', '/host/verify', '/verify'], (req, res) => {
  if (!verifyHost(req, res)) return;
  res.json({ success: true, message: 'Host authenticated successfully.' });
});

// Host Pitch & Hints Presentation Visibility Controls
app.post(['/api/host/pitch-control', '/host/pitch-control', '/pitch-control'], (req, res) => {
  if (!verifyHost(req, res)) return;
  const { action } = req.body;

  if (action === 'auto') {
    pitchMode = 'auto';
    if (isInvestPhase()) {
      pitchVisible = true;
    }
    io.emit('pitch_visibility_change', { pitchVisible, pitchMode });
    return res.json({
      success: true,
      pitchMode,
      pitchVisible,
      message: 'Mode: Pitches and hints will show automatically from the start of countdown.',
    });
  } else if (action === 'hide') {
    pitchMode = 'manual';
    pitchVisible = false;
    io.emit('pitch_visibility_change', { pitchVisible, pitchMode });
    return res.json({
      success: true,
      pitchMode,
      pitchVisible,
      message: 'Pitches and hints are now HIDDEN on participant phones and projector.',
    });
  } else if (action === 'show') {
    pitchVisible = true;
    io.emit('pitch_visibility_change', { pitchVisible, pitchMode });
    return res.json({
      success: true,
      pitchMode,
      pitchVisible,
      message: 'Pitches and hints are now REVEALED to all participants!',
    });
  }

  return res.status(400).json({ error: `Invalid action: ${action}. Use 'auto', 'hide', or 'show'.` });
});

// ─── Round Countdown Engine (5 4 3 2 1 Dramatic Intro) ──────────────────────
function startRoundCountdown(targetState, onComplete) {
  if (countdownInterval) clearInterval(countdownInterval);
  projectorView = 'auto';
  io.emit('resume_projector_game', { state: targetState });
  const roundNum = parseInt(targetState.split('_')[1], 10) || 1;
  countdownRoundNum = roundNum;
  countdownStartedAt = Date.now();
  isCountingDown = true;
  countdownRemaining = 5;
  roundStatuses[roundNum] = 'countdown';

  const theme = getRoundTheme(roundNum);

  io.emit('round_countdown', {
    round: roundNum,
    theme,
    seconds: 5,
  });

  countdownInterval = setInterval(() => {
    if (!countdownStartedAt) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      isCountingDown = false;
      countdownRemaining = 0;
      return;
    }
    const elapsed = Math.floor((Date.now() - countdownStartedAt) / 1000);
    const rem = Math.max(0, 5 - elapsed);
    countdownRemaining = rem;
    if (rem > 0) {
      isCountingDown = true;
      io.emit('round_countdown', {
        round: roundNum,
        theme,
        seconds: rem,
      });
    } else {
      clearInterval(countdownInterval);
      countdownInterval = null;
      isCountingDown = false;
      countdownRemaining = 0;
      io.emit('round_countdown', {
        round: roundNum,
        theme,
        seconds: 0,
      });
      setTimeout(() => {
        countdownStartedAt = null;
        if (onComplete) onComplete();
      }, 750);
    }
  }, 1000);
  saveStateToRemote();
}

// Advance to next game phase
app.post(['/api/host/next', '/host/next', '/next'], (req, res) => {
  if (!verifyHost(req, res)) return;

  const idx = STATE_SEQUENCE.indexOf(gameState);
  if (idx === -1 || idx >= STATE_SEQUENCE.length - 1) {
    return res.status(400).json({ error: 'Game is finished or in unknown state.' });
  }

  const nextState = STATE_SEQUENCE[idx + 1];
  const { immediate, skipCountdown } = req.body;

  if (nextState.endsWith('_invest') && !immediate && !skipCountdown) {
    const roundNum = parseInt(nextState.split('_')[1], 10) || 1;
    updatePitchVisibilityOnRoundStart();
    io.emit('pitch_visibility_change', { pitchVisible, pitchMode });
    startRoundCountdown(nextState, () => {
      gameState = nextState;
      for (const team of teams.values()) {
        team.lockedIn = false;
      }
      startTimer();
      broadcastState();
      broadcastLeaderboard();
    });

    return res.json({
      state: 'countdown',
      round: roundNum,
      seconds: 5,
      pitchVisible,
      pitchMode,
      message: `Starting Round ${roundNum} in 5 seconds...`,
    });
  }

  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
    isCountingDown = false;
    countdownRemaining = 0;
  }

  if (nextState.endsWith('_invest')) {
    updatePitchVisibilityOnRoundStart();
    io.emit('pitch_visibility_change', { pitchVisible, pitchMode });
    gameState = nextState;
    for (const team of teams.values()) {
      team.lockedIn = false;
    }
    startTimer();
  } else if (nextState.endsWith('_results')) {
    pitchVisible = true;
    io.emit('pitch_visibility_change', { pitchVisible, pitchMode });
    stopTimer();
    gameState = nextState;
    const roundNum = currentRoundIndex();
    calculateResults(roundNum);
  } else {
    stopTimer();
    gameState = nextState;
    if (gameState === 'game_over') {
      io.emit('game_over', { leaderboard: getLeaderboard() });
    }
  }

  broadcastState();
  broadcastLeaderboard();

  res.json({ state: gameState, message: `Advanced to ${gameState}` });
});

// Reveal Results
app.post(['/api/host/reveal', '/host/reveal', '/reveal'], (req, res) => {
  if (!verifyHost(req, res)) return;

  if (isInvestPhase()) {
    stopTimer();
    const roundNum = currentRoundIndex();
    const idx = STATE_SEQUENCE.indexOf(gameState);
    gameState = STATE_SEQUENCE[idx + 1];
    calculateResults(roundNum);
    broadcastState();
    return res.json({ state: gameState, message: `Revealed results for Round ${roundNum}` });
  } else if (isResultsPhase()) {
    const roundNum = currentRoundIndex();
    calculateResults(roundNum);
    broadcastState();
    return res.json({ state: gameState, message: `Re-calculated and revealed Round ${roundNum}` });
  }

  return res.status(400).json({ error: `Cannot reveal results in state: ${gameState}` });
});

// ─── 4-ROUND STAGE & GAME CONTROL MATRIX ENDPOINTS ────────────────────────────

// 1. Matrix: Start Round (with 5s dramatic countdown)
app.post(['/api/host/round/start', '/host/round/start', '/round/start'], async (req, res) => {
  if (!verifyHost(req, res)) return;
  loadStateFromDisk();
  const roundNum = parseInt(req.body.round, 10);
  if (!roundNum || roundNum < 1 || roundNum > 4) {
    return res.status(400).json({ error: 'Round number must be 1, 2, 3, or 4.' });
  }

  const targetState = `round_${roundNum}_invest`;
  roundStatuses[roundNum] = 'countdown';
  projectorView = 'auto';
  io.emit('resume_projector_game', { state: targetState });
  updatePitchVisibilityOnRoundStart();
  io.emit('pitch_visibility_change', { pitchVisible, pitchMode });

  startRoundCountdown(targetState, () => {
    gameState = targetState;
    roundStatuses[roundNum] = 'active';
    projectorView = 'auto';
    for (const team of teams.values()) {
      team.lockedIn = false;
    }
    startTimer();
    broadcastState();
    broadcastLeaderboard();
  });

  await saveStateToRemote();
  return res.json({
    success: true,
    round: roundNum,
    status: 'countdown',
    seconds: 5,
    message: `Starting Round ${roundNum} with 5s countdown...`
  });
});

// 2. Matrix: Pause Active Timer
app.post(['/api/host/round/pause', '/host/round/pause', '/round/pause'], async (req, res) => {
  if (!verifyHost(req, res)) return;
  loadStateFromDisk();
  pauseTimer();
  const roundNum = currentRoundIndex();
  if (roundNum) roundStatuses[roundNum] = 'paused';
  await saveStateToRemote();
  return res.json({
    success: true,
    isPaused: true,
    remaining: timerRemaining,
    message: `Round ${roundNum || ''} timer PAUSED at ${timerRemaining}s.`
  });
});

// 3. Matrix: Resume Active Timer
app.post(['/api/host/round/resume', '/host/round/resume', '/round/resume'], async (req, res) => {
  if (!verifyHost(req, res)) return;
  loadStateFromDisk();
  resumeTimer();
  const roundNum = currentRoundIndex();
  if (roundNum) roundStatuses[roundNum] = 'active';
  await saveStateToRemote();
  return res.json({
    success: true,
    isPaused: false,
    remaining: timerRemaining,
    message: `Round ${roundNum || ''} timer RESUMED with ${timerRemaining}s remaining.`
  });
});

// 4. Matrix: End Round (Immediately Stop Timer & Lock Allocations)
app.post(['/api/host/round/end', '/host/round/end', '/round/end'], async (req, res) => {
  if (!verifyHost(req, res)) return;
  loadStateFromDisk();
  const reqRound = parseInt(req.body.round, 10);
  const roundNum = reqRound || currentRoundIndex();
  stopTimer();
  autoLockInvestments();
  if (roundNum) roundStatuses[roundNum] = 'ended';
  gameState = `round_${roundNum}_ended`;
  calculateResults(roundNum);
  io.emit('round_ended_buffer', {
    round: roundNum,
    nextRound: roundNum < 4 ? roundNum + 1 : null,
    message: `Round ${roundNum} Concluded! Entering next phase...`
  });
  broadcastState();
  broadcastLeaderboard();
  saveStateToRemote();
  return res.json({
    success: true,
    round: roundNum,
    state: gameState,
    message: `Round ${roundNum || ''} ended. All portfolios locked in (unallocated funds held as cash). Buffer screen active.`
  });
});

// 5. Matrix: Reveal Round Results & Bluff
app.post(['/api/host/round/reveal', '/host/round/reveal', '/round/reveal'], async (req, res) => {
  if (!verifyHost(req, res)) return;
  loadStateFromDisk();
  const reqRound = parseInt(req.body.round, 10);
  const roundNum = reqRound || currentRoundIndex() || 1;
  stopTimer();
  projectorView = 'reveal';
  gameState = `round_${roundNum}_results`;
  roundStatuses[roundNum] = 'ended';
  pitchVisible = true;
  io.emit('pitch_visibility_change', { pitchVisible, pitchMode });
  calculateResults(roundNum);
  broadcastState();
  broadcastLeaderboard();
  saveStateToRemote();
  return res.json({
    success: true,
    round: roundNum,
    state: gameState,
    message: `Results & Bluff revealed for Round ${roundNum}!`
  });
});

// 6. Matrix: Show Leaderboard
app.post(['/api/host/round/leaderboard', '/host/round/leaderboard', '/round/leaderboard'], async (req, res) => {
  if (!verifyHost(req, res)) return;
  loadStateFromDisk();
  const reqRound = parseInt(req.body.round, 10);
  const roundNum = reqRound || currentRoundIndex() || 1;
  const lb = getLeaderboard();
  projectorView = 'leaderboard';
  if (roundNum === 4) {
    gameState = 'game_over';
    io.emit('game_over', { leaderboard: lb });
  }
  // Dedicated event specifically for stage projector display (prevents phone flickering)
  io.emit('show_leaderboard', { round: roundNum, leaderboard: lb, isFinal: roundNum === 4 });
  broadcastLeaderboard();
  broadcastState();
  saveStateToRemote();
  return res.json({
    success: true,
    round: roundNum,
    leaderboard: lb
  });
});

// Dedicated Projector View Switcher Endpoint
app.post(['/api/host/projector/view', '/host/projector/view'], async (req, res) => {
  if (!verifyHost(req, res)) return;
  const { view } = req.body;
  const roundNum = currentRoundIndex() || 1;
  const lb = getLeaderboard();
  if (view === 'leaderboard') {
    projectorView = 'leaderboard';
    io.emit('show_leaderboard', { round: roundNum, leaderboard: lb, isFinal: roundNum === 4 });
  } else {
    projectorView = 'auto';
    io.emit('resume_projector_game', { state: gameState });
  }
  broadcastState();
  return res.json({ success: true, projectorView });
});

// Dedicated Host Trigger: Thank You for Playing celebratory broadcast
app.post(['/api/host/thank-you', '/host/thank-you', '/thank-you'], async (req, res) => {
  if (!verifyHost(req, res)) return;
  projectorView = 'thankyou';
  io.emit('show_thank_you', { message: 'Thank You for Playing!' });
  broadcastState();
  saveStateToRemote();
  return res.json({ success: true, message: '🎉 "Thank You for Playing" screen broadcast to all screens!' });
});

// Dedicated Host Trigger: Toggle / Show / Hide QR Modal on Stage Projector
let isProjectorQrShowing = false;
app.post(['/api/host/projector-qr-toggle', '/host/projector-qr-toggle'], (req, res) => {
  if (!verifyHost(req, res)) return;
  const { visible } = req.body || {};
  if (visible !== undefined) {
    isProjectorQrShowing = !!visible;
  } else {
    isProjectorQrShowing = !isProjectorQrShowing;
  }
  io.emit('projector_qr_toggle', { visible: isProjectorQrShowing });
  return res.json({ success: true, visible: isProjectorQrShowing });
});

// Host: Set Principle Starting Capital / Allocate Funds (Before round or tournament)
app.post(['/api/host/set-starting-capital', '/host/set-starting-capital', '/api/host/allocate-funds', '/host/allocate-funds'], async (req, res) => {
  if (!verifyHost(req, res)) return;
  loadStateFromDisk();
  const { amount } = req.body;
  const num = parseInt(amount, 10);
  if (!num || num <= 0 || isNaN(num)) {
    return res.status(400).json({ error: 'Starting capital must be a positive number.' });
  }

  STARTING_CAPITAL = num;
  calculatedRounds.clear();
  for (const k in roundResultsCache) delete roundResultsCache[k];

  // Update all registered teams' starting capital
  for (const team of teams.values()) {
    team.capital = STARTING_CAPITAL;
    team.isBankrupt = false;
    team.investments = {};
    team.history = [];
    team.lockedIn = false;
  }

  saveStateToRemote();
  broadcastState();
  broadcastLeaderboard();

  return res.json({
    success: true,
    startingCapital: STARTING_CAPITAL,
    teamCount: teams.size,
    message: `Principle Starting Capital set to ₹${STARTING_CAPITAL.toLocaleString('en-IN')} for all ${teams.size} teams!`
  });
});

// Reset Game
app.post(['/api/host/reset', '/host/reset', '/reset'], async (req, res) => {
  if (!verifyHost(req, res)) return;

  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
    countdownRemaining = 0;
    isCountingDown = false;
  }
  stopTimer();
  gameState = 'waiting';
  isProjectorQrShowing = false;
  teams = new Map();
  roundStatuses = { 1: 'pending', 2: 'pending', 3: 'pending', 4: 'pending' };
  calculatedRounds.clear();
  for (const k in roundResultsCache) delete roundResultsCache[k];
  timerRemaining = 0;
  timerTargetEnd = null;
  roundStartedAt = null;
  countdownStartedAt = null;
  countdownRemaining = 0;
  isCountingDown = false;
  pitchVisible = false;
  io.emit('pitch_visibility_change', { pitchVisible, pitchMode });

  await saveStateToRemote();
  broadcastState();
  broadcastLeaderboard();

  res.json({ success: true, message: 'Game successfully reset for next event session.' });
});

// Simulate Test Teams for Event Load Testing
app.post(['/api/host/simulate', '/host/simulate', '/simulate'], (req, res) => {
  if (!verifyHost(req, res)) return;
  const count = parseInt(req.body.count, 10) || 25;
  const prefixes = [
    'Apex', 'Vanguard', 'Blackrock', 'Nexus', 'Titan', 'Quantum', 'Pinnacle',
    'Velocity', 'Horizon', 'Synergy', 'Catalyst', 'Aegis', 'Fortress', 'Beacon',
    'Zenith', 'Ascent', 'Meridian', 'Cobalt', 'Polaris', 'Vector', 'Matrix'
  ];
  const suffixes = [
    'Capital', 'Ventures', 'Holdings', 'Equities', 'Partners', 'Fund',
    'Asset Management', 'Strategies', 'Wealth', 'Syndicate'
  ];
  const leaders = [
    'Aarav', 'Ananya', 'Rohan', 'Priya', 'Vikram', 'Neha', 'Kabir', 'Tanvi',
    'Aditya', 'Sneha', 'Arjun', 'Isha', 'Rahul', 'Diya', 'Karan'
  ];

  let added = 0;
  for (let i = 0; i < count; i++) {
    const p = prefixes[Math.floor(Math.random() * prefixes.length)];
    const s = suffixes[Math.floor(Math.random() * suffixes.length)];
    const num = Math.floor(10 + Math.random() * 89);
    const name = `${p} ${s} #${num}`;
    const leader = leaders[Math.floor(Math.random() * leaders.length)] + ' ' + String.fromCharCode(65 + (i % 26));
    const enroll = `2024${String(1000000 + i + Math.floor(Math.random() * 8999999)).slice(0, 7)}`;

    let exists = false;
    for (const t of teams.values()) {
      if (t.name.toLowerCase() === name.toLowerCase()) { exists = true; break; }
    }
    if (exists) continue;

    const teamId = uuidv4();
    const team = {
      id: teamId,
      name,
      leaderName: leader,
      enrollmentNo: enroll,
      password: '123',
      code: generateCode(),
      capital: STARTING_CAPITAL,
      investments: {},
      history: [],
      lockedIn: false,
      createdAt: Date.now(),
    };
    teams.set(teamId, team);
    added++;
  }

  broadcastState();
  broadcastLeaderboard();
  res.json({ success: true, added, totalTeams: teams.size });
});

// Auto-fill random investments for unsubmitted teams
app.post(['/api/host/simulate-investments', '/host/simulate-investments', '/simulate-investments'], (req, res) => {
  if (!verifyHost(req, res)) return;
  const roundNum = currentRoundIndex();
  if (!roundNum || !isInvestPhase()) {
    return res.status(400).json({ error: 'Must be in an investment phase to simulate allocations.' });
  }

  let count = 0;
  for (const team of teams.values()) {
    if (!team.investments[roundNum]) {
      const cuts = [0, 100, Math.floor(Math.random() * 101), Math.floor(Math.random() * 101), Math.floor(Math.random() * 101)];
      cuts.sort((a, b) => a - b);
      const alloc = [
        cuts[1] - cuts[0],
        cuts[2] - cuts[1],
        cuts[3] - cuts[2],
        cuts[4] - cuts[3],
      ];
      team.investments[roundNum] = alloc;
      team.lockedIn = true;
      count++;
    }
  }

  broadcastState();
  broadcastLeaderboard();
  res.json({ success: true, count, totalSubmitted: getSubmittedCount() });
});

// Export CSV for Event Organizers
app.get(['/api/host/export-csv', '/host/export-csv', '/export-csv'], (req, res) => {
  const lb = getLeaderboard();
  let csv = 'Rank,Team Name,Team Leader,Enrollment Number,Final Capital,Round 1 Return,Round 2 Return,Round 3 Return,Round 4 Return\n';
  lb.forEach((t) => {
    const team = teams.get(t.teamId);
    let r1 = '-', r2 = '-', r3 = '-', r4 = '-';
    if (team && team.history) {
      team.history.forEach((h) => {
        if (h.heldCash) {
          const str = '0% (Cash)';
          if (h.round === 1) r1 = str;
          if (h.round === 2) r2 = str;
          if (h.round === 3) r3 = str;
          if (h.round === 4) r4 = str;
        } else {
          const pct = Math.round(((h.capitalAfter - h.capitalBefore) / h.capitalBefore) * 100);
          const str = `${pct >= 0 ? '+' : ''}${pct}%`;
          if (h.round === 1) r1 = str;
          if (h.round === 2) r2 = str;
          if (h.round === 3) r3 = str;
          if (h.round === 4) r4 = str;
        }
      });
    }
    csv += `"${t.rank}","${t.name}","${t.leaderName || ''}","${team ? (team.enrollmentNo || '') : ''}","₹${t.capital}","${r1}","${r2}","${r3}","${r4}"\n`;
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="bluff_capital_event_standings.csv"');
  res.send(csv);
});

// ─── Socket.IO Real-time Connection ──────────────────────────────────────────
io.on('connection', (socket) => {
  const roundNum = currentRoundIndex();
  const roundData = roundNum ? getRoundData(roundNum) : null;

  let companies = null;
  if (roundData) {
    companies = roundData.companies.map((c) => ({
      name: c.name,
      shortName: c.shortName,
      icon: c.icon,
      pitch: c.pitch,
      hint: c.hint,
      ...(isResultsPhase() || gameState === 'game_over'
        ? { returnPct: c.returnPct, isBluff: !!c.isBluff }
        : {}),
    }));
  }

  socket.emit('state_change', {
    state: gameState,
    round: roundNum,
    theme: roundData ? roundData.theme : '',
    companies,
    timer: timerRemaining,
    timerRemaining,
    seconds: timerRemaining,
    total: TIMER_SECONDS,
    startingCapital: STARTING_CAPITAL,
    projectorView: projectorView || 'auto',
    teamCount: teams.size,
    totalTeams: teams.size,
    submittedCount: getSubmittedCount(),
  });

  socket.emit('leaderboard_update', { leaderboard: getLeaderboard() });

  socket.on('join', ({ teamId }) => {
    if (teamId && teams.has(teamId)) {
      socket.join(teamId);
    }
  });
});

// ─── Direct Page Routes ──────────────────────────────────────────────────────
app.get('/host', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'host.html'));
});

app.get('/projector', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'projector.html'));
});

// 404 fallback for unhandled API requests
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API endpoint ${req.method} ${req.url} not found` });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Server Start ────────────────────────────────────────────────────────────
if (require.main === module) {
  server.listen(PORT, () => {
    const localIp = getLocalIp();
    console.log(`=======================================================`);
    console.log(`🎯 BLUFF CAPITAL EVENT SERVER ACTIVE ON PORT ${PORT}`);
    console.log(`📱 Local URL:           http://localhost:${PORT}/`);
    console.log(`📶 Network URL for QR:  http://${localIp}:${PORT}/`);
    console.log(`💻 Host Dashboard:      http://localhost:${PORT}/host`);
    console.log(`📽️ Stage Projector:     http://localhost:${PORT}/projector`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
module.exports.server = server;
