#!/usr/bin/env node
/**
 * Cursor Layer — hook handler.
 *
 * Cursor sends one JSON event on stdin and reads one JSON reply on stdout.
 * This script always fails open: even if it crashes, Cursor continues.
 *
 * What it does:
 *   1. Appends a trimmed copy of the event to ~/.cursor-layer/events.jsonl
 *   2. On sessionStart, snapshots project rules and (optionally) reminds
 *      the agent of those rules via additional_context
 *   3. On preCompact, (optionally) shows a short warning in Cursor
 */

import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, EVENTS_LOG, RULES_DIR } from './lib/paths.mjs';
import { loadConfig } from './lib/hooks.mjs';

const SAFE_RESPONSE = JSON.stringify({ continue: true }) + '\n';
const CONTEXT_BUDGET = 1600;

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function ensureDirs() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(RULES_DIR, { recursive: true });
}

async function appendEvent(record) {
  const line = JSON.stringify({ logged_at: new Date().toISOString(), ...record }) + '\n';
  await appendFile(EVENTS_LOG, line, 'utf8');
}

function reply(extra = {}) {
  process.stdout.write(JSON.stringify({ continue: true, ...extra }) + '\n');
}

async function collectRules(workspaceRoot) {
  const snapshot = { workspaceRoot, files: {} };
  if (!workspaceRoot) return snapshot;

  const rulesDir = path.join(workspaceRoot, '.cursor', 'rules');
  const legacyRules = path.join(workspaceRoot, '.cursorrules');

  if (existsSync(rulesDir)) {
    const entries = await readdir(rulesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.mdc')) {
        const filePath = path.join(rulesDir, entry.name);
        const content = await readFile(filePath, 'utf8');
        snapshot.files[`.cursor/rules/${entry.name}`] = {
          hash: crypto.createHash('sha1').update(content).digest('hex'),
          content,
        };
      }
    }
  }

  if (existsSync(legacyRules)) {
    const content = await readFile(legacyRules, 'utf8');
    snapshot.files['.cursorrules'] = {
      hash: crypto.createHash('sha1').update(content).digest('hex'),
      content,
    };
  }

  return snapshot;
}

function remindFrom(snapshot) {
  const names = Object.keys(snapshot.files);
  if (!names.length) {
    return 'Cursor Layer: this workspace has no project rule files (.cursor/rules/*.mdc or .cursorrules). Follow the user\'s instructions for the whole chat. If a later message conflicts, follow the latest user message and say so.';
  }

  const header = 'Cursor Layer: follow these project rules for the whole chat. If a later user message conflicts, follow the latest user message and say so.';
  const leftover = Math.max(200, CONTEXT_BUDGET - header.length - 20);
  const perFile = Math.max(120, Math.floor(leftover / names.length));
  const body = names
    .map((name) => {
      const compact = snapshot.files[name].content.replace(/\s+/g, ' ').trim();
      return `- ${name}: ${compact.slice(0, perFile)}`;
    })
    .join('\n');
  return `${header}\n${body}`.slice(0, CONTEXT_BUDGET);
}

function trimPayload(payload) {
  const out = { ...payload };
  for (const key of ['content', 'text', 'output', 'result_json', 'prompt']) {
    if (typeof out[key] === 'string' && out[key].length > 3000) {
      out[key] = out[key].slice(0, 3000) + `…[truncated ${out[key].length - 3000} chars]`;
    }
  }
  return out;
}

function compactWarning(payload) {
  const percent = payload.context_usage_percent ?? '?';
  const first = payload.is_first_compaction ? ' This is the first compression in this chat.' : '';
  return `Cursor Layer: this chat is ${percent}% full, so Cursor is about to compress memory.${first} If the agent has started ignoring your rules, start a new chat.`;
}

async function main() {
  await ensureDirs();
  const raw = await readStdin();
  const config = await loadConfig();

  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch (err) {
    await appendEvent({
      hook_event_name: 'unknown',
      parse_error: String(err),
      raw_preview: raw.slice(0, 500),
    });
    process.stdout.write(SAFE_RESPONSE);
    return;
  }

  await appendEvent(trimPayload(payload));

  if (payload.hook_event_name === 'sessionStart') {
    const workspaceRoot = Array.isArray(payload.workspace_roots) ? payload.workspace_roots[0] : null;
    const snapshot = await collectRules(workspaceRoot);
    if (Object.keys(snapshot.files).length && payload.session_id) {
      await writeFile(
        path.join(RULES_DIR, `${payload.session_id}.json`),
        JSON.stringify(snapshot, null, 2),
        'utf8',
      );
    }
    if (config.remindRules) {
      reply({ additional_context: remindFrom(snapshot) });
      return;
    }
  }

  if (payload.hook_event_name === 'preCompact' && config.warnOnCompact) {
    reply({ user_message: compactWarning(payload) });
    return;
  }

  process.stdout.write(SAFE_RESPONSE);
}

main().catch(async (err) => {
  try {
    await appendEvent({ hook_event_name: 'watch_error', error: String((err && err.stack) || err) });
  } catch {
    /* logging must never be the reason this blocks Cursor */
  }
  process.stdout.write(SAFE_RESPONSE);
});
