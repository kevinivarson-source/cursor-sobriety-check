# How Cursor Sobriety Check works

Cursor Sobriety Check is a thin wrapper around Cursor's public [Hooks API](https://cursor.com/docs/hooks). It does not read Cursor's internal databases.

## Install

`cli.mjs install` merges these user (or project) hooks into `hooks.json`, without removing anyone else's hooks:

- `sessionStart` / `sessionEnd`
- `beforeSubmitPrompt`
- `afterFileEdit`
- `afterShellExecution`
- `preCompact`
- `stop`

The command is the absolute path of the Node binary that ran the installer, plus `watch.mjs` in this folder. That avoids PATH surprises inside Cursor.

## Runtime

Cursor spawns `watch.mjs` and sends one JSON payload on stdin.

`watch.mjs` always replies with `continue: true`. If it crashes, Cursor still continues (fail-open).

On `sessionStart` it:

1. Snapshots `.cursor/rules/*.mdc` and `.cursorrules` into `~/.xcursorfatiguex/rules-snapshots/`.
2. If `remindRules` is on, returns a short `additional_context` string (capped, not the full rule files) so the agent sees the rules at the start of the chat.

On `preCompact` it:

1. Logs the official compaction payload (`context_usage_percent`, token counts, first-compaction flag).
2. If `warnOnCompact` is on, returns `user_message` so Cursor can show a warning. Compaction itself cannot be blocked — Cursor documents `preCompact` as observation-only.

Every event is appended to `~/.xcursorfatiguex/events.jsonl`. Long text fields are truncated at 3,000 characters.

## Report

`report.mjs` groups events by session and prints:

- turns, files edited, shell commands
- every compaction, with usage %
- prompts that look like corrections (regex, not a model)
- a health line if corrections cluster within 30 minutes after a compaction

It writes `report.md` and `report.html` next to the log.

## Config

`~/.xcursorfatiguex/config.json`:

```json
{
  "remindRules": true,
  "warnOnCompact": true
}
```

`install --observe-only` sets both to `false`.

## Why not more hooks?

`postToolUse` fires on every tool call. That is the fastest way to make a watcher feel slow. The events above already answer: *when did memory compress, and did the user then have to correct the agent?*
