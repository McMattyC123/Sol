import fs from 'node:fs';
import path from 'node:path';

export function loadSimulationConfig() {
  const p =
    process.env.SIMULATION_CONFIG?.trim() ||
    path.join(process.cwd(), 'data', 'simulation.json');
  if (!fs.existsSync(p)) {
    return {
      version: 1,
      buyerGroup: 'buyers',
      sellerGroup: 'sellers',
      groups: {},
    };
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
