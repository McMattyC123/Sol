#!/usr/bin/env node
/**
 * Post-build smoke: start server briefly, GET /api/health and /api/config.
 * Run after: npm ci && npm run build:client
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const port = process.env.SMOKE_PORT || '38991';

function get(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, body });
        });
      })
      .on('error', reject);
  });
}

const child = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: port,
    // Intentionally omit RPC so /api/status degrades gracefully (Railway pre-config).
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

await new Promise((r) => setTimeout(r, 1200));

try {
  const health = await get(`http://127.0.0.1:${port}/api/health`);
  if (health.status !== 200) {
    throw new Error(`health HTTP ${health.status}: ${health.body}`);
  }
  const j = JSON.parse(health.body);
  if (!j.ok) throw new Error('health body missing ok:true');

  const cfg = await get(`http://127.0.0.1:${port}/api/config`);
  if (cfg.status !== 200) {
    throw new Error(`config HTTP ${cfg.status}: ${cfg.body}`);
  }
  console.log('smoke-deploy: OK ( /api/health + /api/config )');
} finally {
  child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 300));
}
