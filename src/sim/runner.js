import { runWashTick } from './tick.js';

let abortController = null;
/** @type {{ running: boolean, mint: string | null, intervalMs: number | null, jitterMs: number | null }} */
let loopState = {
  running: false,
  mint: null,
  intervalMs: null,
  jitterMs: null,
};

export function getSimLoopState() {
  return { ...loopState };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {object} opts
 * @param {string} opts.mint
 * @param {number} opts.intervalMs
 * @param {number} opts.jitterMs
 * @param {() => ReturnType<import('../solana/wallet.js').loadWalletEntries>} opts.loadEntries
 * @param {(result: object) => void} [opts.onTick]
 * @param {(err: unknown) => void} [opts.onError]
 */
export function startSimLoop(opts) {
  const { mint, intervalMs, jitterMs, loadEntries, onTick, onError } = opts;
  if (loopState.running) {
    throw new Error('Sim loop already running');
  }
  const controller = new AbortController();
  abortController = controller;
  loopState = {
    running: true,
    mint,
    intervalMs,
    jitterMs,
  };

  (async () => {
    try {
      while (!controller.signal.aborted) {
        try {
          const entries = loadEntries();
          const result = await runWashTick({ outputMint: mint, entries });
          onTick?.(result);
        } catch (e) {
          onError?.(e);
        }
        if (controller.signal.aborted) break;
        const wait = intervalMs + Math.floor(Math.random() * jitterMs);
        await sleep(wait);
      }
    } finally {
      loopState = {
        running: false,
        mint: null,
        intervalMs: null,
        jitterMs: null,
      };
      abortController = null;
    }
  })();

  return getSimLoopState();
}

/** @returns {boolean} whether a loop was signalled to stop */
export function stopSimLoop() {
  if (abortController) {
    abortController.abort();
    return true;
  }
  return false;
}
