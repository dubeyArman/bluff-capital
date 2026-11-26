/* ============================================================================
   BLUFF CAPITAL — Mobile Client Application
   Built for 300+ Event Participants
   ============================================================================ */
(function () {
  'use strict';

  // ---- Tab-Isolated Session State ----
  // Using sessionStorage prevents multi-tab collisions on the same browser!
  let teamId = sessionStorage.getItem('bluff_teamId') || null;
  let teamName = sessionStorage.getItem('bluff_teamName') || '';
  let leaderName = sessionStorage.getItem('bluff_leaderName') || '';
  let enrollmentNo = sessionStorage.getItem('bluff_enrollmentNo') || '';
  let capital = parseFloat(sessionStorage.getItem('bluff_capital')) || 10000;
  let startingCapital = 10000;
  let currentRound = 1;
  let gameState = 'waiting';
  let allocations = [0, 0, 0, 0];
  let companies = [];
  let timerSeconds = 90;
  let locked = false;
  let previousScreen = null;
  let leaderboard = [];
  let pitchVisible = false;
  let isCountdownActive = false;

  const roundThemes = {
    1: 'Mobility & Electronics',
    2: 'Finance & Insurance',
    3: 'Health & Consumer',
    4: 'Resources & Space',
  };

  const defaultIcons = {
    'NovaCell Solid-State': '🔋',
    'VoltRide Mobility': '🛴',
    'ChipLink Packaging': '🔬',
    'TerraBattery Recycling': '♻️',
    'LedgerLoop Payroll': '📊',
    'Harbor Trade Finance': '🚢',
    'Meridian Wealth Advisors': '📈',
    'CoverNow Insurance': '🛡️',
    'DermaGlow Skincare': '✨',
    'PulseBand Wearables': '⌚',
    'CareBridge Telehealth': '🩺',
    'FreshRoute Cold Chain': '🚛',
    'HelioWater Desal': '💧',
    'AgriSense Drones': '🌾',
    'CopperRoots Mining': '⛏️',
    'OrbitLink Satellites': '🛰️',
  };

  // ---- Socket ----
  const socket = io({
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 800,
    reconnectionAttempts: Infinity,
  });

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ---- Initialization ----
  function init() {
    createTicker();
    bindEvents();
    setupSocket();

    // Unlock Web Audio on first user interaction (phone/desktop)
    ['pointerdown', 'touchstart', 'click'].forEach((evt) => {
      document.addEventListener(evt, () => getAudioContext(), { once: true, passive: true });
    });

    // Auto-restore session from sessionStorage
    if (teamId) {
      fetchTeam(teamId).then((team) => {
        if (team) {
          teamName = team.name;
          leaderName = team.leaderName || '';
          enrollmentNo = team.enrollmentNo || '';
          capital = team.capital;
          saveSession();
          fetchState().then(() => navigateByState());
        } else {
          clearSession();
          showScreen('register');
        }
      });
    } else {
      fetchState();
    }

    // Auto-sync polling every 2 seconds for serverless environments
    setInterval(fetchState, 2000);
  }

  function saveSession() {
    if (teamId) sessionStorage.setItem('bluff_teamId', teamId);
    if (teamName) sessionStorage.setItem('bluff_teamName', teamName);
    if (leaderName) sessionStorage.setItem('bluff_leaderName', leaderName);
    if (enrollmentNo) sessionStorage.setItem('bluff_enrollmentNo', enrollmentNo);
    sessionStorage.setItem('bluff_capital', capital);
  }

  function clearSession() {
    sessionStorage.removeItem('bluff_teamId');
    sessionStorage.removeItem('bluff_teamName');
    sessionStorage.removeItem('bluff_leaderName');
    sessionStorage.removeItem('bluff_enrollmentNo');
    sessionStorage.removeItem('bluff_capital');
    teamId = null;
    teamName = '';
    leaderName = '';
    enrollmentNo = '';
    capital = 10000;
  }

  // ---- Ticker background ----
  function createTicker() {
    const tickers = [
      'NURO ▲ 18.0%   QVLT ▲ 9.0%   ZNTH ▼ 100% [BLUFF]   PXPH ▲ 24.0%   GLDF ▼ 100% [BLUFF]   SWFT ▲ 14.0%   GRNC ▲ 7.0%',
      'URBN ▲ 11.0%   MDSN ▲ 21.0%   RBHL ▲ 16.0%   SKBR ▼ 100% [BLUFF]   SNGR ▲ 19.0%   LTHX ▼ 100% [BLUFF]   AQPR ▲ 8.0%',
      'BLUFF CAPITAL LIVE   •   4 ROUNDS   •   ₹10,000 STARTING CAPITAL   •   ONE BLUFF PER ROUND   •   HIGH STAKES PORTFOLIOS',
    ];
    const container = $('#ticker-bg');
    if (!container) return;
    container.innerHTML = '';
    tickers.forEach((text, i) => {
      const line = document.createElement('div');
      line.className = 'ticker-line';
      line.textContent = text + '      ' + text;
      line.style.top = (15 + i * 30) + '%';
      line.style.animationDuration = (35 + i * 15) + 's';
      line.style.animationDirection = i % 2 === 0 ? 'normal' : 'reverse';
      container.appendChild(line);
    });
  }

  // ---- Toast notifications ----
  function toast(message, type = 'info') {
    const container = $('#toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.remove();
    }, 3200);
  }

  // ---- REST API Helpers ----
  async function api(method, path, body) {
    try {
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch('/api' + path, opts);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    } catch (err) {
      toast(err.message, 'error');
      throw err;
    }
  }

  async function fetchState() {
    try {
      const data = await api('GET', '/state');
      if (!data) return null;
      const prevGameState = gameState;
      gameState = data.state;
      if (data.round) currentRound = data.round;
      if (data.companies) companies = data.companies;
      if (data.pitchVisible !== undefined) pitchVisible = data.pitchVisible;
      if (data.teamCount !== undefined) {
        if ($('#reg-team-count')) $('#reg-team-count').textContent = data.teamCount;
        if ($('#lobby-team-count')) $('#lobby-team-count').textContent = data.teamCount;
      }
      if (data.timerRemaining !== undefined && data.timerRemaining !== null) {
        timerSeconds = data.timerRemaining;
        updateTimerDisplay(timerSeconds);
      } else if (data.seconds !== undefined && data.seconds !== null) {
        timerSeconds = data.seconds;
        updateTimerDisplay(timerSeconds);
      }
      if (data.projectorView === 'thankyou') {
        showThankYouScreen();
        return data;
      }
      // If game state changed and team is in active session, auto navigate!
      if (teamId && prevGameState && prevGameState !== data.state) {
        navigateByState();
      }
      return data;
    } catch (e) {
      return null;
    }
  }

  async function fetchTeam(id) {
    try {
      return await api('GET', '/team/' + id);
    } catch (e) {
      return null;
    }
  }

  async function fetchLeaderboard() {
    try {
      const data = await api('GET', '/leaderboard');
      leaderboard = data.leaderboard || [];
      return leaderboard;
    } catch (e) {
      return [];
    }
  }

  // ---- Web Audio Synthesizer (Zero-Asset Offline SFX) ----
  let audioCtx = null;
  function getAudioContext() {
    try {
      if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) audioCtx = new AudioContext();
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      return audioCtx;
    } catch (e) {
      return null;
    }
  }

  function playCountdownBeep(freq = 600, duration = 0.16) {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  function playMarketOpenSound() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);
        gain.gain.setValueAtTime(0.22, ctx.currentTime + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.08);
        osc.stop(ctx.currentTime + i * 0.08 + 0.4);
      });
    } catch (e) {}
  }

  function playRoundEndChime() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = [
        { freq: 440.00, gain: 0.25, decay: 1.5 },
        { freq: 329.63, gain: 0.20, decay: 1.4 },
        { freq: 220.00, gain: 0.30, decay: 1.8 }
      ];
      notes.forEach((n) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(n.freq, now);
        gain.gain.setValueAtTime(n.gain, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + n.decay);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + n.decay + 0.1);
      });
    } catch (e) {}
  }

  // Handle Dramatic 5-Second Countdown
  function handleRoundCountdown(data) {
    const overlay = $('#countdown-overlay');
    const badge = $('#cd-round-badge');
    const theme = $('#cd-theme-name');
    const num = $('#cd-number');
    if (!overlay || !num) return;

    if (data.seconds > 0) {
      isCountdownActive = true;
      overlay.style.display = 'flex';
      if (badge) badge.textContent = `ROUND ${data.round || currentRound}`;
      if (theme) theme.textContent = data.theme || roundThemes[data.round] || '';
      num.textContent = data.seconds;
      num.classList.remove('go');
      num.style.animation = 'none';
      num.offsetHeight; // reflow to trigger pulsePop
      num.style.animation = 'pulsePop 0.5s ease-out';
      const freqs = { 5: 523, 4: 587, 3: 659, 2: 784, 1: 880 };
      playCountdownBeep(freqs[data.seconds] || 600, 0.16);
    } else {
      num.textContent = 'GO!';
      num.classList.add('go');
      num.style.animation = 'none';
      num.offsetHeight;
      num.style.animation = 'pulsePop 0.6s ease-out';
      playMarketOpenSound();
      setTimeout(() => {
        isCountdownActive = false;
        overlay.style.display = 'none';
      }, 700);
    }
  }

  // ---- Screen Navigation ----
  function showScreen(id) {
    $$('.screen').forEach((s) => s.classList.remove('active'));
    const screen = $('#screen-' + id);
    if (screen) {
      screen.classList.add('active');
      screen.style.animation = 'none';
      screen.offsetHeight;
      screen.style.animation = '';
    }
  }

  let lastInvestRoundRendered = null;

  function navigateByState() {
    if (!teamId) {
      showScreen('register');
      return;
    }

    if (gameState === 'waiting') {
      lastInvestRoundRendered = null;
      showScreen('lobby');
      updateLobby();
    } else if (gameState && gameState.endsWith('_invest')) {
      if (lastInvestRoundRendered !== currentRound) {
        lastInvestRoundRendered = currentRound;
        updateInvestScreen();
      }
      if (locked) {
        showScreen('waiting-results');
      } else {
        showScreen('invest');
      }
    } else if (gameState && (gameState.endsWith('_ended') || gameState.endsWith('_buffer'))) {
      lastInvestRoundRendered = null;
      updateBufferScreen();
      showScreen('round-buffer');
    } else if (gameState && gameState.endsWith('_results')) {
      lastInvestRoundRendered = null;
      const active = document.querySelector('.screen.active');
      if (!active || active.id !== 'screen-results') {
        showScreen('results');
      }
    } else if (gameState === 'game_over') {
      lastInvestRoundRendered = null;
      showGameOver();
    } else {
      showScreen('lobby');
      updateLobby();
    }
  }

  // ---- Events Setup ----
  function bindEvents() {
    // Auth Tabs
    $('#tab-register').addEventListener('click', () => {
      $('#tab-register').classList.add('active');
      $('#tab-login').classList.remove('active');
      $('#form-register').style.display = 'block';
      $('#form-login').style.display = 'none';
    });

    $('#tab-login').addEventListener('click', () => {
      $('#tab-login').classList.add('active');
      $('#tab-register').classList.remove('active');
      $('#form-login').style.display = 'block';
      $('#form-register').style.display = 'none';
    });

    // Register
    $('#btn-register').addEventListener('click', register);
    ['#reg-team-name', '#reg-leader-name', '#reg-enrollment', '#reg-password'].forEach((sel) => {
      const el = $(sel);
      if (el) {
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') register();
        });
      }
    });

    // Login
    $('#btn-login').addEventListener('click', login);
    ['#login-team-name', '#login-password'].forEach((sel) => {
      const el = $(sel);
      if (el) {
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') login();
        });
      }
    });

    // Logout
    $('#btn-logout').addEventListener('click', () => {
      clearSession();
      toast('Switched out of team.', 'info');
      showScreen('register');
    });

    // Lock Investment
    $('#btn-lock').addEventListener('click', lockInvestment);
  }

  // ---- Registration ----
  async function register() {
    const name = $('#reg-team-name').value.trim();
    const leader = $('#reg-leader-name').value.trim();
    const enrollment = $('#reg-enrollment') ? $('#reg-enrollment').value.trim() : '';
    const password = $('#reg-password').value.trim();

    if (!name) { toast('Please enter a team name', 'error'); return; }
    if (name.length < 2) { toast('Team name must be at least 2 characters', 'error'); return; }
    if (!leader) { toast('Please enter team leader name', 'error'); return; }

    // Validate Enrollment: Max 15 alphanumeric characters (Case-Insensitive)
    if (!enrollment) {
      toast('Please enter your enrollment number', 'error');
      return;
    }
    if (enrollment.length > 15) {
      toast('Enrollment must be at most 15 characters', 'error');
      return;
    }
    if (!/^[a-zA-Z0-9]{1,15}$/.test(enrollment)) {
      toast('Enrollment must contain only letters and numbers (max 15 characters)', 'error');
      return;
    }

    if (!password || password.length < 3) {
      toast('Password must be at least 3 characters', 'error');
      return;
    }

    // Device level check: warn if student already registered on this device
    const existingDeviceEnroll = localStorage.getItem('bluff_registered_enrollment');
    if (existingDeviceEnroll && existingDeviceEnroll !== enrollment) {
      const proceed = confirm(`Notice: An enrollment (${existingDeviceEnroll}) was already registered on this device. Multiple registrations from one student are prohibited. Do you wish to proceed?`);
      if (!proceed) return;
    }

    const btn = $('#btn-register');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Creating Syndicate...';

    try {
      const data = await api('POST', '/register', {
        name,
        leaderName: leader,
        enrollmentNo: enrollment,
        password,
      });
      teamId = data.teamId;
      teamName = data.name || name;
      leaderName = data.leaderName || leader;
      enrollmentNo = data.enrollmentNo || enrollment;
      capital = data.capital || 10000;
      saveSession();

      // Store device registration anchor
      localStorage.setItem('bluff_registered_enrollment', enrollmentNo);
      localStorage.setItem('bluff_registered_team', teamName);

      socket.emit('join', { teamId });
      toast('Welcome to the market, ' + teamName + '! 💼', 'success');

      await fetchState();
      navigateByState();
    } catch (e) {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Enter the Market';
    }
  }

  // ---- Login for Existing Team ----
  async function login() {
    const identifier = $('#login-team-name').value.trim();
    const password = $('#login-password').value.trim();

    if (!identifier) { toast('Please enter your team name or enrollment number', 'error'); return; }
    if (!password) { toast('Please enter your password', 'error'); return; }

    const btn = $('#btn-login');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Authenticating...';

    try {
      const data = await api('POST', '/login', { identifier, password });
      teamId = data.teamId;
      teamName = data.name;
      leaderName = data.leaderName || '';
      enrollmentNo = data.enrollmentNo || '';
      capital = data.capital || 10000;
      saveSession();

      socket.emit('join', { teamId });
      toast('Welcome back, ' + teamName + '! 🔑', 'success');

      await fetchState();
      navigateByState();
    } catch (e) {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Re-enter Market';
    }
  }

  function updateBufferScreen() {
    const roundNum = currentRound || 1;
    const badge = $('#buffer-round-badge');
    const num = $('#buffer-round-num');
    if (badge) badge.textContent = `Round ${roundNum} Concluded`;
    if (num) num.textContent = roundNum;
  }

  function showBankruptModal() {
    const modal = $('#bankrupt-modal');
    if (modal) modal.style.display = 'flex';
  }

  // ---- Lobby ----
  function updateLobby() {
    if ($('#lobby-team-name')) $('#lobby-team-name').textContent = teamName;
    if ($('#lobby-leader')) $('#lobby-leader').textContent = leaderName ? 'Leader: ' + leaderName : '';
    if ($('#lobby-enrollment')) $('#lobby-enrollment').textContent = enrollmentNo ? 'Enrollment: ' + enrollmentNo : '';
    if ($('#lobby-capital')) $('#lobby-capital').textContent = formatCurrency(capital);
    const roundNum = currentRound || 1;
    if ($('#lobby-waiting-text')) {
      $('#lobby-waiting-text').textContent = 'Waiting for the host to start Round ' + roundNum + '...';
    }
  }

  // ---- Investment Screen ----
  function updateInvestScreen() {
    const roundNum = currentRound;
    locked = false;
    allocations = [0, 0, 0, 0];

    if ($('#invest-round-badge')) $('#invest-round-badge').textContent = 'Round ' + roundNum;
    if ($('#invest-round-theme')) $('#invest-round-theme').textContent = roundThemes[roundNum] || '';
    if ($('#invest-capital')) {
      if (capital <= 0) {
        $('#invest-capital').innerHTML = `<span style="color:var(--red);">₹0</span> <span style="font-size:0.75rem;background:rgba(239,68,68,0.25);color:var(--red);padding:2px 8px;border-radius:6px;border:1px solid var(--red);font-weight:700;">EXHAUSTED</span>`;
      } else {
        $('#invest-capital').textContent = formatCurrency(capital);
        $('#invest-capital').style.color = '';
      }
    }

    // Render cards and controls synchronously immediately (ZERO lag / no blank screen)
    renderCompanyCards();
    updateAllocationBar();
    updateLockButton();

    // If capital exhausted, enforce spectator mode and display bankrupt modal
    if (capital <= 0) {
      showBankruptModal();
      $$('.invest-slider').forEach((s) => (s.disabled = true));
      $$('.invest-pct-input').forEach((s) => (s.disabled = true));
      $$('.btn-preset').forEach((b) => (b.disabled = true));
      const btn = $('#btn-lock');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '🚫 Oops! Better luck next time! Wait for tournament to end.';
        btn.style.background = '#451219';
        btn.style.borderColor = '#ef4444';
        btn.style.color = '#fca5a5';
      }
      let banner = $('#invest-bankrupt-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'invest-bankrupt-banner';
        banner.style.cssText = 'background:rgba(239,68,68,0.15);border:2px solid #ef4444;border-radius:12px;padding:1rem 1.25rem;margin-bottom:1.25rem;text-align:center;color:#fca5a5;font-weight:700;font-size:0.95rem;';
        banner.innerHTML = '⚠️ <strong>Oops! Better luck next time! Wait for tournament to end.</strong><br><span style="font-size:0.82rem;color:#94a3b8;font-weight:400;">Your capital has been exhausted. You cannot place investments in upcoming rounds.</span>';
        const container = $('.invest-container');
        if (container && container.firstChild) {
          container.insertBefore(banner, container.firstChild);
        }
      } else {
        banner.style.display = 'block';
      }
    } else {
      const banner = $('#invest-bankrupt-banner');
      if (banner) banner.style.display = 'none';
    }

    const fill = $('#timer-bar-fill');
    if (fill) {
      fill.style.width = '100%';
      fill.classList.remove('warning');
    }
    const timerDisplay = $('#timer-display');
    if (timerDisplay) timerDisplay.classList.remove('warning');
    if ($('#timer-value')) $('#timer-value').textContent = timerSeconds || 90;

    // Asynchronously check if team was already locked in this round (e.g. on page refresh mid-round)
    if (teamId) {
      fetchTeam(teamId).then((team) => {
        if (team && team.currentRoundInvested && team.allocations) {
          locked = true;
          allocations = team.allocations;
          for (let i = 0; i < 4; i++) syncInvestInputs(i);
          updateAllocationBar();
          updateLockButton();
          showWaitingResults();
        }
      }).catch(() => {});
    }
  }

  function renderCompanyCards() {
    const container = $('#company-cards');
    container.innerHTML = '';

    // Quick presets bar
    const presetsBar = document.createElement('div');
    presetsBar.className = 'presets-bar';
    presetsBar.innerHTML = `
      <span class="preset-label">Quick Allocations:</span>
      <button type="button" class="btn-preset" id="preset-25">25% Each</button>
      <button type="button" class="btn-preset" id="preset-autofill">+ Fill 100%</button>
      <button type="button" class="btn-preset" id="preset-clear">Reset 0%</button>
    `;
    container.appendChild(presetsBar);

    companies.forEach((company, i) => {
      const icon = company.icon || defaultIcons[company.name] || '📊';
      const displayName = company.name;
      const isPitchShown = pitchVisible || (gameState && gameState.endsWith('_results')) || gameState === 'game_over';
      const card = document.createElement('div');
      card.className = 'company-card';
      card.innerHTML = `
        <div class="company-card-header" data-index="${i}">
          <div class="company-icon">${icon}</div>
          <div class="company-info">
            <div class="company-name">${escapeHtml(displayName)}</div>
            ${company.hint ? `<div class="company-hint ${isPitchShown ? '' : 'hint-hidden'}" data-index="${i}">${isPitchShown ? '💡 Market Signal: ' + escapeHtml(company.hint) : '🔒 Market Signal will reveal after stage pitch'}</div>` : ''}
          </div>
          <div class="expand-toggle">▼</div>
        </div>
        <div class="company-pitch open ${isPitchShown ? '' : 'pitch-hidden'}" data-index="${i}">
          ${isPitchShown 
            ? '<strong>Pitch:</strong> ' + escapeHtml(company.pitch || '') 
            : '<div class="live-pitch-banner"><span class="pitch-mic">🎙️</span> <em>Organizer is pitching this venture live. Listen closely!</em></div>'}
        </div>
        <div class="company-invest">
          <input type="range" class="invest-slider" min="0" max="100" value="0" data-index="${i}">
          <div class="invest-input-wrap">
            <input type="number" class="invest-pct-input" min="0" max="100" value="0" data-index="${i}">
            <span class="invest-pct-label">%</span>
          </div>
          <span class="invest-amount" data-index="${i}">₹0</span>
        </div>
      `;
      container.appendChild(card);
    });

    presetsBar.querySelector('#preset-25').addEventListener('click', () => {
      if (locked) return;
      allocations = [25, 25, 25, 25];
      for (let i = 0; i < 4; i++) syncInvestInputs(i);
      updateAllocationBar();
      updateLockButton();
    });

    presetsBar.querySelector('#preset-autofill').addEventListener('click', () => {
      if (locked) return;
      const currentSum = allocations.reduce((a, b) => a + b, 0);
      if (currentSum >= 100) return;
      const remaining = 100 - currentSum;
      const zeroIndices = [];
      allocations.forEach((v, idx) => { if (v === 0) zeroIndices.push(idx); });
      if (zeroIndices.length > 0) {
        const share = Math.floor(remaining / zeroIndices.length);
        const remainder = remaining % zeroIndices.length;
        zeroIndices.forEach((idx, i) => {
          allocations[idx] = share + (i === 0 ? remainder : 0);
        });
      } else {
        allocations[0] += remaining;
      }
      for (let i = 0; i < 4; i++) syncInvestInputs(i);
      updateAllocationBar();
      updateLockButton();
    });

    presetsBar.querySelector('#preset-clear').addEventListener('click', () => {
      if (locked) return;
      allocations = [0, 0, 0, 0];
      for (let i = 0; i < 4; i++) syncInvestInputs(i);
      updateAllocationBar();
      updateLockButton();
    });

    container.querySelectorAll('.company-card-header').forEach((header) => {
      header.addEventListener('click', () => {
        const idx = header.dataset.index;
        const pitch = container.querySelector('.company-pitch[data-index="' + idx + '"]');
        const toggle = header.querySelector('.expand-toggle');
        if (pitch) {
          pitch.classList.toggle('open');
          toggle.classList.toggle('open');
        }
      });
    });

    container.querySelectorAll('.invest-slider').forEach((slider) => {
      slider.addEventListener('input', (e) => {
        if (locked) return;
        const idx = parseInt(e.target.dataset.index, 10);
        const val = parseInt(e.target.value, 10) || 0;
        allocations[idx] = val;
        syncInvestInputs(idx);
        updateAllocationBar();
        updateLockButton();
      });
    });

    container.querySelectorAll('.invest-pct-input').forEach((input) => {
      input.addEventListener('input', (e) => {
        if (locked) return;
        const idx = parseInt(e.target.dataset.index, 10);
        let val = parseInt(e.target.value, 10);
        if (isNaN(val)) val = 0;
        if (val < 0) val = 0;
        if (val > 100) val = 100;
        allocations[idx] = val;
        const slider = container.querySelector('.invest-slider[data-index="' + idx + '"]');
        const amount = container.querySelector('.invest-amount[data-index="' + idx + '"]');
        if (slider) slider.value = val;
        if (amount) amount.textContent = formatCurrency(Math.round((capital * val) / 100));
        updateAllocationBar();
        updateLockButton();
      });
      input.addEventListener('blur', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        e.target.value = allocations[idx];
      });
    });
  }

  function updatePitchesVisibilityOnCards() {
    const isPitchShown = pitchVisible || (gameState && gameState.endsWith('_results')) || gameState === 'game_over';
    companies.forEach((company, i) => {
      const pitchEl = document.querySelector(`.company-pitch[data-index="${i}"]`);
      const hintEl = document.querySelector(`.company-hint[data-index="${i}"]`);

      if (pitchEl) {
        if (isPitchShown) {
          pitchEl.classList.remove('pitch-hidden');
          pitchEl.classList.add('pitch-revealed');
          pitchEl.innerHTML = '<strong>Pitch:</strong> ' + escapeHtml(company.pitch || '');
        } else {
          pitchEl.classList.add('pitch-hidden');
          pitchEl.classList.remove('pitch-revealed');
          pitchEl.innerHTML = '<div class="live-pitch-banner"><span class="pitch-mic">🎙️</span> <em>Organizer is pitching this venture live. Listen closely!</em></div>';
        }
      }

      if (hintEl) {
        if (isPitchShown) {
          hintEl.classList.remove('hint-hidden');
          hintEl.classList.add('hint-revealed');
          hintEl.innerHTML = '💡 Market Signal: ' + escapeHtml(company.hint || '');
        } else {
          hintEl.classList.add('hint-hidden');
          hintEl.classList.remove('hint-revealed');
          hintEl.innerHTML = '🔒 Market Signal will reveal after stage pitch';
        }
      }
    });
  }

  function syncCashCard() {
    // Safe Cash Reserve controller removed per participant UI requirement
  }

  function syncInvestInputs(idx) {
    const slider = document.querySelector('.invest-slider[data-index="' + idx + '"]');
    const input = document.querySelector('.invest-pct-input[data-index="' + idx + '"]');
    const amount = document.querySelector('.invest-amount[data-index="' + idx + '"]');
    if (slider) slider.value = allocations[idx];
    if (input) input.value = allocations[idx];
    const base = capital > 0 ? capital : (startingCapital || 10000);
    const stake = Math.round((base * allocations[idx]) / 100);
    if (amount) {
      if (capital <= 0) {
        amount.innerHTML = `${formatCurrency(stake)} <small style="color:var(--red);font-size:0.75rem;">(Debt Margin)</small>`;
      } else {
        amount.textContent = formatCurrency(stake);
      }
    }
  }

  function updateAllocationBar() {
    const total = allocations.reduce((s, v) => s + v, 0);
    const pct = Math.min(total, 100);

    const fill = $('#allocation-fill');
    if (fill) {
      fill.style.width = pct + '%';
      if (total <= 100) {
        fill.classList.add('valid');
        fill.classList.remove('exceeded');
      } else {
        fill.classList.remove('valid');
        fill.classList.add('exceeded');
      }
    }
    if ($('#allocation-pct')) $('#allocation-pct').textContent = total;

    const hint = $('#allocation-hint');
    if (hint) {
      if (total > 100) {
        hint.textContent = '⚠️ Allocations exceed 100% by ' + (total - 100) + '% (Reduce to lock in)';
        hint.style.color = 'var(--red)';
      } else if (total === 100) {
        hint.textContent = '✓ 100% Invested in Ventures (0% Cash Retained)';
        hint.style.color = 'var(--green)';
      } else if (total > 0) {
        const cashLeft = 100 - total;
        hint.textContent = `✓ ${total}% in Ventures | ${cashLeft}% Retained as Safe Cash`;
        hint.style.color = 'var(--gold)';
      } else {
        hint.textContent = '✓ 0% in Ventures | 100% Retained as Safe Cash';
        hint.style.color = 'var(--gold)';
      }
    }
  }

  function updateLockButton() {
    const total = allocations.reduce((s, v) => s + v, 0);
    const btn = $('#btn-lock');
    if (!btn) return;

    if (capital <= 0) {
      btn.disabled = true;
      btn.innerHTML = '🚫 Oops! Better luck next time! Wait for tournament to end.';
      return;
    }

    if (locked) {
      btn.disabled = true;
      btn.innerHTML = '<span class="lock-icon">🔒</span> Portfolio Locked In';
      return;
    }

    if (total > 100) {
      btn.disabled = true;
      btn.innerHTML = '<span class="lock-icon">⚠️</span> Exceeds 100% (Reduce by ' + (total - 100) + '%)';
    } else if (total === 100) {
      btn.disabled = false;
      btn.innerHTML = '<span class="lock-icon">🔒</span> Lock In 100% Investment';
    } else if (total > 0) {
      const cashLeft = 100 - total;
      btn.disabled = false;
      btn.innerHTML = '<span class="lock-icon">🔒</span> Lock In (' + total + '% Invested, ' + cashLeft + '% Cash)';
    } else {
      btn.disabled = false;
      btn.innerHTML = '<span class="lock-icon">🔒</span> Lock In 0% (Keep 100% Cash)';
    }
  }

  async function lockInvestment() {
    if (capital <= 0) {
      showBankruptModal();
      toast('Oops! Better luck next time! Wait for tournament to end.', 'error');
      return;
    }
    const total = allocations.reduce((s, v) => s + v, 0);
    if (total < 0 || total > 100) {
      toast('Allocations cannot exceed 100% (currently ' + total + '%)', 'error');
      return;
    }

    const btn = $('#btn-lock');
    btn.disabled = true;
    btn.innerHTML = '<span class="lock-icon">⏳</span> Locking In...';

    try {
      await api('POST', '/invest', { teamId, allocations });
      locked = true;
      updateLockButton();
      $$('.invest-slider').forEach((s) => (s.disabled = true));
      $$('.invest-pct-input').forEach((s) => (s.disabled = true));
      const cashLeft = 100 - total;
      toast(`Portfolio locked in! (${total}% Invested, ${cashLeft}% Cash Retained) 📈`, 'success');
      showWaitingResults();
    } catch (e) {
      btn.disabled = false;
      updateLockButton();
      toast(e.message || 'Failed to lock in portfolio', 'error');
    }
  }

  // ---- Waiting for Reveal ----
  function showWaitingResults() {
    const container = $('#investment-summary');
    if (!container) return;
    container.innerHTML = '';

    const total = allocations.reduce((s, v) => s + v, 0);
    const cashPct = 100 - total;
    const base = capital > 0 ? capital : (startingCapital || 10000);

    companies.forEach((company, i) => {
      const row = document.createElement('div');
      row.className = 'invest-summary-row';
      const amt = Math.round((base * allocations[i]) / 100);
      const icon = company.icon || defaultIcons[company.name] || '📊';
      row.innerHTML = `
        <span class="invest-summary-name">${icon} ${escapeHtml(company.name)}</span>
        <span class="invest-summary-value">${allocations[i]}% (${formatCurrency(amt)}${capital <= 0 ? ' Margin' : ''})</span>
      `;
      container.appendChild(row);
    });

    if (cashPct > 0) {
      const cashAmt = Math.round((base * cashPct) / 100);
      const cashRow = document.createElement('div');
      cashRow.className = 'invest-summary-row';
      cashRow.style.borderTop = '1px dashed rgba(255,255,255,0.15)';
      cashRow.style.paddingTop = '8px';
      cashRow.style.marginTop = '6px';
      cashRow.innerHTML = `
        <span class="invest-summary-name">💰 Retained Safe Cash</span>
        <span class="invest-summary-value" style="color:var(--gold);">${cashPct}% (${formatCurrency(cashAmt)})</span>
      `;
      container.appendChild(cashRow);
    }

    showScreen('waiting-results');
  }

  // ---- Results Reveal Screen ----
  function showResults(data) {
    let myResult = null;
    if (data.teamResultsMap && teamId && data.teamResultsMap[teamId]) {
      myResult = data.teamResultsMap[teamId];
    } else if (data.teamResults && teamId) {
      myResult = data.teamResults.find((t) => t.teamId === teamId);
    }

    const heldCash = myResult ? (myResult.heldCash || (myResult.allocations && myResult.allocations.every((v) => v === 0))) : false;
    const companyResults = myResult ? myResult.companyResults : null;
    const oldCap = myResult ? myResult.capitalBefore : capital;
    const newCap = myResult ? myResult.capitalAfter : capital;

    $('#results-title').textContent = 'Round ' + (data.round || currentRound) + ' Market Results';

    const banner = $('#results-cash-banner');
    if (banner) {
      if (heldCash) {
        banner.style.display = 'block';
        banner.textContent = '💼 Zero Investment Strategy: Held 100% Cash (₹0 Risk Taken)';
      } else {
        banner.style.display = 'none';
      }
    }

    const container = $('#results-cards');
    container.innerHTML = '';

    const listToRender = companyResults || data.companies || [];
    const baseCapForCalc = oldCap > 0 ? oldCap : (startingCapital || 10000);

    listToRender.forEach((cRes, i) => {
      const isBluff = cRes.isBluff || cRes.returnPct === -100;
      const isGain = !isBluff && cRes.returnPct >= 0;
      const allocPct = cRes.allocated !== undefined ? cRes.allocated : (allocations[i] || 0);
      const investedAmt = cRes.amountInvested !== undefined ? cRes.amountInvested : Math.round((baseCapForCalc * allocPct) / 100);
      const gained = cRes.gained !== undefined ? cRes.gained : (isBluff ? -investedAmt : Math.round((investedAmt * cRes.returnPct) / 100));
      const icon = cRes.icon || defaultIcons[cRes.name] || '📊';

      const card = document.createElement('div');
      card.className = 'result-card' + (isBluff ? ' bluff' : isGain ? ' gain' : ' loss');
      card.innerHTML = `
        <div class="result-card-icon">${icon}</div>
        <div class="result-card-info">
          <div class="result-card-name">${escapeHtml(cRes.name)}</div>
          <div class="result-card-invested">Stake: ${allocPct}% (${formatCurrency(investedAmt)})</div>
        </div>
        ${
          isBluff
            ? '<div class="bankrupt-stamp">BANKRUPT (-100%)</div>'
            : `<div>
                 <div class="result-card-return ${isGain ? 'gain' : 'loss'}">
                   ${isGain ? '▲ +' : '▼ '}${cRes.returnPct}%
                 </div>
                 <div class="result-card-gain-loss">
                   ${gained >= 0 ? '+' : ''}${formatCurrency(gained)}
                 </div>
               </div>`
        }
      `;
      container.appendChild(card);
      setTimeout(() => card.classList.add('revealed'), 350 * (i + 1));
    });

    const capEl = $('#result-new-capital');
    animateCounter(capEl, oldCap, newCap, 1400);
    if (newCap < 0) {
      capEl.style.color = 'var(--red)';
    } else if (newCap > oldCap) {
      capEl.style.color = 'var(--green)';
    } else if (newCap < oldCap) {
      capEl.style.color = 'var(--red)';
    } else {
      capEl.style.color = 'var(--gold)';
    }

    capital = newCap;
    saveSession();

    if (newCap <= 0) {
      setTimeout(() => {
        showBankruptModal();
      }, 1600);
    }

    const isFinalRound = (data.round && data.round >= 4) || currentRound >= 4 || gameState === 'game_over';

    if (isFinalRound) {
      if ($('#results-next-status')) {
        $('#results-next-status').textContent = 'Tournament Concluded! Check the Stage Screen for Final Standings & Podium.';
      }
      setTimeout(() => {
        showGameOver();
      }, 4000);
    } else {
      const nextR = (data.round || currentRound) + 1;
      if ($('#results-next-status')) {
        $('#results-next-status').textContent = `Round ${data.round || currentRound} Concluded! Waiting for Host to start Round ${nextR}...`;
      }
    }

    showScreen('results');
  }

  // ---- Awaiting Final Results (Replaces phone leaderboard for final round) ----
  function showGameOver() {
    if ($('#awaiting-team-name')) $('#awaiting-team-name').textContent = teamName || 'Your Syndicate';
    if ($('#awaiting-leader-name')) $('#awaiting-leader-name').textContent = leaderName ? 'Leader: ' + leaderName : '';
    if ($('#awaiting-enrollment')) $('#awaiting-enrollment').textContent = enrollmentNo ? 'Enrollment: ' + enrollmentNo : '';
    if ($('#awaiting-final-capital')) {
      if (capital < 0) {
        $('#awaiting-final-capital').innerHTML = `<span style="color:var(--red);">${formatCurrency(capital)}</span> <span style="font-size:0.85rem;color:var(--red);background:rgba(239,68,68,0.2);padding:2px 8px;border-radius:6px;border:1px solid var(--red);font-weight:700;">DEBT</span>`;
      } else {
        $('#awaiting-final-capital').textContent = formatCurrency(capital);
      }
    }

    showScreen('gameover');
  }

  // ---- Celebratory Thank You for Playing Screen ----
  function showThankYouScreen() {
    if ($('#ty-team-name')) $('#ty-team-name').textContent = teamName || 'Your Syndicate';
    if ($('#ty-leader-name')) $('#ty-leader-name').textContent = leaderName ? 'Leader: ' + leaderName : '';
    if ($('#ty-enrollment')) $('#ty-enrollment').textContent = enrollmentNo ? 'Enrollment: ' + enrollmentNo : '';
    if ($('#ty-final-capital')) {
      if (capital < 0) {
        $('#ty-final-capital').innerHTML = `<span style="color:var(--red);">${formatCurrency(capital)}</span> <span style="font-size:0.85rem;color:var(--red);background:rgba(239,68,68,0.2);padding:2px 8px;border-radius:6px;border:1px solid var(--red);font-weight:700;">DEBT</span>`;
      } else {
        $('#ty-final-capital').textContent = formatCurrency(capital);
      }
    }
    showScreen('thankyou');
    startConfetti();
  }

  // ---- Confetti Canvas ----
  function startConfetti() {
    const canvas = $('#confetti-canvas');
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    const pieces = [];
    const colors = ['#f5a623', '#ffd700', '#22c55e', '#ef4444', '#3b82f6', '#a855f7'];

    for (let i = 0; i < 180; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        w: Math.random() * 8 + 4,
        h: Math.random() * 5 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 3 + 2,
        rot: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 8,
      });
    }

    let frame = 0;
    function animate() {
      if (frame > 350) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rotSpeed;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frame++;
      requestAnimationFrame(animate);
    }
    animate();
  }

  // ---- Socket.IO Listeners ----
  function setupSocket() {
    socket.on('connect', () => {
      if (teamId) socket.emit('join', { teamId });
    });

    // Dramatic 5-4-3-2-1 Countdown before each round begins
    socket.on('round_countdown', (data) => {
      handleRoundCountdown(data);
    });

    socket.on('pitch_visibility_change', (data) => {
      const prev = pitchVisible;
      pitchVisible = !!data.pitchVisible;
      updatePitchesVisibilityOnCards();
      if (!prev && pitchVisible && gameState && gameState.endsWith('_invest')) {
        toast('📢 Organizer unlocked venture pitches & market signals! 💡', 'success');
        playMarketOpenSound();
      }
    });

    socket.on('state_change', (data) => {
      gameState = data.state;
      if (data.round) currentRound = data.round;
      if (data.companies) companies = data.companies;
      if (data.pitchVisible !== undefined) pitchVisible = data.pitchVisible;
      if (data.seconds !== undefined && data.seconds !== null && data.seconds > 0) {
        timerSeconds = data.seconds;
      }
      if (data.teamCount !== undefined) {
        if ($('#reg-team-count')) $('#reg-team-count').textContent = data.teamCount;
        if ($('#lobby-team-count')) $('#lobby-team-count').textContent = data.teamCount;
      }

      // Hide countdown overlay only if not actively animating
      if (!isCountdownActive) {
        const overlay = $('#countdown-overlay');
        if (overlay) overlay.style.display = 'none';
      }

      if (!teamId) return;

      // Navigate right away with zero network latency
      navigateByState();
      updatePitchesVisibilityOnCards();

      // Refresh team details in background
      fetchTeam(teamId).then((team) => {
        if (team) {
          capital = team.capital;
          teamName = team.name;
          leaderName = team.leaderName || '';
          saveSession();
          if ($('#invest-capital')) {
      if (capital < 0) {
        $('#invest-capital').innerHTML = `<span style="color:var(--red);">${formatCurrency(capital)}</span> <span style="font-size:0.75rem;background:rgba(239,68,68,0.25);color:var(--red);padding:2px 8px;border-radius:6px;border:1px solid var(--red);font-weight:700;">DEBT</span>`;
      } else {
        $('#invest-capital').textContent = formatCurrency(capital);
        $('#invest-capital').style.color = '';
      }
    }
          if ($('#lobby-capital')) $('#lobby-capital').textContent = formatCurrency(capital);
        }
      }).catch(() => {});
    });

    socket.on('timer_paused', (data) => {
      const display = $('#timer-display');
      const value = $('#timer-value');
      if (value) value.textContent = 'PAUSED';
      if (display) display.classList.add('paused');
      toast('⏸ Host paused the investment timer.', 'info');
    });

    socket.on('timer_resumed', (data) => {
      const display = $('#timer-display');
      if (display) display.classList.remove('paused');
      toast('▶ Investment timer resumed!', 'success');
    });

    socket.on('timer_tick', (data) => {
      const fill = $('#timer-bar-fill');
      const display = $('#timer-display');
      const value = $('#timer-value');

      if (data.isPaused) {
        if (value) value.textContent = 'PAUSED';
        if (display) display.classList.add('paused');
        return;
      } else {
        if (display) display.classList.remove('paused');
      }

      timerSeconds = data.seconds !== undefined ? data.seconds : data.remaining;
      const total = data.total || 90;
      const pct = Math.max(0, (timerSeconds / total) * 100);

      if (fill) fill.style.width = pct + '%';
      if (value) value.textContent = timerSeconds;

      if (timerSeconds <= 15) {
        if (fill) fill.classList.add('warning');
        if (display) display.classList.add('warning');
      } else {
        if (fill) fill.classList.remove('warning');
        if (display) display.classList.remove('warning');
      }

      if (timerSeconds <= 0 && !locked && gameState && gameState.endsWith('_invest')) {
        const totalAlloc = allocations.reduce((s, v) => s + v, 0);
        if (totalAlloc > 0 && totalAlloc <= 100) {
          lockInvestment();
        } else {
          toast("⏰ Time's up! Zero allocations made — holding 100% Cash.", 'info');
          locked = true;
          showWaitingResults();
        }
      }
    });

    socket.on('results_reveal', (data) => {
      showResults(data);
    });

    socket.on('leaderboard_update', (data) => {
      leaderboard = data.leaderboard || [];
      if ($('#screen-leaderboard') && $('#screen-leaderboard').classList.contains('active')) {
        renderLeaderboard($('#leaderboard-list'));
      }
    });

    socket.on('round_ended_buffer', (data) => {
      if (data && data.round) currentRound = data.round;
      playRoundEndChime();
      updateBufferScreen();
      showScreen('round-buffer');
    });

    socket.on('game_over', (data) => {
      gameState = 'game_over';
      if (data && data.leaderboard) leaderboard = data.leaderboard;
      showGameOver();
    });

    socket.on('show_thank_you', () => {
      showThankYouScreen();
    });

    socket.on('disconnect', () => {
      toast('Network disconnected. Reconnecting...', 'error');
    });

    socket.on('reconnect', () => {
      toast('Connected to Market Server!', 'success');
      if (teamId) socket.emit('join', { teamId });
      fetchState().then(() => {
        if (teamId) navigateByState();
      });
    });
  }

  // ---- Utility Helpers ----
  function formatCurrency(amount) {
    const val = Math.round(amount);
    if (val < 0) {
      return '-₹' + Math.abs(val).toLocaleString('en-IN');
    }
    return '₹' + val.toLocaleString('en-IN');
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function animateCounter(el, from, to, duration) {
    if (!el) return;
    const start = performance.now();
    const diff = to - from;
    function step(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + diff * eased);
      el.textContent = formatCurrency(current);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
