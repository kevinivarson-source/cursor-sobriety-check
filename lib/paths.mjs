import os from 'node:os';
import path from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { appendFile, cp, mkdir, rename, copyFile, readdir, stat, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const PRODUCT_NAME = 'Cursor Sobriety Check';
export const PRODUCT_SLUG = 'cursor-sobriety-check';
export const LAYER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(os.homedir(), '.cursor-sobriety-check');
export const LEGACY_DATA_DIRS = [
  path.join(os.homedir(), '.xcursorfatiguex'),
  path.join(os.homedir(), '.cursor-layer'),
];
export const EVENTS_LOG = path.join(DATA_DIR, 'events.jsonl');
export const RULES_DIR = path.join(DATA_DIR, 'rules-snapshots');
export const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
export const REPORT_MD = path.join(DATA_DIR, 'report.md');
export const REPORT_HTML = path.join(DATA_DIR, 'report.html');
export const USER_HOOKS = path.join(os.homedir(), '.cursor', 'hooks.json');

export const DEFAULT_CONFIG = {
  remindRules: true,
  warnOnCompact: true,
};

export const HOOK_EVENTS = [
  'sessionStart',
  'sessionEnd',
  'beforeSubmitPrompt',
  'afterFileEdit',
  'afterShellExecution',
  'preCompact',
  'stop',
];

function migrationStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function backupPath(dir) {
  return `${dir}.migrated-${migrationStamp()}`;
}

async function isDir(dir) {
  try {
    return existsSync(dir) && (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

async function moveDir(from, to) {
  try {
    await rename(from, to);
  } catch (err) {
    if (err?.code === 'ENOENT' && existsSync(to)) return;
    if (err?.code === 'EEXIST' && existsSync(to)) return;
    if (err?.code === 'EXDEV' || err?.code === 'EPERM' || err?.code === 'EACCES') {
      await cp(from, to, { recursive: true, force: false, errorOnExist: false });
      await rename(from, backupPath(from));
      return;
    }
    throw err;
  }
}

async function mergeLegacy(dirs) {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(RULES_DIR, { recursive: true });
  for (const dir of dirs) {
    const srcLog = path.join(dir, 'events.jsonl');
    if (existsSync(srcLog)) {
      const chunk = await readFile(srcLog, 'utf8');
      if (chunk) {
        await appendFile(EVENTS_LOG, chunk.endsWith('\n') ? chunk : `${chunk}\n`, 'utf8');
      }
    }
    const srcRules = path.join(dir, 'rules-snapshots');
    if (!(await isDir(srcRules))) continue;
    const entries = await readdir(srcRules, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const dest = path.join(RULES_DIR, entry.name);
      if (existsSync(dest)) continue;
      await copyFile(path.join(srcRules, entry.name), dest);
    }
  }
}

async function runMigration() {
  try {
    if (existsSync(DATA_DIR)) return;

    const present = [];
    for (const dir of LEGACY_DATA_DIRS) {
      if (await isDir(dir)) present.push(dir);
    }

    if (present.length === 0) {
      await mkdir(DATA_DIR, { recursive: true });
      return;
    }

    if (present.length === 1) {
      await moveDir(present[0], DATA_DIR);
    } else {
      await mergeLegacy(present);
      for (const dir of present) {
        try {
          if (existsSync(dir)) await rename(dir, backupPath(dir));
        } catch (err) {
          if (err?.code === 'ENOENT' || err?.code === 'EEXIST') continue;
          if (err?.code === 'EPERM' || err?.code === 'EACCES') continue;
        }
      }
    }

    if (!existsSync(DATA_DIR)) return;
    await appendFile(
      EVENTS_LOG,
      `${JSON.stringify({
        hook_event_name: 'data_migrated',
        from: present,
        logged_at: new Date().toISOString(),
      })}\n`,
      'utf8',
    );
  } catch {
    /* fail-open: never throw out to the hook */
  }
}

let inFlight = null;

export async function ensureDataDir() {
  if (existsSync(DATA_DIR)) return;
  if (!inFlight) inFlight = runMigration().catch(() => {});
  await inFlight;
}

export function listDataBackupDirs() {
  const home = os.homedir();
  try {
    return readdirSync(home)
      .filter(
        (name) =>
          name.startsWith('.xcursorfatiguex.migrated-') || name.startsWith('.cursor-layer.migrated-'),
      )
      .map((name) => path.join(home, name));
  } catch {
    return [];
  }
}
