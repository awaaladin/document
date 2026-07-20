const config = require('../config');
const store = require('../store');
const logger = require('../logger');
const linkDetector = require('./linkDetector');
const badWords = require('./badWords');

function isGroupAdmin(chat, userId) {
  const participant = chat.participants.find((p) => p.id._serialized === userId);
  return Boolean(participant && (participant.isAdmin || participant.isSuperAdmin));
}

function isBotAdmin(chat, botId) {
  return isGroupAdmin(chat, botId);
}

async function takeAction(client, chat, message, senderId, reason) {
  try {
    await message.delete(true);
  } catch (err) {
    logger.warn(`Could not delete message in ${chat.id._serialized}:`, err.message);
  }

  const warnings = store.addWarning(chat.id._serialized, senderId, config);
  const mention = await client.getContactById(senderId).catch(() => null);
  const mentionText = mention ? `@${mention.id.user}` : 'that user';

  if (warnings >= config.maxWarnings) {
    let kicked = false;
    if (isBotAdmin(chat, client.info.wid._serialized)) {
      try {
        await chat.removeParticipants([senderId]);
        kicked = true;
      } catch (err) {
        logger.warn(`Could not remove participant ${senderId}:`, err.message);
      }
    }
    store.resetWarnings(chat.id._serialized, senderId, config);

    await chat.sendMessage(
      kicked
        ? `${mentionText} removed a message (${reason}) and hit ${warnings}/${config.maxWarnings} warnings — removed from the group.`
        : `${mentionText} removed a message (${reason}) and hit ${warnings}/${config.maxWarnings} warnings, but I'm not an admin here so I couldn't remove them.`,
      { mentions: mention ? [mention] : [] },
    );
  } else {
    await chat.sendMessage(
      `${mentionText}, your message was removed (${reason}). Warning ${warnings}/${config.maxWarnings}.`,
      { mentions: mention ? [mention] : [] },
    );
  }
}

/**
 * Inspects an incoming group message and moderates it if needed.
 * Returns true if the message was acted on (deleted).
 */
async function handleGroupMessage(client, message) {
  const chat = await message.getChat();
  if (!chat.isGroup) return false;

  const senderId = message.author || message.from;
  if (senderId === client.info.wid._serialized) return false;
  if (config.botAdmins.includes(senderId)) return false;
  if (isGroupAdmin(chat, senderId)) return false;

  const settings = store.getGroup(chat.id._serialized, config);
  const body = message.body || '';

  if (settings.antilink) {
    const linkResult = await linkDetector.scanText(body);
    if (linkResult.malicious) {
      await takeAction(client, chat, message, senderId, linkResult.reasons.join('; ') || 'malicious link');
      return true;
    }
  }

  if (settings.filter && badWords.containsBadWord(body)) {
    await takeAction(client, chat, message, senderId, 'inappropriate language');
    return true;
  }

  return false;
}

async function welcomeNewMembers(client, notification) {
  try {
    const chat = await notification.getChat();
    if (!chat.isGroup) return;
    for (const userId of notification.recipientIds) {
      const contact = await client.getContactById(userId).catch(() => null);
      const name = contact ? `@${contact.id.user}` : 'there';
      await chat.sendMessage(
        `Welcome ${name}! Please keep chat respectful — malicious links and improper language get removed automatically.`,
        { mentions: contact ? [contact] : [] },
      );
    }
  } catch (err) {
    logger.error('Error sending welcome message:', err.message);
  }
}

module.exports = { handleGroupMessage, welcomeNewMembers, isGroupAdmin };
