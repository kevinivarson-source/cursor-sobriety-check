import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  CONFIG_PATH,
  DATA_DIR,
  DEFAULT_CONFIG,
  HOOK_EVENTS,
  LAYER_ROOT,
  PRODUCT_SLUG,
  USER_HOOKS,
  ensureDataDir,
} from './paths.mjs';

export function toHookPath(p) {
  return path.resolve(p).replace(/\\/g, '/');
}

export function layerCommand(layerRoot = LAYER_ROOT) {
  const node = toHookPath(process.execPath);
  const watch = toHookPath(path.join(layerRoot, 'watch.mjs'));
  return `"${node}" "${watch}"`;
}

export function isLayerHook(entry) {
  const command = typeof entry === 'string' ? entry : entry?.command;
  if (typeof command !== 'string') return false;
  const normalized = command.replace(/\\/g, '/').toLowerCase();
  return (
    normalized.includes('watch.mjs') &&
    (normalized.includes(PRODUCT_SLUG) ||
      normalized.includes('xcursorfatiguex') ||
      normalized.includes('cursor-layer') ||
      normalized.includes('cursor-drift-watch'))
  );
}

export async function loadConfig() {
  await ensureDataDir();
  if (!existsSync(CONFIG_PATH)) return { ...DEFAULT_CONFIG };
  try {
    const raw = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
    return { ...DEFAULT_CONFIG, ...raw };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(partial) {
  await ensureDataDir();
  await mkdir(DATA_DIR, { recursive: true });
  const next = { ...(await loadConfig()), ...partial };
  await writeFile(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}

export function hooksPathFor(scope, cwd = process.cwd()) {
  if (scope === 'project') return path.join(cwd, '.cursor', 'hooks.json');
  return USER_HOOKS;
}

export async function readHooksFile(filePath) {
  if (!existsSync(filePath)) return { exists: false, data: { version: 1, hooks: {} } };
  const raw = await readFile(filePath, 'utf8');
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') throw new Error('not an object');
    if (!data.hooks || typeof data.hooks !== 'object') data.hooks = {};
    return { exists: true, data };
  } catch (err) {
    const error = new Error(`Could not read ${filePath} as JSON (${err.message}). Fix or rename that file, then run install again.`);
    error.code = 'INVALID_HOOKS_JSON';
    throw error;
  }
}

export async function writeHooksFile(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function stripLayerHooks(data) {
  const hooks = { ...data.hooks };
  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;
    const kept = entries.filter((entry) => !isLayerHook(entry));
    if (kept.length) hooks[event] = kept;
    else delete hooks[event];
  }
  return { ...data, version: data.version || 1, hooks };
}

export function applyLayerHooks(data, layerRoot = LAYER_ROOT) {
  const next = stripLayerHooks(data);
  const entry = { command: layerCommand(layerRoot) };
  for (const event of HOOK_EVENTS) {
    const existing = Array.isArray(next.hooks[event]) ? next.hooks[event] : [];
    next.hooks[event] = [...existing, entry];
  }
  return next;
}

export function layerIsRegistered(data) {
  return HOOK_EVENTS.every((event) => Array.isArray(data?.hooks?.[event]) && data.hooks[event].some(isLayerHook));
}
