# WhatsApp Group Manager Bot

A WhatsApp bot built on [whatsapp-web.js](https://wwebjs.dev/) that:

- Auto-replies to greetings and commands
- Detects and removes malicious/phishing links (local blocklist + optional Google Safe Browsing lookup)
- Removes messages with inappropriate language
- Warns offending users and auto-kicks them after too many warnings (bot must be a group admin)
- Sends a welcome message to new group members

> **Heads up:** whatsapp-web.js automates a real WhatsApp account by driving a
> headless WhatsApp Web session. This is not WhatsApp's official Business API,
> is against WhatsApp's Terms of Service for bot use, and carries a risk of the
> linked number being banned, especially with heavy automated messaging. Use a
> number you're comfortable putting at risk, not your personal primary number.

## How it works

The bot logs in by scanning a QR code with WhatsApp (Settings → Linked
Devices), exactly like WhatsApp Web. Once linked, the session is cached to
disk so you don't need to rescan on every restart.

## Setup

### 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env` to taste — command prefix, warning threshold, optional Safe
Browsing API key, etc. See comments in the file for details.

### 2. Run with Docker (recommended)

```bash
docker compose up -d --build
docker compose logs -f
```

On first run, a QR code is printed in the logs. Scan it from your phone:
WhatsApp → Settings → Linked Devices → Link a Device. The session persists in
a Docker volume, so future restarts won't need a rescan.

### 3. Run locally without Docker

Requires Node.js 18+ and a local Chrome/Chromium install.

```bash
npm install
npm start
```

Scan the QR code printed in your terminal.

## Bot commands

All commands use the prefix set by `PREFIX` in `.env` (default `!`).

| Command | Who | Description |
|---|---|---|
| `!help` | anyone | List commands |
| `!ping` | anyone | Health check |
| `!rules` | anyone | Show group rules |
| `!warnings @user` | anyone | Show a user's warning count |
| `!warn @user` | group admin | Manually add a warning |
| `!resetwarnings @user` | group admin | Clear a user's warnings |
| `!kick @user` | group admin | Remove a user (bot must be a group admin) |
| `!antilink on\|off` | group admin | Toggle malicious-link filtering per group |
| `!filter on\|off` | group admin | Toggle bad-language filtering per group |

"Group admin" means a real WhatsApp admin of that group, or a number listed in
`BOT_ADMINS` in `.env`.

## Customizing detection

- `src/data/blocklist.json` — known malicious domains, URL shorteners, and
  phishing keyword patterns. Add to these lists as you find new abuse.
- `src/data/badwords.json` — words that get a message auto-removed.
- Set `GOOGLE_SAFE_BROWSING_API_KEY` in `.env` for real-time malicious URL
  lookups via [Google Safe Browsing](https://developers.google.com/safe-browsing/v4/get-started)
  in addition to the local blocklist.

## Notes on group moderation permissions

For the bot to delete other people's messages or remove members, the
WhatsApp account the bot is running as **must be an admin of that group**.
Without that, it will still detect and warn, but deletion/kick actions will
silently fail (logged to the console) and messages will say so.

## Project structure

```
src/
  index.js               entrypoint: wires up the whatsapp-web.js client
  config.js               env-driven configuration
  logger.js                timestamped console logging
  store.js                 JSON-file persistence for warnings & per-group settings
  commands.js              command parsing + auto-reply
  moderation/
    linkDetector.js        URL extraction + blocklist/heuristics/Safe Browsing
    badWords.js             bad-word matching
    moderation.js           ties detection to delete/warn/kick actions
  data/
    blocklist.json          seed malicious domains / shorteners / keywords
    badwords.json            seed bad-word list
```
