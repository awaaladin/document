const config = require('../config');

function createEngine() {
  if (config.engine === 'baileys') {
    const BaileysEngine = require('./baileysEngine');
    return new BaileysEngine(config);
  }
  const WebJsEngine = require('./webjsEngine');
  return new WebJsEngine(config);
}

module.exports = { createEngine };
