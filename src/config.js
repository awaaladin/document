require('dotenv').config();

function parseBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
}

module.exports = {
  prefix: process.env.PREFIX || '!',
  botAdmins: (process.env.BOT_ADMINS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
  antilinkDefault: parseBool(process.env.ANTILINK_DEFAULT, true),
  filterDefault: parseBool(process.env.FILTER_DEFAULT, true),
  maxWarnings: parseInt(process.env.MAX_WARNINGS, 10) || 3,
  safeBrowsingApiKey: process.env.GOOGLE_SAFE_BROWSING_API_KEY || '',
  sessionPath: process.env.SESSION_PATH || '.wwebjs_auth',
};
