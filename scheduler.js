'use strict';
const cron  = require('node-cron');
const Cache = require('./cache');
const { makeLogger } = require('./logger');
const L = makeLogger('SCHEDULER');

let isRunning = false;

// Full data refresh pipeline — runs every hour
async function runFullRefresh() {
  if (isRunning) { L.warn('Refresh already running — skipping'); return; }
  isRunning = true;
  const t0 = Date.now();
  L.info('═══ Starting full refresh ═══');

  const errors = [];
  const { fetchFX, fetchWeather }             = require('../scrapers/rss-fetcher');
  const { fetchNews }                         = require('../scrapers/rss-fetcher');
  const { fetchMarkets, fetchCommodities }    = require('../scrapers/market-scraper');
  const { generateAIBrief }                   = require('../intelligence/brief-generator');
  const { runAllScrapers }                    = require('../scrapers/index');

  // Round 0: Background scraper (non-blocking)
  runAllScrapers().catch(e => L.warn('Background scraper: ' + e.message));

  // Round 1: Independent APIs (parallel)
  const [fxR, wxR] = await Promise.allSettled([fetchFX(), fetchWeather()]);
  [fxR, wxR].forEach((r, i) => r.status === 'rejected' && errors.push(['fx','weather'][i]+': '+r.reason?.message));

  // Round 2: News feeds
  await fetchNews().catch(e => errors.push('news: ' + e.message));

  // Round 3: Markets + Commodities + AI Brief (parallel)
  const [mkR, cmR, aiR] = await Promise.allSettled([
    fetchMarkets(), fetchCommodities(), generateAIBrief(),
  ]);
  [mkR,cmR,aiR].forEach((r,i) => r.status==='rejected' && errors.push(['markets','commodities','ai-brief'][i]+': '+r.reason?.message));

  // Write session meta
  Cache.write('meta', {
    lastFullRefresh : new Date().toISOString(),
    nextFullRefresh : new Date(Date.now() + (parseInt(process.env.CACHE_TTL_MS)||3_600_000)).toISOString(),
    durationMs      : Date.now() - t0,
    refreshCount    : (Cache.read('meta')?.data?.refreshCount || 0) + 1,
    sourcesOk       : 6 - errors.length,
    errors,
  });

  isRunning = false;
  L.info(`═══ Refresh done in ${((Date.now()-t0)/1000).toFixed(1)}s — ${errors.length} errors ═══`);
  if (errors.length) L.warn('Errors: ' + errors.join(' | '));
}

// Post-refresh predictions (5 min after data is fresh)
async function runPredictions() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY &&
      !process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) return;
  const { runAllPredictions, buildLiveData } = require('../intelligence/prediction-engine');
  const liveData = buildLiveData();
  const results  = await runAllPredictions(liveData).catch(e => { L.warn('Predictions: ' + e.message); return {}; });
  Object.entries(results).forEach(([topic, pred]) => {
    if (!pred?.error) Cache.write(`pred-${topic}`, pred, { source:'prediction-engine', topic });
  });
}

function start() {
  // Data refresh: every hour at :00
  cron.schedule('0 * * * *', () => {
    L.info('⏰ Hourly cron — starting full refresh');
    runFullRefresh().catch(e => L.error('Cron refresh: ' + e.message));
  });

  // Predictions: every hour at :05 (after data refresh settles)
  cron.schedule('5 * * * *', () => {
    L.info('⏰ Predictions cron — running simulations');
    runPredictions().catch(e => L.error('Cron predictions: ' + e.message));
  });

  L.info('Scheduler started — hourly cron active');
}

module.exports = { start, runFullRefresh, runPredictions, isRunning: () => isRunning };
