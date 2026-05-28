#!/usr/bin/env node
/**
 * Sync version from root package.json to plugin manifests, workspace packages, and lockfiles.
 * Usage: npm run version:sync
 * Bump flow: edit package.json version (or `npm version patch`) then run version:sync / compile.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootPkgPath = path.join(repoRoot, 'package.json');
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'));
const version = rootPkg.version;

if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(`Invalid version in ${rootPkgPath}: ${String(version)}`);
  process.exit(1);
}

function writeJson(rel, data) {
  const fp = path.join(repoRoot, rel);
  writeFileSync(fp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`  ${rel}`);
}

function patchJson(rel, patch) {
  const fp = path.join(repoRoot, rel);
  const data = JSON.parse(readFileSync(fp, 'utf8'));
  patch(data);
  writeJson(rel, data);
}

function syncLockfile(rel, names) {
  const fp = path.join(repoRoot, rel);
  const lock = JSON.parse(readFileSync(fp, 'utf8'));
  if (names.includes(lock.name)) {
    lock.version = version;
  }
  const rootEntry = lock.packages?.[''];
  if (rootEntry && names.includes(rootEntry.name)) {
    rootEntry.version = version;
  }
  if (lock.packages?.['packages/runtime']?.name === '@contora/runtime') {
    lock.packages['packages/runtime'].version = version;
  }
  writeJson(rel, lock);
}

console.log(`Syncing version ${version} from package.json\n`);

for (const rel of ['.cursor-plugin/plugin.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
  patchJson(rel, (d) => {
    d.version = version;
  });
}

for (const rel of ['packages/mcp/package.json', 'packages/runtime/package.json']) {
  patchJson(rel, (d) => {
    d.version = version;
  });
}

syncLockfile('package-lock.json', ['contorium']);
syncLockfile('packages/mcp/package-lock.json', ['@contorium/mcp']);

console.log('\nDone. Run npm run build:mcp if MCP dist is stale.');
