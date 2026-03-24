'use strict';
/**
 * FIX BUG-3: Was counting web-scraper function exports as "targets".
 * Now explicitly lists scrape target names.
 */
const Cache = require('../core/cache');
const CFG   = require('../config/bharat-watch.config');
const { makeLogger } = require('../core/logger');
const { fetchMandiPrices, fetchFuelPrices, fetchGovAlerts } = require('./gov-scraper');
const { circuitStatus, lastFetchTimes } = require('./web-scraper');
const L = makeLogger('SCRAPER-IDX');

// Explicit list of all scrape targets — FIX BUG-3
const SCRAPE_TARGET_NAMES = [
  'agmarknet_onion','agmarknet_tomato','agmarknet_potato',
  'goodreturns_petrol','goodreturns_diesel','ppac_fuel',
  'moneycontrol_sensex','yahoo_sensex',
  'rbi_press_releases','ndma_alerts','sebi_circulars',
  'ndtv_news','thehindu_news','businessstandard_news',
  'imd_warnings','sansad_news',
];

async function runAllScrapers(options={}) {
  const opts = { ...CFG.SCRAPER.schedule, ...options };
  if (!CFG.SCRAPER.enabled) { L.info('Scraper disabled in config'); return {}; }

  L.info('=== Scrape run starting ===');
  const t0=Date.now(), results={}, errors=[];

  const r1 = [];
  if (opts.mandiPrices) r1.push(
    fetchMandiPrices(CFG.SCRAPER.mandiCommodities)
      .then(r => { results.mandi = r; })
      .catch(e => errors.push('mandi: '+e.message))
  );
  if (opts.fuelPrices) r1.push(
    fetchFuelPrices(CFG.SCRAPER.fuelCities)
      .then(r => { results.fuel = r; })
      .catch(e => errors.push('fuel: '+e.message))
  );
  await Promise.allSettled(r1);

  if (opts.govAlerts) {
    await fetchGovAlerts()
      .then(r => { results.govAlerts = r; })
      .catch(e => errors.push('govAlerts: '+e.message));
  }

  results._meta = { durationMs: Date.now()-t0, scrapedAt: new Date().toISOString(), errors };
  Cache.write('scraper-results', results);
  L.ok(`=== Scrape done in ${((Date.now()-t0)/1000).toFixed(1)}s — ${errors.length} errors ===`);
  return results;
}

function getStatus() {
  return {
    enabled          : CFG.SCRAPER.enabled,
    targetCount      : SCRAPE_TARGET_NAMES.length,  // FIX BUG-3: explicit count
    targetNames      : SCRAPE_TARGET_NAMES,
    circuitBreakers  : circuitStatus(),
    lastFetch        : lastFetchTimes(),
    mandiCommodities : CFG.SCRAPER.mandiCommodities,
    fuelCities       : CFG.SCRAPER.fuelCities,
    lastResults      : Cache.read('scraper-results')?.data?._meta || null,
  };
}

module.exports = { runAllScrapers, getStatus, SCRAPE_TARGET_NAMES };
