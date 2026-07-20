const qrcode = require('qrcode-terminal');
const config = require('./config');
const logger = require('./logger');
const moderation = require('./moderation/moderation');
const commands = require('./commands');
const { createEngine } = require('./engines');

const engine = createEngine();

engine.on('qr', (qr) => {
  logger.info('Scan this QR code with WhatsApp (Linked Devices):');
  qrcode.generate(qr, { small: true });
});

engine.on('pairing_code', (code) => {
  logger.info(`Pairing code: ${code}`);
  logger.info(
    'In WhatsApp: Settings > Linked Devices > Link a Device > "Link with phone number instead", then enter this code.',
  );
});

engine.on('ready', () => {
  logger.info(`WhatsApp bot ready (${config.engine} engine) as ${engine.getSelfId()}`);
});

engine.on('disconnected', (reason) => {
  logger.warn('Client disconnected:', reason);
});

engine.on('auth_failure', (msg) => {
  logger.error('Authentication failure:', msg);
});

engine.on('group_join', (chatId, participantIds) => {
  moderation.welcomeNewMembers(engine, chatId, participantIds).catch((err) => {
    logger.error('welcomeNewMembers error:', err.message);
  });
});

engine.on('message', async (message) => {
  try {
    const chat = await engine.getChat(message.chatId);

    const moderated = await moderation.handleGroupMessage(engine, chat, message);
    if (moderated) return;

    const handledCommand = await commands.handleCommand(engine, chat, message);
    if (handledCommand) return;

    await commands.handleAutoReply(message);
  } catch (err) {
    logger.error('Error handling message:', err);
  }
});

engine.start().catch((err) => {
  logger.error('Failed to start engine:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  await engine.stop();
  process.exit(0);
});
