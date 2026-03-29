import fs from 'node:fs';
import path from 'node:path';
import { Keypair } from '@solana/web3.js';
import { loadSimulationConfigFromPath } from '../sim/loadSimulationConfig.js';
import {
  planMarketMovingFromFunding,
  perWalletMarketMovingSnippet,
} from '../sim/marketMovingPlan.js';
import * as actions from './actions.js';

/**
 * Generate keypairs on disk and a WALLETS_CONFIG JSON document (array under `wallets`).
 *
 * @param {object} opts
 * @param {string} opts.keysDir
 * @param {string} opts.outPath
 * @param {number} opts.buyers
 * @param {number} opts.sellers
 * @param {string} [opts.targetMint]
 * @param {number} [opts.startingSol] - SOL from primary to each new wallet (per wallet)
 * @param {string} [opts.simulationConfigPath] - for market-moving estimates (default env / data/simulation.json)
 */
export async function createWalletsManifestAndKeys({
  keysDir,
  outPath,
  buyers,
  sellers,
  targetMint,
  startingSol = 0,
  simulationConfigPath,
}) {
  const b = Math.max(0, Math.floor(Number(buyers) || 0));
  const s = Math.max(0, Math.floor(Number(sellers) || 0));
  if (b < 1 && s < 1) {
    throw new Error('Set --buyers and/or --sellers to at least 1');
  }

  const start = Number(startingSol);
  if (!Number.isFinite(start) || start < 0) {
    throw new Error('startingSol must be a non-negative number');
  }

  const simConfig = loadSimulationConfigFromPath(simulationConfigPath);

  /** @type {ReturnType<typeof planMarketMovingFromFunding> | null} */
  let marketMoving = null;
  if (b >= 1) {
    marketMoving = planMarketMovingFromFunding({
      simConfig,
      buyerCount: b,
      startingSolPerBuyer: start,
    });
  }

  fs.mkdirSync(keysDir, { recursive: true });
  const cwd = process.cwd();
  /** @type {object[]} */
  const wallets = [];

  const absKeys = path.resolve(keysDir);
  const mintField = targetMint?.trim() ? { targetMint: targetMint.trim() } : {};

  for (let i = 1; i <= b; i++) {
    const label = `buyer-${i}`;
    const kp = Keypair.generate();
    const absFile = path.join(absKeys, `${label}.json`);
    fs.writeFileSync(absFile, `${JSON.stringify(Array.from(kp.secretKey))}\n`, 'utf8');
    const keypairPath = path.relative(cwd, absFile) || absFile;
    wallets.push({
      label,
      keypairPath,
      group: 'buyers',
      role: 'buyer',
      startingSol: start,
      marketMoving: marketMoving
        ? perWalletMarketMovingSnippet(marketMoving, 'buyer', start)
        : null,
      ...mintField,
    });
  }

  for (let i = 1; i <= s; i++) {
    const label = `seller-${i}`;
    const kp = Keypair.generate();
    const absFile = path.join(absKeys, `${label}.json`);
    fs.writeFileSync(absFile, `${JSON.stringify(Array.from(kp.secretKey))}\n`, 'utf8');
    const keypairPath = path.relative(cwd, absFile) || absFile;
    wallets.push({
      label,
      keypairPath,
      group: 'sellers',
      role: 'seller',
      startingSol: start,
      marketMoving: perWalletMarketMovingSnippet(null, 'seller', start),
      ...mintField,
    });
  }

  const totalWallets = wallets.length;
  const totalCapitalSol = start * totalWallets;

  const doc = {
    version: 2,
    startingSolPerWallet: start,
    totalWallets,
    totalStartingSolDeployedApprox: totalCapitalSol,
    simulationConfigPath:
      simulationConfigPath?.trim() ||
      process.env.SIMULATION_CONFIG?.trim() ||
      path.join(process.cwd(), 'data', 'simulation.json'),
    marketMovingSummary: marketMoving,
    wallets,
  };

  const outAbs = path.resolve(outPath);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

  if (start > 0) {
    for (const row of wallets) {
      const pk = readPubkeyFromKeypairFile(path.resolve(cwd, row.keypairPath));
      await actions.transferSol(pk, String(start));
    }
  }

  return {
    manifestPath: path.relative(cwd, outAbs) || outAbs,
    keysDir: path.relative(cwd, absKeys) || absKeys,
    count: totalWallets,
    startingSolPerWallet: start,
    totalStartingSolDeployedApprox: totalCapitalSol,
    marketMovingSummary: marketMoving,
  };
}

function readPubkeyFromKeypairFile(absPath) {
  const raw = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  if (!Array.isArray(raw)) throw new Error(`Invalid keypair JSON: ${absPath}`);
  const kp = Keypair.fromSecretKey(Uint8Array.from(raw));
  return kp.publicKey.toBase58();
}
