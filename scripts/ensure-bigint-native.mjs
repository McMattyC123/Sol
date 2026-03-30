#!/usr/bin/env node
/**
 * bigint-buffer loads faster with a native addon. After npm ci the binary is
 * often missing if node-gyp could not run. Try rebuild once; never fail install.
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bigintPkg = path.join(root, 'node_modules', 'bigint-buffer');
const nodeFile = path.join(bigintPkg, 'build', 'Release', 'bigint_buffer.node');

function platformBuildHint() {
  switch (process.platform) {
    case 'linux':
      return 'Debian/Ubuntu: sudo apt install -y build-essential python3  →  npm run rebuild';
    case 'darwin':
      return 'macOS: xcode-select --install  →  npm run rebuild';
    case 'win32':
      return 'Windows: install “Desktop development with C++” (VS Build Tools), Python 3  →  npm run rebuild';
    default:
      return 'Install a C++ toolchain + Python 3 for node-gyp, then: npm run rebuild';
  }
}

function tryRebuildFromRoot() {
  return spawnSync('npm', ['rebuild', 'bigint-buffer'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
}

/** Sometimes `npm rebuild -w` / hoisting differs; rebuilding inside the package is more reliable. */
function tryRebuildInPackage() {
  if (!existsSync(path.join(bigintPkg, 'package.json'))) {
    return { status: 1 };
  }
  return spawnSync('npm', ['run', 'rebuild'], {
    cwd: bigintPkg,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
}

if (existsSync(nodeFile)) {
  process.exit(0);
}

tryRebuildFromRoot();
if (!existsSync(nodeFile)) {
  tryRebuildInPackage();
}

if (!existsSync(nodeFile)) {
  console.warn(
    '\nbigint-buffer: native addon not built (you will see “pure JS will be used” at runtime).\n',
    platformBuildHint(),
    '\n',
  );
}

process.exit(0);
