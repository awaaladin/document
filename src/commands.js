const config = require('./config');
const store = require('./store');
const logger = require('./logger');
const { isGroupAdmin } = require('./moderation/moderation');

const HELP_TEXT = `*Available commands* (prefix: ${config.prefix})
${config.prefix}help - show this message
${config.prefix}ping - check the bot is alive
${config.prefix}rules - show group rules
${config.prefix}warnings @user - show a user's warning count

*Group admin only:*
${config.prefix}warn @user [reason] - manually warn a user
${config.prefix}resetwarnings @user - clear a user's warnings
${config.prefix}kick @user - remove a user (bot must be a group admin)
${config.prefix}antilink on|off - toggle malicious-link filtering
${config.prefix}filter on|off - toggle bad-language filtering`;

const GREETINGS = ['hi', 'hello', 'hey', 'hi there', 'yo'];

function isSenderAdmin(chat, senderId) {
  if (config.botAdmins.includes(senderId)) return true;
  if (!chat.isGroup) return false;
  return isGroupAdmin(chat, senderId);
}

async function requireGroupAndAdmin(chat, senderId, message) {
  if (!chat.isGroup) {
    await message.reply('That command only works inside a group.');
    return false;
  }
  if (!isSenderAdmin(chat, senderId)) {
    await message.reply('Only group admins can use that command.');
    return false;
  }
  return true;
}

async function handleCommand(engine, chat, message) {
  const body = (message.body || '').trim();
  if (!body.startsWith(config.prefix)) return false;

  const [rawCmd, ...args] = body.slice(config.prefix.length).trim().split(/\s+/);
  const cmd = rawCmd.toLowerCase();
  const senderId = message.senderId;
  const targetId = message.mentionedIds[0];

  switch (cmd) {
    case 'help':
      await message.reply(HELP_TEXT);
      return true;

    case 'ping': {
      const start = Date.now();
      await message.reply('Pong!');
      logger.info(`Replied to ping in ${Date.now() - start}ms`);
      return true;
    }

    case 'rules':
      await message.reply(
        'Group rules:\n1. Be respectful.\n2. No malicious/spam links.\n3. No harassment or improper language.\nBreaking these gets your message removed and adds a warning.',
      );
      return true;

    case 'warnings': {
      if (!chat.isGroup) {
        await message.reply('That command only works inside a group.');
        return true;
      }
      const id = targetId || senderId;
      const count = store.getWarnings(chat.id, id, config);
      await message.reply(`That user has ${count}/${config.maxWarnings} warnings.`);
      return true;
    }

    case 'warn': {
      if (!(await requireGroupAndAdmin(chat, senderId, message))) return true;
      if (!targetId) {
        await message.reply(`Mention a user to warn, e.g. ${config.prefix}warn @user`);
        return true;
      }
      const count = store.addWarning(chat.id, targetId, config);
      await message.reply(`Warned. That user now has ${count}/${config.maxWarnings} warnings.`);
      return true;
    }

    case 'resetwarnings': {
      if (!(await requireGroupAndAdmin(chat, senderId, message))) return true;
      if (!targetId) {
        await message.reply(`Mention a user, e.g. ${config.prefix}resetwarnings @user`);
        return true;
      }
      store.resetWarnings(chat.id, targetId, config);
      await message.reply('Warnings cleared for that user.');
      return true;
    }

    case 'kick': {
      if (!(await requireGroupAndAdmin(chat, senderId, message))) return true;
      if (!targetId) {
        await message.reply(`Mention a user to kick, e.g. ${config.prefix}kick @user`);
        return true;
      }
      try {
        await chat.removeParticipants([targetId]);
        await message.reply('User removed from the group.');
      } catch (err) {
        logger.warn('Kick failed:', err.message);
        await message.reply("Couldn't remove that user — make sure I'm a group admin.");
      }
      return true;
    }

    case 'antilink':
    case 'filter': {
      if (!(await requireGroupAndAdmin(chat, senderId, message))) return true;
      const setting = args[0] && args[0].toLowerCase();
      if (setting !== 'on' && setting !== 'off') {
        await message.reply(`Usage: ${config.prefix}${cmd} on|off`);
        return true;
      }
      store.setGroupSetting(chat.id, cmd === 'antilink' ? 'antilink' : 'filter', setting === 'on', config);
      await message.reply(`${cmd === 'antilink' ? 'Malicious-link filter' : 'Bad-language filter'} turned ${setting}.`);
      return true;
    }

    default:
      return false;
  }
}

async function handleAutoReply(message) {
  const body = (message.body || '').trim().toLowerCase();
  if (GREETINGS.includes(body)) {
    await message.reply('Hey! Type !help to see what I can do.');
    return true;
  }
  return false;
}

module.exports = { handleCommand, handleAutoReply, HELP_TEXT };
