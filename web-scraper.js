'use strict';
/**
 * BHARAT WATCH — WEB SCRAPER
 * UltimateWebScraper-style: direct → proxy → cheerio → LLM fallback
 * Respectful: rotating UAs, random delays, circuit breakers, rate limiting
 */
const fetch   = require('node-fetch');
const cheerio = require('cheerio');
const { makeLogger } = require('../core/logger');
const L = makeLogger('SCRAPER');

// ── User Agent Pool ────────────────────────────────────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  'BharatWatch-Bot/1.0 (+https://bharatwatch.in/bot)',
];
const randomUA  = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const delay     = ms => new Promise(r => setTimeout(r, ms));
const jitter    = (min=2000, max=6000) => delay(Math.floor(Math.random()*(max-min)+min));
const getDomain = url => { try { return new URL(url).hostname; } catch { return url; } };

// ── Circuit Breakers ───────────────────────────────────────────────────────
const circuits = new Map();
const isOpen = url => {
  const d = getDomain(url), cb = circuits.get(d);
  if (!cb) return false;
  if (cb.failures >= 3 && Date.now()-cb.lastFail < 15*60_000) return true;
  if (cb.failures >= 3) { circuits.delete(d); return false; }
  return false;
};
const fail = url => {
  const d = getDomain(url);
  const cb = circuits.get(d) || { failures:0, lastFail:0 };
  cb.failures++; cb.lastFail = Date.now(); circuits.set(d, cb);
  if (cb.failures >= 3) L.warn(`Circuit OPEN: ${d} (${cb.failures} failures)`);
};
const succeed = url => {
  const d = getDomain(url);
  const cb = circuits.get(d);
  if (cb) cb.failures = Math.max(0, cb.failures - 1);
};

// ── Rate Limiter ───────────────────────────────────────────────────────────
const lastFetch = new Map();
const rateLimit = async (url, limitMs=60_000) => {
  const d = getDomain(url), last = lastFetch.get(d)||0;
  const elapsed = Date.now()-last;
  if (elapsed < limitMs) {
    const wait = limitMs-elapsed+Math.random()*2000;
    L.info(`Rate limit: waiting ${(wait/1000).toFixed(1)}s for ${d}`);
    await delay(wait);
  }
  lastFetch.set(d, Date.now());
};

// ── Core HTTP Fetcher ──────────────────────────────────────────────────────
const PROXIES = [
  'https://api.allorigins.win/get?url=',
  'https://api.codetabs.com/v1/proxy?quest=',
];

async function httpGet(url, opts={}) {
  const { timeout=20_000, retries=2, useProxy=false } = opts;
  if (isOpen(url)) throw new Error(`Circuit open: ${getDomain(url)}`);

  const targets = useProxy
    ? [PROXIES[0]+encodeURIComponent(url), PROXIES[1]+encodeURIComponent(url), url]
    : [url, PROXIES[0]+encodeURIComponent(url)];

  let lastErr;
  for (let i=0; i <= Math.min(retries, targets.length-1); i++) {
    const target = targets[i];
    try {
      const ctrl = new AbortController();
      const tmr  = setTimeout(() => ctrl.abort(), timeout);
      const res  = await fetch(target, {
        signal : ctrl.signal,
        headers: {
          'User-Agent'     : randomUA(),
          'Accept'         : 'text/html,application/xhtml+xml,*/*;q=0.8',
          'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.7',
          'Referer'        : 'https://www.google.co.in/',
          'DNT'            : '1',
        },
      });
      clearTimeout(tmr);
      if (!res.ok) {
        if (res.status===429) {
          const ra = parseInt(res.headers.get('retry-after')||'60');
          L.warn(`429 — waiting ${ra}s`); await delay(ra*1000);
        }
        throw new Error(`HTTP ${res.status}`);
      }
      let text;
      if (target.includes('allorigins.win')||target.includes('codetabs.com')) {
        const j = await res.json(); text = j.contents||'';
      } else { text = await res.text(); }
      succeed(url);
      return text;
    } catch(e) {
      lastErr = e;
      L.warn(`Attempt ${i+1} failed for ${getDomain(url)}: ${e.message}`);
      if (i < retries) await jitter(1500, 3500);
    }
  }
  fail(url); throw lastErr;
}

// ── HTML Parsing Helpers ───────────────────────────────────────────────────
const parseHTML    = html => cheerio.load(html, { decodeEntities: true });
const txt          = $el  => $el.text().replace(/\s+/g,' ').trim();

function extractTable($, tableSelector, rowSelector, colNames) {
  const rows = [];
  $(tableSelector).find(rowSelector).each((_, el) => {
    const cols = $(el).find('td');
    if (cols.length < colNames.length) return;
    const row = {};
    colNames.forEach((n,i) => { row[n] = txt($(cols[i])); });
    if (Object.values(row).some(v=>v.length>0)) rows.push(row);
  });
  return rows;
}

// ── LLM Fallback ──────────────────────────────────────────────────────────
async function llmExtract(html, instruction) {
  if (process.env.DEMO_MODE==='true') return null;
  try {
    const llm = require('../intelligence/llm-adapter');
    const trimmed = html
      .replace(/<script[\s\S]*?<\/script>/gi,'')
      .replace(/<style[\s\S]*?<\/style>/gi,'')
      .replace(/<!--[\s\S]*?-->/g,'')
      .replace(/\s+/g,' ')
      .slice(0, 8000);
    const text = await llm.call(
      `Extract structured data from this webpage HTML.\n${instruction}\n\nHTML:\n${trimmed}\n\nReturn ONLY valid JSON, no markdown.`,
      'markets'
    );
    return JSON.parse(text.replace(/```json\s*/i,'').replace(/```$/,'').trim());
  } catch(e) { L.warn('LLM extract failed: '+e.message); return null; }
}

module.exports = {
  httpGet, parseHTML, txt, extractTable,
  llmExtract, rateLimit, jitter,
  circuitStatus: () => Object.fromEntries(
    [...circuits.entries()].map(([d,cb])=>[d,{failures:cb.failures,open:cb.failures>=3}])
  ),
  lastFetchTimes: () => Object.fromEntries(lastFetch.entries()),
};
