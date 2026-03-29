import fs from 'node:fs';
import path from 'node:path';

function defaultConfig() {
  return {
    version: 1,
    buyerGroup: 'buyers',
    sellerGroup: 'sellers',
    groups: {},
  };
}

export function loadSimulationConfig() {
  const p =
    process.env.SIMULATION_CONFIG?.trim() ||
    path.join(process.cwd(), 'data', 'simulation.json');
  if (!fs.existsSync(p)) {
    return defaultConfig();
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** @param {string} configPath */
export function loadSimulationConfigFromPath(configPath) {
  const p = configPath?.trim();
  if (!p) return loadSimulationConfig();
  if (!fs.existsSync(p)) {
    throw new Error(`SIMULATION_CONFIG not found: ${p}`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
