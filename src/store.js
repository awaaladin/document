const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const STORE_PATH = path.join(process.cwd(), 'data', 'store.json');

function load() {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.error('Failed to read store, starting fresh:', err.message);
    }
    return { groups: {} };
  }
}

let state = load();

function persist() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 2));
}

function getGroup(groupId, defaults) {
  if (!state.groups[groupId]) {
    state.groups[groupId] = {
      antilink: defaults.antilinkDefault,
      filter: defaults.filterDefault,
      warnings: {},
    };
    persist();
  }
  return state.groups[groupId];
}

function setGroupSetting(groupId, key, value, defaults) {
  const group = getGroup(groupId, defaults);
  group[key] = value;
  persist();
}

function addWarning(groupId, userId, defaults) {
  const group = getGroup(groupId, defaults);
  group.warnings[userId] = (group.warnings[userId] || 0) + 1;
  persist();
  return group.warnings[userId];
}

function getWarnings(groupId, userId, defaults) {
  const group = getGroup(groupId, defaults);
  return group.warnings[userId] || 0;
}

function resetWarnings(groupId, userId, defaults) {
  const group = getGroup(groupId, defaults);
  group.warnings[userId] = 0;
  persist();
}

module.exports = {
  getGroup,
  setGroupSetting,
  addWarning,
  getWarnings,
  resetWarnings,
};
