#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const pluginDir = repoRoot;
const errors = [];
const warnings = [];

const pluginNamePattern = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath, context) {
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    addError(`${context} is missing: ${filePath}`);
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    addError(`${context} contains invalid JSON (${filePath}): ${error.message}`);
    return null;
  }
}

function parseFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return null;
  }
  const closingIndex = normalized.indexOf('\n---\n', 4);
  if (closingIndex === -1) {
    return null;
  }
  const block = normalized.slice(4, closingIndex);
  const fields = {};
  for (const line of block.split('\n')) {
    const sep = line.indexOf(':');
    if (sep === -1) {
      continue;
    }
    fields[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
  }
  return fields;
}

async function walkFiles(dirPath) {
  const files = [];
  const stack = [dirPath];
  while (stack.length) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }
  return files;
}

function isSafeRelativePath(value) {
  if (typeof value !== 'string' || !value.length) {
    return false;
  }
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return true;
  }
  const normalized = path.posix.normalize(value.replace(/\\/g, '/'));
  return !normalized.startsWith('../') && normalized !== '..';
}

async function validateReferencedPath(fieldName, pathValue, pluginName) {
  if (pathValue.startsWith('http://') || pathValue.startsWith('https://')) {
    return;
  }
  if (!isSafeRelativePath(pathValue)) {
    addError(`${pluginName}: "${fieldName}" has invalid path "${pathValue}"`);
    return;
  }
  const resolved = path.resolve(pluginDir, pathValue);
  if (!(await pathExists(resolved))) {
    addError(`${pluginName}: "${fieldName}" references missing path "${pathValue}"`);
  }
}

async function validateFrontmatterFile(filePath, componentName, requiredKeys, pluginName) {
  const content = await fs.readFile(filePath, 'utf8');
  const parsed = parseFrontmatter(content);
  const rel = path.relative(repoRoot, filePath);
  if (!parsed) {
    addError(`${pluginName}: ${componentName} missing YAML frontmatter: ${rel}`);
    return;
  }
  for (const key of requiredKeys) {
    if (!parsed[key]) {
      addError(`${pluginName}: ${componentName} missing "${key}" in frontmatter: ${rel}`);
    }
  }
}

function extractMcpServers(config) {
  if (!config || typeof config !== 'object') {
    return null;
  }
  if (config.mcpServers && typeof config.mcpServers === 'object') {
    return config.mcpServers;
  }
  const flat = {};
  for (const [name, entry] of Object.entries(config)) {
    if (entry && typeof entry === 'object' && ('command' in entry || 'url' in entry || 'type' in entry)) {
      flat[name] = entry;
    }
  }
  return Object.keys(flat).length ? flat : null;
}

async function validateMcpJson(filePath, pluginName, formatHint) {
  const config = await readJsonFile(filePath, `${formatHint} MCP config`);
  if (!config) {
    return;
  }
  const servers = extractMcpServers(config);
  if (!servers) {
    addError(`${pluginName}: ${path.basename(filePath)} must define MCP servers (flat or mcpServers wrapper)`);
    return;
  }
  for (const [name, entry] of Object.entries(servers)) {
    if (!entry || typeof entry !== 'object') {
      addError(`${pluginName}: MCP server "${name}" must be an object`);
      continue;
    }
    const isHttpLike = entry.type === 'http' || entry.type === 'sse' || entry.type === 'ws' || entry.url;
    if (isHttpLike) {
      if (typeof entry.url !== 'string' || !entry.url.length) {
        addError(`${pluginName}: MCP server "${name}" must include a non-empty "url"`);
      }
      continue;
    }
    if (typeof entry.command !== 'string' || !entry.command.length) {
      addError(`${pluginName}: MCP server "${name}" must include a non-empty "command"`);
    }
    if (entry.args !== undefined && !Array.isArray(entry.args)) {
      addError(`${pluginName}: MCP server "${name}" args must be an array when present`);
    }
  }
}

async function validateComponents(pluginName) {
  const rulesDir = path.join(pluginDir, 'rules');
  if (await pathExists(rulesDir)) {
    for (const file of await walkFiles(rulesDir)) {
      const ext = path.extname(file).toLowerCase();
      if (ext === '.md' || ext === '.mdc' || ext === '.markdown') {
        await validateFrontmatterFile(file, 'rule', ['description'], pluginName);
      }
    }
  }

  const skillsDir = path.join(pluginDir, 'skills');
  if (await pathExists(skillsDir)) {
    for (const file of await walkFiles(skillsDir)) {
      if (path.basename(file) === 'SKILL.md') {
        await validateFrontmatterFile(file, 'skill', ['name', 'description'], pluginName);
      }
    }
  }

  const commandsDir = path.join(pluginDir, 'commands');
  if (await pathExists(commandsDir)) {
    for (const file of await walkFiles(commandsDir)) {
      const ext = path.extname(file).toLowerCase();
      if (ext === '.md' || ext === '.mdc' || ext === '.markdown' || ext === '.txt') {
        await validateFrontmatterFile(file, 'command', ['name', 'description'], pluginName);
      }
    }
  }
}

async function validateManifest(manifestPath, platformLabel, pathFields) {
  const manifest = await readJsonFile(manifestPath, `${platformLabel} manifest`);
  if (!manifest) {
    return null;
  }

  const pluginName = manifest.name ?? platformLabel;
  if (typeof manifest.name !== 'string' || !pluginNamePattern.test(manifest.name)) {
    addError(`${platformLabel}: plugin.json "name" must be lowercase kebab-case.`);
  }

  for (const field of pathFields) {
    const value = manifest[field];
    if (typeof value === 'string') {
      const normalized = value.replace(/^\.\//, '').replace(/\/$/, '');
      await validateReferencedPath(field, normalized, pluginName);
      if (field === 'mcpServers' && normalized.endsWith('.json')) {
        await validateMcpJson(path.resolve(pluginDir, normalized), pluginName, platformLabel);
      }
    }
  }

  return pluginName;
}

async function main() {
  const cursorManifest = path.join(pluginDir, '.cursor-plugin', 'plugin.json');
  const claudeManifest = path.join(pluginDir, '.claude-plugin', 'plugin.json');
  const codexManifest = path.join(pluginDir, '.codex-plugin', 'plugin.json');

  const cursorName = await validateManifest(cursorManifest, 'Cursor', [
    'logo',
    'rules',
    'skills',
    'commands',
    'mcpServers',
  ]);
  const claudeName = await validateManifest(claudeManifest, 'Claude Code', ['skills', 'mcpServers']);
  const codexName = await validateManifest(codexManifest, 'Codex', ['skills', 'mcpServers']);

  if (!(await pathExists(claudeManifest))) {
    addError('Claude Code manifest missing: .claude-plugin/plugin.json');
  } else if (!(await pathExists(path.join(pluginDir, '.mcp.claude.json')))) {
    addWarning('Claude Code: .mcp.claude.json missing (referenced by mcpServers).');
  }

  if (!(await pathExists(codexManifest))) {
    addError('Codex manifest missing: .codex-plugin/plugin.json');
  } else if (!(await pathExists(path.join(pluginDir, '.mcp.json')))) {
    addWarning('Codex: .mcp.json missing at repo root.');
  } else if (!(await pathExists(path.join(pluginDir, 'bin', 'contorium-mcp-launch.cjs')))) {
    addError('Codex/Claude MCP launcher missing: bin/contorium-mcp-launch.cjs');
  }

  const componentName = cursorName ?? claudeName ?? codexName ?? 'plugin';
  await validateComponents(componentName);

  if (!(await pathExists(path.join(pluginDir, 'package.json')))) {
    addWarning('No package.json at repo root (VS Code extension host). Required for sidebar build.');
  }

  if (!(await pathExists(path.join(pluginDir, 'packages', 'mcp', 'dist', 'server.js')))) {
    addWarning('packages/mcp/dist/server.js missing — run npm run build:mcp before MCP use.');
  }

  summarize();
}

function summarize() {
  if (warnings.length) {
    console.log('Warnings:');
    for (const w of warnings) {
      console.log(`- ${w}`);
    }
    console.log('');
  }
  if (errors.length) {
    console.error('Validation failed:');
    for (const e of errors) {
      console.error(`- ${e}`);
    }
    process.exit(1);
  }
  console.log('Plugin validation passed (Cursor + Claude Code + Codex manifests).');
}

await main();
