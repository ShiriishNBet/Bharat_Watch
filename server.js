'use strict';

// ── Load .env ──────────────────────────────────────────────────────────────
try {
  require('fs').readFileSync('.env','utf8').split('\n').forEach(line => {
    const [k,...v] = line.split('=');
    if (k?.trim() && v.length) process.env[k.trim()] = v.join('=').trim();
  });
} catch {}

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const Cache      = require('./cache');
const scheduler  = require('./scheduler');
const { makeLogger } = require('./logger');
const L = makeLogger('SERVER');

const app  = express();
const PORT = parseInt(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── API Routes ─────────────────────────────────────────────────────────────
app.use('/api',          require('../api/middleware'));
app.use('/api',          require('../api/routes/status'));
app.use('/api',          require('../api/routes/data'));
app.use('/api/scraper',  require('../api/routes/scraper'));
app.use('/api/predict',  require('../api/routes/predict'));

// ── SPA fallback ───────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  const idx = path.join(__dirname, '..', 'public', 'index.html');
  require('fs').existsSync(idx)
    ? res.sendFile(idx)
    : res.json({ engine: 'Bharat Watch', version: '1.0.0', docs: '/api/status' });
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  L.info(`Bharat Watch Engine → http://localhost:${PORT}`);
  L.info(`LLM provider: ${process.env.LLM_PROVIDER || 'claude'}`);
  L.info(`Demo mode: ${process.env.DEMO_MODE === 'true' ? 'ON' : 'off'}`);

  // Start cron scheduler
  scheduler.start();

  // Initial data load — skip if cache is fresh
  const cacheAge = Cache.ageMs('meta');
  const ttl      = parseInt(process.env.CACHE_TTL_MS) || 3_600_000;
  if (cacheAge < ttl) {
    L.info(`Cache is fresh (${Math.round(cacheAge/60000)}min old) — skipping initial fetch`);
  } else {
    L.info('Cache stale/empty — running initial full refresh...');
    await scheduler.runFullRefresh();
  }
});

module.exports = app;
