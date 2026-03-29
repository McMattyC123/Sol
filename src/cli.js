#!/usr/bin/env node
/**
 * Educational / simulation multi-wallet runner.
 * Do not use for market manipulation; may be illegal on mainnet.
 */
import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Command } from 'commander';
import { ensureMasterPassword } from './auth.js';
import * as actions from './solana/actions.js';
import { loadWalletEntries } from './solana/wallet.js';
import { runWashTick, simWarning } from './sim/tick.js';

function showReplHelp() {
  console.log(`Commands:
  help
  status
  wallets|balance
  transfer <to> <sol>
  exit | quit`);
}

async function runRepl() {
  const rl = readline.createInterface({ input, output });
  console.log('sol-trade REPL — type "help".');
  try {
    while (true) {
      const line = await rl.question('> ');
      const parts = line
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const cmd = parts[0]?.toLowerCase();
      const rest = parts.slice(1);
      if (!cmd) continue;
      if (cmd === 'exit' || cmd === 'quit') break;
      if (cmd === 'help') {
        showReplHelp();
        continue;
      }
      try {
        if (cmd === 'status') {
          console.log(JSON.stringify(await actions.getStatus(), null, 2));
        } else if (cmd === 'wallets' || cmd === 'balance' || cmd === 'balances') {
          console.table(await actions.getBalances());
        } else if (cmd === 'transfer') {
          const [to, amt] = rest;
          if (!to || !amt) {
            console.error('usage: transfer <to> <sol>');
            continue;
          }
          console.log(JSON.stringify(await actions.transferSol(to, amt), null, 2));
        } else {
          console.error('Unknown command. Try help');
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : err);
      }
    }
  } finally {
    rl.close();
  }
}

const program = new Command();

program
  .name('sol-trade')
  .description(
    'Solana simulation CLI — multi-wallet volume patterns for research. Not for illegal wash trading.',
  )
  .version('1.0.0', '-V, --version', 'show version');

program
  .command('status')
  .description('Print RPC pool (masked), version, and slot')
  .action(async () => {
    await ensureMasterPassword();
    console.log(JSON.stringify(await actions.getStatus(), null, 2));
  });

program
  .command('wallets')
  .alias('balances')
  .description('List wallets, groups, and SOL balances')
  .action(async () => {
    await ensureMasterPassword();
    console.table(await actions.getBalances());
  });

program
  .command('transfer')
  .description('Transfer SOL from the primary keypair')
  .argument('<to>', 'Recipient address')
  .argument('<sol>', 'Amount in SOL')
  .action(async (to, sol) => {
    await ensureMasterPassword();
    const r = await actions.transferSol(to, sol);
    console.log(JSON.stringify(r, null, 2));
  });

const sim = program.command('sim').description('Dynamic wash-style simulation (research only)');

sim
  .command('tick')
  .description('One round-robin buy (buyer group) + sell (seller group) via Jupiter + Jito')
  .requiredOption('--mint <address>', 'SPL mint (base token for pump-style legs)')
  .action(async (opts) => {
    await ensureMasterPassword();
    const entries = loadWalletEntries();
    const out = await runWashTick({ outputMint: opts.mint, entries });
    console.log(
      JSON.stringify(
        out,
        (_, v) => (typeof v === 'bigint' ? v.toString() : v),
        2,
      ),
    );
  });

sim
  .command('run')
  .description('Loop ticks (same as PM2 worker)')
  .requiredOption('--mint <address>', 'SPL mint')
  .option(
    '--interval-ms <n>',
    'Milliseconds between ticks (default from SIM_INTERVAL_MS)',
    (v) => Number(v),
  )
  .action(async (opts) => {
    await ensureMasterPassword();
    simWarning();
    const mint = opts.mint;
    const intervalMs =
      opts.intervalMs ?? Number(process.env.SIM_INTERVAL_MS ?? '15000');
    const jitterMs = Number(process.env.SIM_JITTER_MS ?? '3000');
    const entries = loadWalletEntries();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (;;) {
      try {
        const result = await runWashTick({ outputMint: mint, entries });
        console.log(
          JSON.stringify(
            result,
            (_, v) => (typeof v === 'bigint' ? v.toString() : v),
            2,
          ),
        );
      } catch (e) {
        console.error('tick error:', e instanceof Error ? e.message : e);
      }
      await sleep(intervalMs + Math.floor(Math.random() * jitterMs));
    }
  });

program
  .command('repl')
  .description('Interactive shell')
  .action(async () => {
    await ensureMasterPassword();
    await runRepl();
  });

program.showHelpAfterError();

await program.parseAsync(process.argv);
