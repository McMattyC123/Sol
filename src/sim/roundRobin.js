import fs from 'node:fs';
import path from 'node:path';

const defaultStatePath = () =>
  process.env.SIM_RR_STATE_PATH?.trim() ||
  path.join(process.cwd(), 'data', 'rr-state.json');

export function loadRrState(filePath = defaultStatePath()) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {
    /* empty */
  }
  return { cursors: {} };
}

export function saveRrState(state, filePath = defaultStatePath()) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * @param {string} key
 * @param {unknown[]} ring
 */
export function nextIndex(key, ring, statePath) {
  if (!ring.length) {
    throw new Error(`RoundRobin "${key}": empty group`);
  }
  const sp = statePath ?? defaultStatePath();
  const state = loadRrState(sp);
  const cur = state.cursors[key] ?? 0;
  const idx = cur % ring.length;
  state.cursors[key] = (cur + 1) % ring.length;
  saveRrState(state, sp);
  return idx;
}
