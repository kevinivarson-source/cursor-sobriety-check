import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LAYER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(os.homedir(), '.cursor-layer');
export const LEGACY_DATA_DIR = path.join(os.homedir(), '.cursor-drift-watch');
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
