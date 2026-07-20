const path = require('path');
const EventEmitter = require('events');

/**
 * Drives WhatsApp via a real headless Chromium browser (whatsapp-web.js/Puppeteer).
 * Best for a computer/server/Docker host. Needs a working Chromium binary,
 * which is why it's a poor fit for constrained environments like Termux.
 */
class WebJsEngine extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    // require()'d lazily so the baileys engine never pulls in puppeteer.
    const { Client, LocalAuth } = require('whatsapp-web.js');
    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: path.join(config.sessionPath, 'webjs') }),
      puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });
  }

  async start() {
    const { client } = this;

    client.on('qr', (qr) => this.emit('qr', qr));
    client.on('ready', () => this.emit('ready'));
    client.on('disconnected', (reason) => this.emit('disconnected', reason));
    client.on('auth_failure', (msg) => this.emit('auth_failure', msg));

    client.on('group_join', (notification) => {
      this.emit('group_join', notification.chatId, notification.recipientIds || []);
    });

    client.on('message', async (message) => {
      if (message.isStatus) return;
      const chat = await message.getChat();
      const mentions = await message.getMentions();

      this.emit('message', {
        body: message.body || '',
        chatId: chat.id._serialized,
        senderId: message.author || message.from,
        isGroup: chat.isGroup,
        mentionedIds: mentions.map((m) => m.id._serialized),
        reply: (text) => message.reply(text),
        deleteForEveryone: () => message.delete(true),
      });
    });

    await client.initialize();
  }

  async stop() {
    await this.client.destroy();
  }

  getSelfId() {
    return this.client.info.wid._serialized;
  }

  async getContactDisplay(id) {
    const contact = await this.client.getContactById(id).catch(() => null);
    return contact ? contact.id.user : id.split('@')[0];
  }

  async getChat(chatId) {
    const chat = await this.client.getChatById(chatId);
    return {
      id: chat.id._serialized,
      isGroup: chat.isGroup,
      participants: (chat.participants || []).map((p) => ({
        id: p.id._serialized,
        isAdmin: Boolean(p.isAdmin || p.isSuperAdmin),
      })),
      sendMessage: (text, mentionIds = []) => chat.sendMessage(text, { mentions: mentionIds }),
      removeParticipants: (ids) => chat.removeParticipants(ids),
    };
  }
}

module.exports = WebJsEngine;
