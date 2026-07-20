const https = require('https');
const config = require('../config');
const logger = require('../logger');
const blocklist = require('../data/blocklist.json');

const URL_REGEX = /\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+/gi;

function extractUrls(text) {
  const matches = text.match(URL_REGEX) || [];
  return matches.map((raw) => {
    const withProtocol = raw.startsWith('http') ? raw : `http://${raw}`;
    try {
      return new URL(withProtocol);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function hostMatches(hostname, list) {
  const host = hostname.toLowerCase();
  return list.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

function checkLocalHeuristics(url) {
  const fullUrl = url.href.toLowerCase();

  if (hostMatches(url.hostname, blocklist.domains)) {
    return { malicious: true, reason: `known malicious domain (${url.hostname})` };
  }

  if (blocklist.suspiciousKeywords.some((kw) => fullUrl.includes(kw))) {
    return { malicious: true, reason: 'suspicious keyword pattern (looks like phishing)' };
  }

  if (hostMatches(url.hostname, blocklist.shorteners)) {
    return { malicious: false, suspicious: true, reason: `shortened link (${url.hostname}) hides the real destination` };
  }

  return { malicious: false, suspicious: false };
}

function callSafeBrowsing(urls) {
  return new Promise((resolve) => {
    if (!config.safeBrowsingApiKey || urls.length === 0) {
      resolve(new Set());
      return;
    }

    const body = JSON.stringify({
      client: { clientId: 'whatsapp-group-bot', clientVersion: '1.0.0' },
      threatInfo: {
        threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
        platformTypes: ['ANY_PLATFORM'],
        threatEntryTypes: ['URL'],
        threatEntries: urls.map((u) => ({ url: u.href })),
      },
    });

    const req = https.request(
      {
        hostname: 'safebrowsing.googleapis.com',
        path: `/v4/threatMatches:find?key=${encodeURIComponent(config.safeBrowsingApiKey)}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 5000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const flagged = new Set((parsed.matches || []).map((m) => m.threat.url));
            resolve(flagged);
          } catch (err) {
            logger.error('Safe Browsing response parse error:', err.message);
            resolve(new Set());
          }
        });
      },
    );

    req.on('timeout', () => req.destroy());
    req.on('error', (err) => {
      logger.error('Safe Browsing API error:', err.message);
      resolve(new Set());
    });
    req.write(body);
    req.end();
  });
}

/**
 * Scans message text for links and classifies them.
 * Returns { malicious: boolean, reasons: string[] }
 */
async function scanText(text) {
  const urls = extractUrls(text);
  if (urls.length === 0) {
    return { malicious: false, reasons: [] };
  }

  const reasons = [];
  let malicious = false;

  for (const url of urls) {
    const result = checkLocalHeuristics(url);
    if (result.malicious) {
      malicious = true;
      reasons.push(result.reason);
    } else if (result.suspicious) {
      reasons.push(result.reason);
    }
  }

  const flaggedBySafeBrowsing = await callSafeBrowsing(urls);
  if (flaggedBySafeBrowsing.size > 0) {
    malicious = true;
    reasons.push('flagged by Google Safe Browsing');
  }

  return { malicious, reasons };
}

module.exports = { scanText, extractUrls };
