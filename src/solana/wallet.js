import fs from 'node:fs';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

function readJsonKeypair(path) {
  const raw = fs.readFileSync(path, 'utf8');
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr)) {
    throw new Error('Keypair file must be a JSON array of bytes');
  }
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

function fromBase58Env() {
  const b58 = process.env.SOLANA_PRIVATE_KEY?.trim();
  if (!b58) return null;
  const secret = bs58.decode(b58);
  return Keypair.fromSecretKey(secret);
}

export function loadPrimaryKeypair() {
  const path = process.env.SOLANA_KEYPAIR_PATH?.trim();
  if (path) {
    if (!fs.existsSync(path)) {
      throw new Error(`SOLANA_KEYPAIR_PATH not found: ${path}`);
    }
    return readJsonKeypair(path);
  }
  const kp = fromBase58Env();
  if (!kp) {
    throw new Error('Set SOLANA_KEYPAIR_PATH or SOLANA_PRIVATE_KEY');
  }
  return kp;
}

function inferRoleFromGroup(group) {
  const g = group.toLowerCase();
  if (g.includes('buy')) return 'buyer';
  if (g.includes('sell')) return 'seller';
  return 'both';
}

/**
 * WALLETS_CONFIG: [ { label, keypairPath, group?: "buyers", role?: "buyer" } ]
 */
export function loadWalletEntries() {
  const configPath = process.env.WALLETS_CONFIG?.trim();
  if (!configPath) {
    try {
      const kp = loadPrimaryKeypair();
      return [{ label: 'default', group: 'default', role: 'both', keypair: kp }];
    } catch {
      return [];
    }
  }
  if (!fs.existsSync(configPath)) {
    throw new Error(`WALLETS_CONFIG not found: ${configPath}`);
  }
  const list = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!Array.isArray(list)) {
    throw new Error('WALLETS_CONFIG must be a JSON array');
  }
  return list.map((entry) => {
    const label = String(entry.label ?? entry.id ?? 'wallet');
    const p = entry.keypairPath ?? entry.path;
    if (!p) {
      throw new Error(`Wallet "${label}" missing keypairPath`);
    }
    if (!fs.existsSync(p)) {
      throw new Error(`Keypair not found for ${label}: ${p}`);
    }
    const group = String(entry.group ?? entry.groupId ?? 'default');
    const role = String(entry.role ?? inferRoleFromGroup(group)).toLowerCase();
    return { label, group, role, keypair: readJsonKeypair(p) };
  });
}

export function walletsForGroup(entries, groupId) {
  return entries.filter((e) => e.group === groupId);
}

export function walletsWithRole(entries, role) {
  const r = role.toLowerCase();
  return entries.filter((e) => e.role === r || e.role === 'both');
}
