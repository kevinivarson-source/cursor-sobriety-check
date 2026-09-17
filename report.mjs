#!/usr/bin/env node
/**
 * Cursor Sobriety Check — report
 *
 * Reads ~/.xcursorfatiguex/events.jsonl and writes a plain-language summary
 * (markdown + a double-clickable HTML page). Pattern matching is a hint,
 * not a verdict.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DATA_DIR, EVENTS_LOG, PRODUCT_NAME, REPORT_HTML, REPORT_MD } from './lib/paths.mjs';

const CORRECTION_PATTERNS = [
  /^\s*no[,.]/i,
  /\bdon'?t do that\b/i,
  /\bwhy did you\b/i,
  /\bthat'?s not (what|right)\b/i,
  /\brevert\b/i,
  /\bundo that\b/i,
  /\bi (already )?(said|told you)\b/i,
  /\bnot what i asked\b/i,
  /\bstop (doing|making up|inventing)\b/i,
  /\bplease (just )?follow the (rule|instruction)/i,
  /\byou (ignored|forgot|missed)\b/i,
  /\bstart over\b/i,
];

function looksLikeCorrection(text) {
  return typeof text === 'string' && CORRECTION_PATTERNS.some((re) => re.test(text));
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function clip(text, n = 90) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > n ? `${value.slice(0, n)}…` : value;
}

export async function loadEvents() {
  if (!existsSync(EVENTS_LOG)) return [];
  const raw = await readFile(EVENTS_LOG, 'utf8');
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function groupBySession(events) {
  const sessions = new Map();
  for (const event of events) {
    const id = event.session_id || event.conversation_id || 'unknown';
    if (!sessions.has(id)) sessions.set(id, []);
    sessions.get(id).push(event);
  }
  for (const list of sessions.values()) {
    list.sort((a, b) => (a.logged_at || '').localeCompare(b.logged_at || ''));
  }
  return sessions;
}

function analyzeSession(id, events) {
  const start = events.find((e) => e.hook_event_name === 'sessionStart');
  const end = events.find((e) => e.hook_event_name === 'sessionEnd');
  const prompts = events.filter((e) => e.hook_event_name === 'beforeSubmitPrompt');
  const commands = events.filter((e) => e.hook_event_name === 'afterShellExecution');
  const compactions = events.filter((e) => e.hook_event_name === 'preCompact');

  const filesTouched = new Map();
  for (const event of events) {
    if (event.hook_event_name === 'afterFileEdit' && event.file_path) {
      filesTouched.set(event.file_path, (filesTouched.get(event.file_path) || 0) + 1);
    }
  }

  const flags = [];
  for (let i = 1; i < prompts.length; i++) {
    if (looksLikeCorrection(prompts[i].prompt)) {
      flags.push({
        prev: prompts[i - 1]?.prompt,
        correction: prompts[i].prompt,
        at: prompts[i].logged_at,
      });
    }
  }

  const compactTimes = compactions.map((c) => Date.parse(c.logged_at || '')).filter(Number.isFinite);
  let afterCompact = 0;
  for (const flag of flags) {
    const at = Date.parse(flag.at || '');
    if (!Number.isFinite(at)) continue;
    if (compactTimes.some((t) => at >= t && at - t < 30 * 60 * 1000)) afterCompact += 1;
  }

  let health = 'steady';
  if (compactions.length && afterCompact) health = 'memory pressure + corrections';
  else if (flags.length >= 3) health = 'several corrections';
  else if (compactions.length) health = 'memory was compressed';
  else if (flags.length) health = 'a possible correction';

  return {
    id,
    started: start?.logged_at || events[0]?.logged_at,
    ended: end?.logged_at,
    reason: end?.reason,
    durationMs: end?.duration_ms,
    turns: prompts.length,
    filesTouched,
    commands,
    compactions,
    flags,
    afterCompact,
    health,
  };
}

function adviceFor(session) {
  if (session.health === 'memory pressure + corrections') {
    return 'This chat was compressed, and you then had to correct the agent. Next time, start a new chat after a compression warning.';
  }
  if (session.health === 'several corrections') {
    return 'Several prompts looked like corrections. A fresh chat, or shorter instructions, usually helps more than pushing this thread further.';
  }
  if (session.health === 'memory was compressed') {
    return 'Cursor compressed this chat. If answers start to drift, open a new chat instead of continuing here.';
  }
  if (session.health === 'a possible correction') {
    return 'One prompt looked like a correction. Worth a glance — not automatically a failure.';
  }
  return 'No obvious drift in this session.';
}

function summarizeSession(session) {
  const lines = [`\n## Session ${session.id}`];
  if (session.started) lines.push(`- started: ${session.started}`);
  if (session.ended) {
    lines.push(`- ended: ${session.ended} — ${session.reason || 'unknown reason'} (${session.durationMs ?? '?'} ms)`);
  }
  lines.push(`- health: ${session.health}`);
  lines.push(`- turns (prompts sent): ${session.turns}`);
  lines.push(`- note: ${adviceFor(session)}`);

  if (session.filesTouched.size) {
    lines.push(`- files edited (${session.filesTouched.size} unique):`);
    for (const [file, n] of session.filesTouched) lines.push(`  - ${file}${n > 1 ? ` (${n}x)` : ''}`);
  }

  if (session.commands.length) {
    lines.push(`- shell commands run: ${session.commands.length}`);
    for (const command of session.commands.slice(0, 15)) lines.push(`  - ${command.command}`);
    if (session.commands.length > 15) lines.push(`  - …and ${session.commands.length - 15} more`);
  }

  if (session.compactions.length) {
    lines.push(`- context compressions: ${session.compactions.length}`);
    for (const compaction of session.compactions) {
      lines.push(
        `  - ${compaction.logged_at}: ${compaction.context_usage_percent}% full (${compaction.context_tokens}/${compaction.context_window_size} tokens), summarizing ${compaction.messages_to_compact}/${compaction.message_count} messages${compaction.is_first_compaction ? ' — first compression this session' : ''}`,
      );
    }
  }

  if (session.flags.length) {
    lines.push(`- possible drift moments (next prompt read like a correction): ${session.flags.length}`);
    for (const flag of session.flags) {
      lines.push(`  - after "${clip(flag.prev || '(session start)', 70)}" you said "${clip(flag.correction, 70)}"`);
    }
  }

  return lines.join('\n');
}

function renderHtml(generatedAt, events, sessions) {
  const cards = sessions
    .map((session) => {
      const files = [...session.filesTouched.entries()]
        .map(([file, n]) => `<li><code>${esc(file)}</code>${n > 1 ? ` (${n}×)` : ''}</li>`)
        .join('');
      const compacts = session.compactions
        .map(
          (c) =>
            `<li>${esc(c.logged_at)} — ${esc(c.context_usage_percent)}% full, ${esc(c.context_tokens)}/${esc(c.context_window_size)} tokens</li>`,
        )
        .join('');
      const flags = session.flags
        .map(
          (flag) =>
            `<li>After “${esc(clip(flag.prev || 'session start'))}” you said “${esc(clip(flag.correction))}”</li>`,
        )
        .join('');

      return `<article class="card">
        <p class="kicker">${esc(session.health)}</p>
        <h2>Chat ${esc(session.id.slice(0, 8))}</h2>
        <p class="meta">${esc(session.started || 'unknown start')} · ${session.turns} turn${session.turns === 1 ? '' : 's'}</p>
        <p>${esc(adviceFor(session))}</p>
        ${files ? `<h3>Files edited</h3><ul>${files}</ul>` : ''}
        ${compacts ? `<h3>Memory compressed</h3><ul>${compacts}</ul>` : ''}
        ${flags ? `<h3>Possible corrections</h3><ul>${flags}</ul>` : ''}
      </article>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(PRODUCT_NAME)} report</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; font-family: Georgia, "Times New Roman", serif; background: #f6f4ef; color: #1b1a17; }
    main { max-width: 760px; margin: 0 auto; padding: 48px 24px 80px; }
    h1 { font-size: 2rem; font-weight: 600; letter-spacing: -0.03em; }
    .lede { font-size: 1.05rem; line-height: 1.5; max-width: 42rem; }
    .meta { color: #5c584f; }
    .grid { display: grid; gap: 16px; margin-top: 32px; }
    .card { background: #fffdf8; border: 1px solid #ddd6c8; border-radius: 12px; padding: 20px 22px; }
    .kicker { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.72rem; font-family: ui-sans-serif, system-ui, sans-serif; color: #6b4f1d; margin: 0 0 8px; }
    h2 { margin: 0 0 6px; font-size: 1.25rem; }
    h3 { margin: 16px 0 8px; font-size: 0.95rem; font-family: ui-sans-serif, system-ui, sans-serif; }
    ul { margin: 0; padding-left: 1.1rem; }
    code { font-size: 0.86em; }
    footer { margin-top: 40px; color: #5c584f; font-size: 0.9rem; }
  </style>
</head>
<body>
  <main>
    <h1>${esc(PRODUCT_NAME)} report</h1>
    <p class="lede">Generated ${esc(generatedAt)}. ${events.length} recorded events across ${sessions.length} chat${sessions.length === 1 ? '' : 's'}. Nothing here left your computer.</p>
    <div class="grid">${cards || '<p>No chats recorded yet. Use Cursor as normal, then open this report again.</p>'}</div>
    <footer>${esc(PRODUCT_NAME)} is a free tool by <a href="https://www.durellem.com">Durellem Ltd</a>. Correction flags are hints, not verdicts.</footer>
  </main>
</body>
</html>
`;
}

export async function generateReport() {
  const events = await loadEvents();
  if (!events.length) {
    return {
      markdown: `No ${PRODUCT_NAME} log yet. Use Cursor as normal, then run the report again.`,
      html: renderHtml(new Date().toISOString(), [], []),
      sessions: [],
      events: [],
    };
  }

  const grouped = groupBySession(events);
  const sessions = [...grouped.entries()]
    .map(([id, list]) => analyzeSession(id, list))
    .sort((a, b) => (a.started || '').localeCompare(b.started || ''));

  const generatedAt = new Date().toISOString();
  const markdown = [
    `# ${PRODUCT_NAME} report`,
    `Generated ${generatedAt} — ${events.length} events across ${sessions.length} session(s).`,
    '',
    'Correction flags are hints, not verdicts. The useful signal is whether corrections cluster after memory compression.',
    ...sessions.map(summarizeSession),
  ].join('\n');

  return {
    markdown,
    html: renderHtml(generatedAt, events, sessions),
    sessions,
    events,
  };
}

export async function writeReport() {
  await mkdir(DATA_DIR, { recursive: true });
  const report = await generateReport();
  await writeFile(REPORT_MD, report.markdown, 'utf8');
  await writeFile(REPORT_HTML, report.html, 'utf8');
  return report;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const report = await writeReport();
  console.log(report.markdown);
  console.error(`\nAlso written to:\n  ${REPORT_MD}\n  ${REPORT_HTML}`);
}
