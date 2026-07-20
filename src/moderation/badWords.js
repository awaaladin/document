const { words } = require('../data/badwords.json');

const patterns = words.map((word) => new RegExp(`\\b${word}\\b`, 'i'));

function containsBadWord(text) {
  return patterns.some((re) => re.test(text));
}

module.exports = { containsBadWord };
