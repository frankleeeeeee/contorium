#!/usr/bin/env node
/**
 * Portable MCP entry for plugin hosts (Codex, Claude Code, Cursor).
 * Resolves server.js from this repo root via __dirname — no ${PLUGIN_ROOT} in args required.
 */
'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const pluginRoot = path.resolve(__dirname, '..');
const serverEntry = path.join(pluginRoot, 'packages', 'mcp', 'dist', 'server.js');

const child = spawn(process.execPath, [serverEntry], {
  stdio: 'inherit',
  env: process.env,
  cwd: pluginRoot,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on('error', (err) => {
  console.error('[contorium-mcp] failed to start:', err.message);
  process.exit(1);
});
