import readline from 'node:readline';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Prompt without echoing characters (best-effort TTY).
 */
export function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY) {
      const rl = readline.createInterface({ input: stdin, output: stdout });
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
      rl.on('close', () => {});
      return;
    }

    stdout.write(question);
    stdin.resume();
    stdin.setRawMode(true);

    let buf = '';
    const onData = (chunk) => {
      const s = chunk.toString('utf8');
      for (const ch of s) {
        if (ch === '\n' || ch === '\r') {
          cleanup();
          stdout.write('\n');
          resolve(buf);
          return;
        }
        if (ch === '\u0003') {
          cleanup();
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') {
          buf = buf.slice(0, -1);
          continue;
        }
        buf += ch;
      }
    };

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.removeListener('data', onData);
    };

    stdin.on('data', onData);
  });
}

function digest256(s) {
  return createHash('sha256').update(s, 'utf8').digest();
}

/**
 * If CLI_MASTER_PASSWORD is unset or empty, returns true (no gate).
 * Otherwise compares SHA-256 digests with timingSafeEqual.
 */
export function checkMasterPassword(plain) {
  const expected = process.env.CLI_MASTER_PASSWORD;
  if (!expected) return true;
  const a = digest256(plain ?? '');
  const b = digest256(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function ensureMasterPassword() {
  const expected = process.env.CLI_MASTER_PASSWORD;
  if (!expected) return;
  const line = await promptHidden('Master password: ');
  if (!checkMasterPassword(line)) {
    console.error('Access denied.');
    process.exit(1);
  }
}

/**
 * For HTTP/API: if CLI_MASTER_PASSWORD is set, `plain` must match it.
 * @param {string | undefined} plain
 */
export function assertMasterPassword(plain) {
  const expected = process.env.CLI_MASTER_PASSWORD?.trim();
  if (!expected) return;
  if (!checkMasterPassword(plain)) {
    const e = new Error('Unauthorized');
    e.statusCode = 401;
    throw e;
  }
}
