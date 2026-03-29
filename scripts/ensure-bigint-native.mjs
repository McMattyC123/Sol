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
const nodeFile = path.join(
  root,
  'node_modules',
  'bigint-buffer',
  'build',
  'Release',
  'bigint_buffer.node',
);

if (existsSync(nodeFile)) {
  process.exit(0);
}

const r = spawnSync('npm', ['rebuild', 'bigint-buffer'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});

if (r.status !== 0 || !existsSync(nodeFile)) {
  console.warn(
    '\nbigint-buffer: native addon not built (pure JS fallback at runtime).',
    'Fix: install build tools (e.g. build-essential / Xcode CLT), then: npm run rebuild\n',
  );
}

process.exit(0);
