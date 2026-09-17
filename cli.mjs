#!/usr/bin/env node
/**
 * Cursor Layer CLI
 *
 *   node cli.mjs install
 *   node cli.mjs uninstall
 *   node cli.mjs status
 *   node cli.mjs report [--open]
 */

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  applyLayerHooks,
  hooksPathFor,
  layerIsRegistered,
  loadConfig,
  migrateLegacyData,
  readHooksFile,
  saveConfig,
  stripLayerHooks,
  writeHooksFile,
} from './lib/hooks.mjs';
import { DATA_DIR, EVENTS_LOG, LAYER_ROOT, REPORT_HTML, USER_HOOKS } from './lib/paths.mjs';
import { loadEvents, writeReport } from './report.mjs';

const HELP = `
Cursor Layer — a small, free add-on for Cursor
by Durellem Ltd  ·  https://www.durellem.com

What it does
  • Reminds the agent of your project rules at the start of each chat
  • Warns you when Cursor is about to compress (forget) chat memory
  • Keeps a private log on this computer so you can see when things drifted

It cannot force Cursor to obey. It gives you visibility, a reminder, and a
warning — which is the control Cursor actually allows.

Commands
  node cli.mjs install          Set it up for your user account (recommended)
  node cli.mjs install --here   Set it up for this project only
  node cli.mjs install --observe-only
                                Log only; do not remind or warn
  node cli.mjs uninstall        Remove Cursor Layer (keeps your log)
  node cli.mjs status           Check that it is working
  node cli.mjs report [--open]  Write a summary; --open shows it in a browser

Windows: double-click INSTALL.bat, SHOW-REPORT.bat, or UNINSTALL.bat instead.
`.trim();

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args.find((arg) => !arg.startsWith('-')) || 'help';
  return {
    command,
    here: args.includes('--here'),
    observeOnly: args.includes('--observe-only'),
    open: args.includes('--open'),
  };
}

async function install({ here, observeOnly }) {
  const scope = here ? 'project' : 'user';
  const hooksFile = hooksPathFor(scope);
  const current = await readHooksFile(hooksFile);
  const next = applyLayerHooks(current.data, LAYER_ROOT);
  await writeHooksFile(hooksFile, next);
  await mkdir(DATA_DIR, { recursive: true });
  const migrated = await migrateLegacyData();
  await saveConfig({
    remindRules: !observeOnly,
    warnOnCompact: !observeOnly,
    scope,
    hooksFile,
    installedAt: new Date().toISOString(),
  });

  const lines = [
    'Cursor Layer is installed.',
    '',
    `Hooks file: ${hooksFile}`,
    `Private log: ${EVENTS_LOG}`,
    observeOnly
      ? 'Mode: observe only (no rule reminder, no compression warning).'
      : 'Mode: remind + warn (recommended).',
    '',
    'Use Cursor as normal. No restart is usually needed.',
    'If nothing shows up, restart Cursor once, then run: node cli.mjs status',
    '',
    'When you want a summary, double-click SHOW-REPORT.bat',
    `(or run: node "${path.join(LAYER_ROOT, 'cli.mjs')}" report --open)`,
  ];
  if (migrated) lines.splice(5, 0, 'Copied an older cursor-drift-watch log into the new folder.');
  console.log(lines.join('\n'));
}

async function uninstall({ here }) {
  const config = await loadConfig();
  const hooksFile = here ? hooksPathFor('project') : config.hooksFile || USER_HOOKS;
  if (!existsSync(hooksFile)) {
    console.log(`Nothing to remove. No hooks file at ${hooksFile}`);
    return;
  }
  const current = await readHooksFile(hooksFile);
  await writeHooksFile(hooksFile, stripLayerHooks(current.data));
  console.log(
    [
      'Cursor Layer hooks removed.',
      `Updated: ${hooksFile}`,
      `Your private log was kept at ${DATA_DIR}`,
      'Delete that folder yourself if you also want the history gone.',
    ].join('\n'),
  );
}

async function status({ here }) {
  const config = await loadConfig();
  const hooksFile = here ? hooksPathFor('project') : config.hooksFile || USER_HOOKS;
  let registered = false;
  let hooksNote = `No file yet at ${hooksFile}`;
  if (existsSync(hooksFile)) {
    try {
      const current = await readHooksFile(hooksFile);
      registered = layerIsRegistered(current.data);
      hooksNote = registered ? 'Cursor Layer commands are present.' : 'File exists, but Cursor Layer is not listed.';
    } catch (err) {
      hooksNote = err.message;
    }
  }

  const events = await loadEvents();
  const last = events[events.length - 1];

  console.log(
    [
      'Cursor Layer status',
      `  Folder:     ${LAYER_ROOT}`,
      `  Node:       ${process.version} (${process.execPath})`,
      `  Hooks file: ${hooksFile}`,
      `  Hooks:      ${hooksNote}`,
      `  Mode:       ${config.remindRules ? 'remind + warn' : 'observe only'}`,
      `  Log:        ${existsSync(EVENTS_LOG) ? EVENTS_LOG : 'none yet'}`,
      `  Events:     ${events.length}${last ? ` (last ${last.logged_at} · ${last.hook_event_name})` : ''}`,
      '',
      registered
        ? 'Looks good. Use Cursor, then open the report when you want a summary.'
        : 'Not fully installed. Double-click INSTALL.bat (or run: node cli.mjs install).',
    ].join('\n'),
  );
}

function openFile(filePath) {
  const platform = os.platform();
  if (platform === 'win32') spawn('cmd', ['/c', 'start', '', filePath], { detached: true, stdio: 'ignore' }).unref();
  else if (platform === 'darwin') spawn('open', [filePath], { detached: true, stdio: 'ignore' }).unref();
  else spawn('xdg-open', [filePath], { detached: true, stdio: 'ignore' }).unref();
}

async function report({ open }) {
  const result = await writeReport();
  console.log(result.markdown);
  console.error(`\nSaved:\n  ${REPORT_HTML}\n  (and a text copy next to it)`);
  if (open) openFile(REPORT_HTML);
}

const args = parseArgs(process.argv);

try {
  if (args.command === 'install') await install(args);
  else if (args.command === 'uninstall') await uninstall(args);
  else if (args.command === 'status') await status(args);
  else if (args.command === 'report') await report(args);
  else console.log(HELP);
} catch (err) {
  console.error(err.message || err);
  process.exitCode = 1;
}
