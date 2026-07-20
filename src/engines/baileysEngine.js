const path = require('path');
const EventEmitter = require('events');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys');
const logger = require('../logger');

function extractText(message) {
  if (!message) return '';
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage) return message.extendedTextMessage.text || '';
  if (message.imageMessage && message.imageMessage.caption) return message.imageMessage.caption;
  if (message.videoMessage && message.videoMessage.caption) return message.videoMessage.caption;
  return '';
}

function extractMentions(message) {
  const ctx = (message && (message.extendedTextMessage || message.imageMessage || {}).contextInfo) || {};
  return ctx.mentionedJid || [];
}

/**
 * Talks to WhatsApp's multi-device protocol directly over a WebSocket
 * (no browser, no Puppeteer). Ideal for constrained environments like
 * Termux, and supports pairing-code login for single-device testing.
 */
class BaileysEngine extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
  }

  async start() {
    const authDir = path.join(this.config.sessionPath, 'baileys');
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
    });
    this.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && !this.config.pairingPhoneNumber) {
        this.emit('qr', qr);
      }

      if (connection === 'open') {
        this.emit('ready');
      }

      if (connection === 'close') {
        const statusCode = new Boom(lastDisconnect && lastDisconnect.error).output.statusCode;
        this.emit('disconnected', statusCode);
        if (statusCode !== DisconnectReason.loggedOut) {
          this.start().catch((err) => logger.error('Baileys reconnect failed:', err.message));
        }
      }
    });

    if (this.config.pairingPhoneNumber && !sock.authState.creds.registered) {
      try {
        const code = await sock.requestPairingCode(this.config.pairingPhoneNumber);
        this.emit('pairing_code', code);
      } catch (err) {
        logger.error('Failed to request pairing code:', err.message);
      }
    }

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const m of messages) {
        if (!m.message || m.key.fromMe) continue;

        const chatId = m.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');
        const senderId = isGroup ? jidNormalizedUser(m.key.participant) : jidNormalizedUser(chatId);

        this.emit('message', {
          body: extractText(m.message),
          chatId,
          senderId,
          isGroup,
          mentionedIds: extractMentions(m.message),
          reply: (text) => sock.sendMessage(chatId, { text }, { quoted: m }),
          deleteForEveryone: () => sock.sendMessage(chatId, { delete: m.key }),
        });
      }
    });

    sock.ev.on('group-participants.update', ({ id, participants, action }) => {
      if (action === 'add') {
        this.emit('group_join', id, participants.map((p) => jidNormalizedUser(p)));
      }
    });
  }

  async stop() {
    if (this.sock) this.sock.end();
  }

  getSelfId() {
    return jidNormalizedUser(this.sock.user.id);
  }

  async getContactDisplay(id) {
    return id.split('@')[0].split(':')[0];
  }

  async getChat(chatId) {
    const isGroup = chatId.endsWith('@g.us');

    if (!isGroup) {
      return {
        id: chatId,
        isGroup: false,
        participants: [],
        sendMessage: (text) => this.sock.sendMessage(chatId, { text }),
        removeParticipants: async () => {
          throw new Error('Cannot remove participants from a non-group chat');
        },
      };
    }

    const metadata = await this.sock.groupMetadata(chatId);
    return {
      id: chatId,
      isGroup: true,
      participants: metadata.participants.map((p) => ({
        id: jidNormalizedUser(p.id),
        isAdmin: p.admin === 'admin' || p.admin === 'superadmin',
      })),
      sendMessage: (text, mentionIds = []) => this.sock.sendMessage(chatId, { text, mentions: mentionIds }),
      removeParticipants: (ids) => this.sock.groupParticipantsUpdate(chatId, ids, 'remove'),
    };
  }
}

module.exports = BaileysEngine;
