const config = require('../config');
const store = require('../store');
const logger = require('../logger');
const linkDetector = require('./linkDetector');
const badWords = require('./badWords');

function isGroupAdmin(chat, userId) {
  const participant = chat.participants.find((p) => p.id === userId);
  return Boolean(participant && participant.isAdmin);
}

async function takeAction(engine, chat, message, senderId, reason) {
  try {
    await message.deleteForEveryone();
  } catch (err) {
    logger.warn(`Could not delete message in ${chat.id}:`, err.message);
  }

  const warnings = store.addWarning(chat.id, senderId, config);
  const mentionText = `@${await engine.getContactDisplay(senderId)}`;

  if (warnings >= config.maxWarnings) {
    let kicked = false;
    if (isGroupAdmin(chat, engine.getSelfId())) {
      try {
        await chat.removeParticipants([senderId]);
        kicked = true;
      } catch (err) {
        logger.warn(`Could not remove participant ${senderId}:`, err.message);
      }
    }
    store.resetWarnings(chat.id, senderId, config);

    await chat.sendMessage(
      kicked
        ? `${mentionText} removed a message (${reason}) and hit ${warnings}/${config.maxWarnings} warnings — removed from the group.`
        : `${mentionText} removed a message (${reason}) and hit ${warnings}/${config.maxWarnings} warnings, but I'm not an admin here so I couldn't remove them.`,
      [senderId],
    );
  } else {
    await chat.sendMessage(
      `${mentionText}, your message was removed (${reason}). Warning ${warnings}/${config.maxWarnings}.`,
      [senderId],
    );
  }
}

/**
 * Inspects an incoming group message and moderates it if needed.
 * Returns true if the message was acted on (deleted).
 */
async function handleGroupMessage(engine, chat, message) {
  if (!message.isGroup) return false;

  const senderId = message.senderId;
  if (senderId === engine.getSelfId()) return false;
  if (config.botAdmins.includes(senderId)) return false;
  if (isGroupAdmin(chat, senderId)) return false;

  const settings = store.getGroup(chat.id, config);
  const body = message.body || '';

  if (settings.antilink) {
    const linkResult = await linkDetector.scanText(body);
    if (linkResult.malicious) {
      await takeAction(engine, chat, message, senderId, linkResult.reasons.join('; ') || 'malicious link');
      return true;
    }
  }

  if (settings.filter && badWords.containsBadWord(body)) {
    await takeAction(engine, chat, message, senderId, 'inappropriate language');
    return true;
  }

  return false;
}

async function welcomeNewMembers(engine, chatId, participantIds) {
  try {
    const chat = await engine.getChat(chatId);
    if (!chat.isGroup) return;
    for (const userId of participantIds) {
      const mentionText = `@${await engine.getContactDisplay(userId)}`;
      await chat.sendMessage(
        `Welcome ${mentionText}! Please keep chat respectful — malicious links and improper language get removed automatically.`,
        [userId],
      );
    }
  } catch (err) {
    logger.error('Error sending welcome message:', err.message);
  }
}

module.exports = { handleGroupMessage, welcomeNewMembers, isGroupAdmin };
