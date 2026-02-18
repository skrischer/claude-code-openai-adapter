#!/usr/bin/env node
/**
 * Standalone server entry point
 *
 * Usage:
 *   npm run start
 *   node dist/server/standalone.js [port]
 *   node dist/server/standalone.js --cwd /path/to/dir [port]
 *   CLAUDE_CWD=/path/to/dir node dist/server/standalone.js [port]
 */

import { startServer, stopServer } from "./index.js";
import { verifyClaude, verifyAuth } from "../subprocess/manager.js";
import os from "os";

const DEFAULT_PORT = 3456;

/**
 * Parse CLI arguments for --cwd and port
 */
function parseArgs(argv: string[]): { port: number; cwd?: string } {
  const args = argv.slice(2);
  let cwd: string | undefined;
  let portStr: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--cwd" && i + 1 < args.length) {
      cwd = args[i + 1];
      i++; // skip next arg
    } else if (!args[i].startsWith("--")) {
      portStr = args[i];
    }
  }

  // Environment variable fallback
  cwd = cwd || process.env.CLAUDE_CWD;

  const port = parseInt(portStr || String(DEFAULT_PORT), 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(`Invalid port: ${portStr}`);
    process.exit(1);
  }

  return { port, cwd };
}

async function main(): Promise<void> {
  console.log("Claude Code CLI Provider - Standalone Server");
  console.log("============================================\n");

  const { port, cwd } = parseArgs(process.argv);

  // Verify Claude CLI
  console.log("Checking Claude CLI...");
  const cliCheck = await verifyClaude();
  if (!cliCheck.ok) {
    console.error(`Error: ${cliCheck.error}`);
    process.exit(1);
  }
  console.log(`  Claude CLI: ${cliCheck.version || "OK"}`);

  // Verify authentication
  console.log("Checking authentication...");
  const authCheck = await verifyAuth();
  if (!authCheck.ok) {
    console.error(`Error: ${authCheck.error}`);
    console.error("Please run: claude auth login");
    process.exit(1);
  }
  console.log("  Authentication: OK");
  console.log(`  Subprocess cwd: ${cwd || os.homedir()} ${cwd ? "(custom)" : "(default: home)"}\n`);

  // Start server
  try {
    await startServer({ port, cwd });
    console.log("\nServer ready. Test with:");
    console.log(`  curl -X POST http://localhost:${port}/v1/chat/completions \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"model": "claude-sonnet-4", "messages": [{"role": "user", "content": "Hello!"}]}'`);
    console.log("\nPress Ctrl+C to stop.\n");
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");
    await stopServer();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
