# Privacy

xcursorfatiguex never sends data off this computer. There is no account, no telemetry, and no network call in the code.

## What is stored

All files are under `~/.xcursorfatiguex/` (Windows: `C:\Users\<you>\.xcursorfatiguex\`).

| File | Contents |
| --- | --- |
| `events.jsonl` | One JSON object per Cursor hook event, including prompts you typed, file paths edited, and shell commands that ran |
| `rules-snapshots/` | Copies of project rule files as they were at session start |
| `config.json` | Local on/off flags |
| `report.md` / `report.html` | Generated summaries |

Long fields are truncated, but you should still treat the folder as **private**. Do not zip it, commit it, or email it.

## What is not stored

- Cursor account passwords
- The full contents of every file the agent read
- Anything on a Durellem or third-party server

## Removing it

1. Run `UNINSTALL.bat` / `./uninstall.sh` to detach the hooks.
2. Delete the `~/.xcursorfatiguex` folder if you also want the history gone.

Uninstall keeps the log on purpose, so you do not lose a report by removing the add-on.
