# WhatsApp Group Manager Bot

A WhatsApp bot that:

- Auto-replies to greetings and commands
- Detects and removes malicious/phishing links (local blocklist + optional Google Safe Browsing lookup)
- Removes messages with inappropriate language
- Warns offending users and auto-kicks them after too many warnings (bot must be a group admin)
- Sends a welcome message to new group members

It supports **two interchangeable connection engines**, switchable with the
`ENGINE` variable in `.env` — all moderation/command logic is shared between
them:

| Engine | How it connects | Best for | Login |
|---|---|---|---|
| `webjs` (default) | [whatsapp-web.js](https://wwebjs.dev/) — drives a real headless Chromium browser | A computer, server, or Docker host with Chromium available | Scan a QR code |
| `baileys` | [Baileys](https://baileys.wiki/) — talks to WhatsApp's multi-device protocol directly over a WebSocket, no browser | Constrained environments like **Termux on Android** | Scan a QR code, or type in a pairing code |

> **Heads up:** both engines automate a real WhatsApp account rather than
> using WhatsApp's official Business API. This is against WhatsApp's Terms of
> Service for bot use and carries a risk of the linked number being banned,
> especially with heavy automated messaging. Use a number you're comfortable
> putting at risk, not your personal primary number.

## How it works

The bot logs in as a *linked device* on a WhatsApp account (Settings →
Linked Devices), exactly like WhatsApp Web/Desktop. Once linked, the session
is cached to disk so you don't need to log in again on every restart. It then
works identically no matter what client (phone app, WhatsApp Web, Desktop)
the other group members use — that's just how WhatsApp groups work.

## Setup

### 1. Configure environment

```bash
cp .env.example .env
```

Set `ENGINE=webjs` or `ENGINE=baileys`, plus the command prefix, warning
threshold, optional Safe Browsing API key, etc. See comments in the file for
details.

### 2a. Run with Docker (recommended for `webjs` on a computer/server)

```bash
docker compose up -d --build
docker compose logs -f
```

A QR code prints in the logs on first run. Scan it from your phone: WhatsApp
→ Settings → Linked Devices → Link a Device. The session persists in a Docker
volume, so future restarts won't need a rescan.

### 2b. Run locally without Docker

Requires Node.js 18+, and (for `ENGINE=webjs`) a local Chrome/Chromium
install.

```bash
npm install
npm start
```

Scan the QR code printed in your terminal (or, for `ENGINE=baileys` with
`PAIRING_PHONE_NUMBER` set, type in the printed pairing code instead).

### 2c. Run on your phone with Termux (no computer needed)

Use `ENGINE=baileys` here — `webjs` needs a working Chromium binary, which is
unreliable to get running inside Termux (no root, missing shared libraries,
ARM build quirks). Baileys is pure Node.js with no browser dependency.

```bash
# In Termux
pkg update && pkg upgrade
pkg install nodejs git

git clone https://github.com/awaaladin/document.git
cd document
git checkout claude/whatsapp-bot-j1lj50

npm install
cp .env.example .env
nano .env   # set ENGINE=baileys, and PAIRING_PHONE_NUMBER=<your number, digits only>

npm start
```

If you set `PAIRING_PHONE_NUMBER`, the bot prints an 8-character pairing
code instead of a QR code — this solves the "one phone" problem, since you
don't need a second screen to scan anything:

1. On the same phone: open WhatsApp → **Settings → Linked Devices → Link a
   Device → Link with phone number instead**.
2. Type in the code printed in Termux.
3. Termux will log `WhatsApp bot ready (baileys engine) as <your number>` —
   the bot is now live, running entirely on your phone.

Leave `PAIRING_PHONE_NUMBER` blank if you'd rather scan a QR code (e.g. from
a second device, or a screenshot shown on another screen).

To keep it running when Termux isn't in the foreground, install `termux-wake-lock`
(`pkg install termux-api`, then run `termux-wake-lock`) so Android doesn't
kill the process to save battery.

### Testing it actually works

Once any engine says "ready":

1. Create a small test WhatsApp group.
2. Add the bot's linked number to the group, and make it a **group admin**
   (delete/kick only work if the bot is an admin — see below).
3. From a different number in that group, send `!ping` — the bot should
   reply "Pong!".
4. Send a message with a known-bad test link, e.g.
   `http://grabify.link/test123` — the bot should delete it and reply with a
   warning.
5. Repeat until warnings hit `MAX_WARNINGS` (default 3) — the offending user
   should get auto-removed.

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
  index.js               entrypoint: wires an engine to moderation/commands
  config.js               env-driven configuration (incl. ENGINE choice)
  logger.js                timestamped console logging
  store.js                 JSON-file persistence for warnings & per-group settings
  commands.js              command parsing + auto-reply
  engines/
    index.js               picks webjsEngine or baileysEngine from ENGINE
    webjsEngine.js          whatsapp-web.js adapter (Chromium/Puppeteer)
    baileysEngine.js        Baileys adapter (pure WebSocket, no browser)
  moderation/
    linkDetector.js        URL extraction + blocklist/heuristics/Safe Browsing
    badWords.js             bad-word matching
    moderation.js           ties detection to delete/warn/kick actions
  data/
    blocklist.json          seed malicious domains / shorteners / keywords
    badwords.json            seed bad-word list
```

Both engines are normalized behind the same interface (`message.body`,
`message.reply()`, `chat.sendMessage()`, etc. — see `engines/webjsEngine.js`
and `engines/baileysEngine.js`), so `moderation.js` and `commands.js` don't
know or care which one is running underneath.
