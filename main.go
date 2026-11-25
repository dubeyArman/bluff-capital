package main

import (
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
)

func main() {
	fmt.Println("==================================================")
	fmt.Println("🚀 Bluff Capital Universal Node.js Engine (Render)")
	fmt.Println("==================================================")

	// Step 1: Check node binary
	nodePath, err := exec.LookPath("node")
	if err != nil {
		fmt.Printf("[Launcher Error] 'node' not found in PATH: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("[Launcher] Node binary: %s\n", nodePath)

	// Step 2: Install dependencies if node_modules missing
	if _, err := os.Stat("node_modules"); os.IsNotExist(err) {
		fmt.Println("[Launcher] Installing packages via npm install --production...")
		installCmd := exec.Command("npm", "install", "--production")
		installCmd.Stdout = os.Stdout
		installCmd.Stderr = os.Stderr
		if err := installCmd.Run(); err != nil {
			fmt.Printf("[Launcher Warning] npm install returned: %v\n", err)
		} else {
			fmt.Println("[Launcher] Dependencies installed successfully.")
		}
	} else {
		fmt.Println("[Launcher] Dependencies already cached.")
	}

	// Step 3: Launch Node.js Game Server
	fmt.Println("[Launcher] Starting Server: node server/server.js")
	nodeCmd := exec.Command("node", "server/server.js")
	nodeCmd.Stdout = os.Stdout
	nodeCmd.Stderr = os.Stderr
	nodeCmd.Stdin = os.Stdin
	nodeCmd.Env = os.Environ()

	if err := nodeCmd.Start(); err != nil {
		fmt.Printf("[Launcher Error] Failed to start server: %v\n", err)
		os.Exit(1)
	}

	// Step 4: Graceful shutdown handler
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		sig := <-sigs
		fmt.Printf("[Launcher] Signal received: %v. Relaying to Node.js...\n", sig)
		if nodeCmd.Process != nil {
			_ = nodeCmd.Process.Signal(sig)
		}
	}()

	// Wait for server process
	if err := nodeCmd.Wait(); err != nil {
		fmt.Printf("[Launcher] Node server stopped: %v\n", err)
		os.Exit(1)
	}
}
