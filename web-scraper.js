'use strict';
/**
 * BHARAT WATCH — WEB SCRAPER (UltimateWebScraper-style)
 *
 * FIX BUG-11: clearTimeout now in finally block — no timer leaks on error
 * ASSUMPTION-1 FIX: 4 proxy fallbacks, not just allorigins.win
 * ASSUMPTION-2: JS-rendered sites (Moneycontrol/BSE) always fall through to LLM — documented clearly
 */
const fetch   = require('node-fetch');
const cheerio = require('cheerio');
const { makeLogger } = require('../core/logger');
const L = makeLogger('SCRAPER');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'BharatWatch-Bot/1.0 (India Intelligence; +https://bharatwatch.in/bot)',
];

const randomUA  = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const delay     = ms  => new Promise(r => setTimeout(r, ms));
const jitter    = (min=2000, max=6000) => delay(Math.floor(Math.random()*(max-min)+min));
const getDomain = url => { try { return new URL(url).hostname; } catch { return url; } };

// ── Circuit Breakers ──────────────────────────────────────────────────────
const circuits  = new Map();
const RESET_MS  = 15 * 60_000;

const isOpen = url => {
  const d = getDomain(url), cb = circuits.get(d);
  if (!cb) return false;
  if (cb.failures >= 3 && Date.now()-cb.lastFail < RESET_MS) return true;
  if (cb.failures >= 3) { circuits.delete(d); return false; }
  return false;
};
const recordFail    = url => { const d=getDomain(url); const cb=circuits.get(d)||{failures:0,lastFail:0}; cb.failures++; cb.lastFail=Date.now(); circuits.set(d,cb); if(cb.failures>=3) L.warn(`Circuit OPEN: ${d}`); };
const recordSuccess = url => { const d=getDomain(url); const cb=circuits.get(d); if(cb&&cb.failures>0) cb.failures=Math.max(0,cb.failures-1); };

// ── Rate Limiter ──────────────────────────────────────────────────────────
const lastFetch = new Map();
const rateLimit = async (url, limitMs=60_000) => {
  const d=getDomain(url), last=lastFetch.get(d)||0, elapsed=Date.now()-last;
  if (elapsed < limitMs) { const wait=limitMs-elapsed+Math.random()*2000; L.info(`Rate limit: waiting ${(wait/1000).toFixed(1)}s for ${d}`); await delay(wait); }
  lastFetch.set(d, Date.now());
};

// ── PROXY CHAIN — FIX ASSUMPTION-1: 4 fallback proxies, not just allorigins ──
const PROXIES = [
  url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://cors-anywhere.herokuapp.com/${url}`,  // requires header
];

async function fetchViaProxy(url, proxyIndex, timeout) {
  const proxyUrl = PROXIES[proxyIndex](url);
  const ctrl = new AbortController();
  const tmr  = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(proxyUrl, { signal: ctrl.signal, headers: { 'User-Agent': randomUA() } });
    if (!res.ok) throw new Error(`Proxy ${proxyIndex} HTTP ${res.status}`);
    const j = await res.json().catch(() => null);
    return j?.contents || j?.data || await res.text();
  } finally {
    clearTimeout(tmr);   // FIX BUG-11: always clear timer
  }
}

// ── Core HTTP Fetcher ─────────────────────────────────────────────────────
async function httpGet(url, opts={}) {
  const { timeout=20_000, retries=2, useProxy=false } = opts;
  if (isOpen(url)) throw new Error(`Circuit open for ${getDomain(url)} — try again in 15min`);

  let lastErr;

  // Strategy 1: Direct fetch (works for most government sites, APIs)
  if (!useProxy) {
    for (let attempt=0; attempt <= Math.min(retries,1); attempt++) {
      const ctrl = new AbortController();
      const tmr  = setTimeout(() => ctrl.abort(), timeout);
      try {
        const res = await fetch(url, {
          signal : ctrl.signal,
          headers: {
            'User-Agent'     : randomUA(),
            'Accept'         : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-IN,en-GB;q=0.9,en;q=0.8,hi;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer'        : 'https://www.google.co.in/',
            'Cache-Control'  : 'no-cache',
            'DNT'            : '1',
          },
        });
        clearTimeout(tmr);  // FIX BUG-11
        if (res.status === 429) { const ra=parseInt(res.headers.get('retry-after')||'60'); L.warn(`429 — waiting ${ra}s`); await delay(ra*1000); throw new Error('429 rate limited'); }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        recordSuccess(url);
        return text;
      } catch(e) {
        clearTimeout(tmr);  // FIX BUG-11: also in error path
        lastErr = e;
        if (attempt < 1) await jitter(1500, 3000);
      }
    }
  }

  // Strategy 2: Proxy chain — try each proxy
  for (let pi=0; pi < PROXIES.length; pi++) {
    try {
      L.info(`Trying proxy ${pi+1}/${PROXIES.length} for ${getDomain(url)}`);
      const text = await fetchViaProxy(url, pi, timeout);
      if (text && text.length > 100) { recordSuccess(url); return text; }
    } catch(e) {
      lastErr = e;
      L.warn(`Proxy ${pi+1} failed: ${e.message}`);
      await jitter(500, 1500);
    }
  }

  recordFail(url);
  throw lastErr || new Error(`All strategies failed for ${url}`);
}

// ── HTML Parsing ──────────────────────────────────────────────────────────
const parseHTML = html => cheerio.load(html, { decodeEntities: true });
const txt       = $el => $el.text().replace(/\s+/g,' ').trim();

function extractTable($, tableSelectors, rowSelector, colNames) {
  // ASSUMPTION-3 FIX: try multiple table selectors, not just one
  const selectors = Array.isArray(tableSelectors) ? tableSelectors : [tableSelectors];
  for (const sel of selectors) {
    const rows = [];
    $(sel).find(rowSelector).each((_, el) => {
      const cols = $(el).find('td');
      if (cols.length < colNames.length) return;
      const row = {};
      colNames.forEach((n,i) => { row[n] = txt($(cols[i])); });
      if (Object.values(row).some(v=>v.length>0)) rows.push(row);
    });
    if (rows.length > 0) return rows;
  }
  return [];
}

// ── LLM Fallback ─────────────────────────────────────────────────────────
async function llmExtract(html, instruction) {
  if (process.env.DEMO_MODE==='true') return null;
  const hasKey = process.env.ANTHROPIC_API_KEY||process.env.OPENAI_API_KEY||process.env.GEMINI_API_KEY||process.env.GROQ_API_KEY;
  if (!hasKey) { L.warn('No LLM key — cannot do LLM extraction fallback'); return null; }

  try {
    const llm     = require('../intelligence/llm-adapter');
    const trimmed = html
      .replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'')
      .replace(/<!--[\s\S]*?-->/g,'').replace(/\s+/g,' ').slice(0, 8000);
    const text = await llm.call(
      `Extract structured data from webpage HTML.\n${instruction}\n\nHTML:\n${trimmed}\n\nReturn ONLY valid JSON, no markdown fences.`,
      'markets'
    );
    const clean = text.replace(/```json\s*/i,'').replace(/```$/,'').trim();
    return JSON.parse(clean);
  } catch(e) { L.warn('LLM extract failed: '+e.message); return null; }
}

module.exports = {
  httpGet, parseHTML, txt, extractTable, llmExtract, rateLimit, jitter,
  circuitStatus  : () => Object.fromEntries([...circuits.entries()].map(([d,cb])=>[d,{failures:cb.failures,open:cb.failures>=3,resetIn:cb.failures>=3?Math.max(0,RESET_MS-(Date.now()-cb.lastFail)):0}])),
  lastFetchTimes : () => Object.fromEntries(lastFetch.entries()),
};
