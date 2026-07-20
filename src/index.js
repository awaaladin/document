const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('./config');
const logger = require('./logger');
const moderation = require('./moderation/moderation');
const commands = require('./commands');

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: config.sessionPath }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('qr', (qr) => {
  logger.info('Scan this QR code with WhatsApp (Linked Devices):');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  logger.info(`WhatsApp bot ready as ${client.info.wid.user}`);
});

client.on('disconnected', (reason) => {
  logger.warn('Client disconnected:', reason);
});

client.on('auth_failure', (msg) => {
  logger.error('Authentication failure:', msg);
});

client.on('group_join', (notification) => {
  moderation.welcomeNewMembers(client, notification).catch((err) => {
    logger.error('welcomeNewMembers error:', err.message);
  });
});

client.on('message', async (message) => {
  try {
    if (message.isStatus) return;

    const moderated = await moderation.handleGroupMessage(client, message);
    if (moderated) return;

    const handledCommand = await commands.handleCommand(client, message);
    if (handledCommand) return;

    await commands.handleAutoReply(message);
  } catch (err) {
    logger.error('Error handling message:', err);
  }
});

client.initialize();

process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  await client.destroy();
  process.exit(0);
});
