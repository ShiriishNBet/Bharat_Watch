'use strict';
const cron  = require('node-cron');
const Cache = require('./cache');
const { buildLiveData } = require('./live-data');
const { makeLogger }    = require('./logger');
const L = makeLogger('SCHEDULER');

let isRunning = false;

async function runFullRefresh() {
  if (isRunning) { L.warn('Refresh already running — skipping'); return; }
  isRunning = true;
  const t0 = Date.now(); const errors = [];
  L.info('Starting full refresh');

  try {
    const { fetchFX, fetchWeather, fetchNews } = require('../scrapers/rss-fetcher');
    const { fetchMarkets, fetchCommodities }   = require('../scrapers/market-scraper');
    const { generateAIBrief }                  = require('../intelligence/brief-generator');
    const { runAllScrapers }                   = require('../scrapers/index');

    runAllScrapers().catch(e => L.warn('Background scraper: ' + e.message));

    const [fxR, wxR] = await Promise.allSettled([fetchFX(), fetchWeather()]);
    [fxR, wxR].forEach((r, i) => r.status === 'rejected' && errors.push(['fx','weather'][i]+': '+r.reason?.message));

    await fetchNews().catch(e => errors.push('news: '+e.message));

    const [mkR, cmR, aiR] = await Promise.allSettled([fetchMarkets(), fetchCommodities(), generateAIBrief()]);
    [mkR, cmR, aiR].forEach((r, i) => r.status === 'rejected' && errors.push(['markets','commodities','ai-brief'][i]+': '+r.reason?.message));

    const totalSources = 6;
    Cache.write('meta', {
      lastFullRefresh: new Date().toISOString(),
      nextFullRefresh: new Date(Date.now()+(parseInt(process.env.CACHE_TTL_MS)||3_600_000)).toISOString(),
      durationMs     : Date.now()-t0,
      refreshCount   : (Cache.read('meta')?.data?.refreshCount||0)+1,
      sourcesOk      : Math.max(0, totalSources-errors.length),
      totalSources, errors,
    });
  } finally {
    isRunning = false;
  }

  L.info(`Refresh done in ${((Date.now()-t0)/1000).toFixed(1)}s — ${errors.length} errors`);
  if (errors.length) L.warn('Errors: '+errors.join(' | '));
}

async function runPredictions() {
  const hasKey = process.env.ANTHROPIC_API_KEY||process.env.OPENAI_API_KEY||process.env.GEMINI_API_KEY||process.env.GROQ_API_KEY;
  if (!hasKey) { L.info('No LLM key — skipping predictions'); return; }
  try {
    const { runAllPredictions } = require('../intelligence/prediction-engine');
    const liveData = buildLiveData();
    const results  = await runAllPredictions(liveData, null, {}, (topic, status, err) => {
      if (status==='error') L.warn(`Prediction ${topic}: ${err}`);
    });
    let saved = 0;
    Object.entries(results).forEach(([topic, pred]) => {
      if (pred&&!pred.error) { Cache.write(`pred-${topic}`, pred, {source:'prediction-engine',topic}); saved++; }
    });
    L.ok(`Predictions saved: ${saved}/3`);
  } catch(e) { L.error('runPredictions: '+e.message); }
}

function start() {
  cron.schedule('0 * * * *', () => { L.info('Hourly cron — refresh'); runFullRefresh().catch(e=>L.error('Cron:'+e.message)); });
  cron.schedule('5 * * * *', () => { L.info('Predictions cron'); runPredictions().catch(e=>L.error('Pred:'+e.message)); });
  L.info('Scheduler started');
}

module.exports = { start, runFullRefresh, runPredictions, isRunning: () => isRunning };
