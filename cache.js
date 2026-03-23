'use strict';
const fs   = require('fs');
const path = require('path');
const { log } = require('./logger');

const CACHE_DIR = path.join(__dirname, '..', 'cache');
const TTL       = parseInt(process.env.CACHE_TTL_MS) || 3_600_000;

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

const Cache = {
  filePath(key)   { return path.join(CACHE_DIR, `${key}.json`); },

  write(key, data, meta={}) {
    const entry = {
      data,
      fetchedAt  : new Date().toISOString(),
      nextFetchAt: new Date(Date.now() + TTL).toISOString(),
      ...meta,
    };
    fs.writeFileSync(this.filePath(key), JSON.stringify(entry, null, 2));
    log(`cache:write ${key} (${(JSON.stringify(entry).length/1024).toFixed(1)}KB)`, 'ok', 'CACHE');
    return entry;
  },

  read(key) {
    try { return JSON.parse(fs.readFileSync(this.filePath(key), 'utf8')); }
    catch { return null; }
  },

  ageMs(key) {
    const e = this.read(key);
    return e?.fetchedAt ? Date.now() - new Date(e.fetchedAt).getTime() : Infinity;
  },

  isFresh(key) { return this.ageMs(key) < TTL; },

  sizeKB(key) {
    try { return (fs.statSync(this.filePath(key)).size / 1024).toFixed(1); }
    catch { return '0'; }
  },

  delete(key) {
    try { fs.unlinkSync(this.filePath(key)); return true; }
    catch { return false; }
  },

  all(keys=['fx','weather','markets','news','commodities','ai-brief','meta','scraper-results']) {
    return keys.map(k => ({
      key        : k,
      exists     : fs.existsSync(this.filePath(k)),
      fresh      : this.isFresh(k),
      fetchedAt  : this.read(k)?.fetchedAt || null,
      nextFetchAt: this.read(k)?.nextFetchAt || null,
      ageMs      : this.ageMs(k),
      sizeKB     : this.sizeKB(k),
    }));
  },
};

module.exports = Cache;
