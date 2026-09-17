# xcursorfatiguex

A free, one-click add-on for [Cursor](https://cursor.com).

It does three things:

1. **Reminds** the agent of your project rules at the start of each chat.
2. **Warns you** when Cursor is about to compress the chat (that is when the agent often starts to forget).
3. **Keeps a private report** on your computer so you can see when you had to correct it.

It cannot force Cursor to obey. Cursor does not allow that. What it *can* do is give you a reminder, a warning, and a clear picture — which is the real control available today.

Owner: **Durellem Ltd**. License: MIT (free for anyone to use). Nothing is uploaded anywhere.

---

## Install (about two minutes)

You need [Node.js LTS](https://nodejs.org) once. If `node -v` already prints a version, skip this.

### Windows

1. Download this folder: [Code → Download ZIP](https://github.com/kevinivarson-source/xcursorfatiguex/archive/refs/heads/main.zip), then unzip it somewhere permanent, for example `Documents\xcursorfatiguex`.
2. Double-click **`INSTALL.bat`**.
3. Use Cursor as normal.

### Mac or Linux

1. Download or clone this folder and keep it somewhere permanent.
2. In Terminal: `chmod +x install.sh && ./install.sh`
3. Use Cursor as normal.

### Already in Cursor?

Paste this into a new chat:

```text
Please install xcursorfatiguex from this folder. Run: node cli.mjs install
Then tell me whether status looks good.
```

No restart is usually needed. If it does not show up, restart Cursor once and double-click `STATUS.bat`.

---

## Use it

Do your work in Cursor. That is the whole daily workflow.

When you want to know how a chat went, double-click **`SHOW-REPORT.bat`** (or run `./report.sh`). A page opens in your browser.

To check it is still attached: double-click **`STATUS.bat`**.

To remove it: double-click **`UNINSTALL.bat`**. Your private log stays until you delete the `.xcursorfatiguex` folder in your home directory.

---

## What you will see

| In Cursor | What it means |
| --- | --- |
| Nothing most of the time | Good. xcursorfatiguex is quiet on purpose. |
| A warning that the chat is almost full | Cursor is about to compress memory. If answers start to drift, **start a new chat**. |
| A report that mentions “possible corrections” | Your next prompt looked like “no, don’t do that”. Treat it as a hint, not a verdict. |

The log lives only at `~/.xcursorfatiguex/` (on Windows: `C:\Users\<you>\.xcursorfatiguex\`). It includes prompts you typed, so do not copy that folder to anyone else.

---

## Tech details

Hooks used are the official Cursor Hooks API — see [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md) and [docs/PRIVACY.md](docs/PRIVACY.md).

```bash
node cli.mjs install              # user-wide (recommended)
node cli.mjs install --here       # this project only
node cli.mjs install --observe-only
node cli.mjs status
node cli.mjs report --open
node cli.mjs uninstall
```

The installer writes into `~/.cursor/hooks.json` and **keeps any other hooks you already have**. It points at this folder using the Node.js that ran the installer, so Cursor does not have to guess your PATH.

---

## Honest limits

- Reminding is not enforcing. The model can still ignore rules.
- “Correction” detection is simple pattern matching.
- Each hook starts a short Node process. The events used here are infrequent. Fine-grained `postToolUse` logging is deliberately not included, so xcursorfatiguex stays light.

---

Made by [Durellem Ltd](https://www.durellem.com) and shared free.
