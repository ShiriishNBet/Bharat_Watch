'use strict';
/**
 * SHARED LIVE DATA BUILDER
 * FIX BUG-1: buildLiveData was duplicated in scheduler.js and predict.js
 * and NOT exported from prediction-engine.js where scheduler tried to import it.
 * Now lives here as a single source of truth. All modules require this.
 */
const Cache = require('./cache');

function buildLiveData() {
  const news    = Cache.read('news');
  const markets = Cache.read('markets');
  const fx      = Cache.read('fx');
  const comm    = Cache.read('commodities');
  const ai      = Cache.read('ai-brief');
  const scraper = Cache.read('scraper-results');

  // Enrich commodities with parsed numeric change for severity detection (FIX BUG-4)
  const commodities = (comm?.data || []).map(c => {
    // c.chg is a display string like '+₹27' or '+0.2' — strip non-numeric chars
    const chgRaw     = String(c.chg || '0').replace(/[^0-9.\-]/g, '');
    const chgNumeric = parseFloat(chgRaw) || 0;
    return { ...c, chgNumeric };
  });

  return {
    news          : news?.data  ? Object.values(news.data).flat() : [],
    markets       : markets?.data || {},
    fxRates       : fx?.data    || {},
    commodities,
    conflictEvents: ai?.data?.json?.conflict || [],
    aibrief       : ai?.data?.briefText      || '',
    mandiData     : scraper?.data?.mandi     || {},
    fuelData      : scraper?.data?.fuel?.prices || {},
    govAlerts     : scraper?.data?.govAlerts || [],
  };
}

module.exports = { buildLiveData };
