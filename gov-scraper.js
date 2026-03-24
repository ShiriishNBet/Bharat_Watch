'use strict';
/**
 * BHARAT WATCH — GOVERNMENT DATA SCRAPER
 *
 * ASSUMPTION-3 FIX: Agmarknet uses ASP.NET WebForms.
 *   Actual rendered table IDs are dynamic (ctl00_ContentPlaceHolder1_GridPriceList).
 *   We now try MULTIPLE selectors before falling back to LLM extraction.
 *
 * BUG-6 FIX: NDTV FeedBurner URL deprecated — updated to feeds.ndtv.com
 * BUG-7 FIX: Reuters INtopNews URL for India-relevant stories
 */
const { httpGet, parseHTML, txt, extractTable, llmExtract, rateLimit, jitter } = require('./web-scraper');
const { makeLogger } = require('../core/logger');
const L = makeLogger('GOV-SCRAPER');

// Agmarknet commodity IDs — verify at agmarknet.gov.in/SearchCmmMkt.aspx
const COMMODITY_IDS = {
  onion  : 23,
  tomato : 78,
  potato : 24,
  rice   : 9,
  wheat  : 11,
  dal_tur: 15,
  onion_url: 23,
};

// ASSUMPTION-3 FIX: multiple Agmarknet table selectors — ASP.NET generates dynamic IDs
const AGMARKNET_TABLE_SELECTORS = [
  '#ctl00_ContentPlaceHolder1_GridPriceList',       // common ASP.NET ID pattern
  '#gridRecords',                                    // older format
  'table.tableagmark',                               // class-based
  'table[id*="Grid"]',                               // any grid table
  'table[id*="Price"]',                              // any price table
  'table[cellpadding]',                              // fallback: first table with cellpadding
  'table',                                           // last resort: first table
];

async function fetchMandiPrices(commodities=['onion','tomato','potato']) {
  L.info(`Mandi prices for: ${commodities.join(', ')}`);
  const results = {};

  for (const commodity of commodities) {
    const cid = COMMODITY_IDS[commodity];
    if (!cid) { L.warn(`No commodity ID for: ${commodity}`); continue; }

    const url = `https://agmarknet.gov.in/PriceAndArrivals/CommodityWiseDailyReport.aspx?Commodity=${cid}&Day=0&CommodityHead=${commodity.charAt(0).toUpperCase()+commodity.slice(1)}`;

    try {
      await rateLimit(url, 90_000);
      L.info(`Fetching Agmarknet: ${commodity}`);

      const html = await httpGet(url, { useProxy: true, timeout: 30_000 });
      const $    = parseHTML(html);

      // ASSUMPTION-3 FIX: try all selectors
      let rows = extractTable($, AGMARKNET_TABLE_SELECTORS, 'tr:not(:first-child)', ['market','state','min','max','modal']);

      // If rows found but columns seem wrong, try with different column count
      if (rows.length === 0) {
        rows = extractTable($, AGMARKNET_TABLE_SELECTORS, 'tr:not(:first-child):not(:nth-child(2))', ['col0','col1','col2','col3','col4']);
        if (rows.length > 0) {
          // Remap generic columns — assume: market, state, arrival, min, max, modal
          rows = rows.map(r => ({ market: r.col0||r.col1, state: r.col1||r.col2, min: r.col2||r.col3, max: r.col3||r.col4, modal: r.col4||r.col3 }));
        }
      }

      // LLM fallback — when Cheerio cannot find the data
      if (rows.length === 0) {
        L.warn(`Cheerio found 0 rows for ${commodity} — trying LLM extraction`);
        const extracted = await llmExtract(html,
          `This is an Agmarknet India government page showing ${commodity} wholesale market prices.
Extract a list of market prices. Return JSON array:
[{"market":"Nasik","state":"Maharashtra","minPrice":2000,"maxPrice":4000,"modalPrice":3000}]
Prices are in INR per quintal (100kg). Find all market rows in any table on the page.`
        );
        if (Array.isArray(extracted) && extracted.length > 0) {
          rows = extracted.map(r => ({ market:r.market, state:r.state, min:String(r.minPrice||0), max:String(r.maxPrice||0), modal:String(r.modalPrice||0) }));
          L.ok(`LLM extracted ${rows.length} rows for ${commodity}`);
        }
      }

      const cleaned = rows.slice(0, 20).map(r => ({
        market    : (r.market||'').trim(),
        state     : (r.state||'').trim(),
        minPrice  : parseFloat(String(r.min  ||r.minPrice  ||0).replace(/[₹,\s]/g,'')) || 0,
        maxPrice  : parseFloat(String(r.max  ||r.maxPrice  ||0).replace(/[₹,\s]/g,'')) || 0,
        modalPrice: parseFloat(String(r.modal||r.modalPrice||0).replace(/[₹,\s]/g,'')) || 0,
        unit      : 'INR/quintal',
        commodity,
      })).filter(r => r.modalPrice > 0 && r.market.length > 0);

      if (cleaned.length > 0) {
        const avg = cleaned.reduce((s,r) => s+r.modalPrice, 0) / cleaned.length;
        results[commodity] = {
          markets       : cleaned,
          avgModalPrice : Math.round(avg),
          pricePerKg    : +(avg/100).toFixed(1),
          marketCount   : cleaned.length,
          fetchedAt     : new Date().toISOString(),
          source        : 'agmarknet.gov.in',
        };
        L.ok(`${commodity}: ₹${results[commodity].pricePerKg}/kg (avg ${cleaned.length} mandis)`);
      } else {
        L.warn(`${commodity}: no valid price data found`);
        results[commodity] = { error: 'No data found', commodity };
      }

      await jitter(3000, 6000);  // be polite to government server

    } catch(e) {
      L.error(`Mandi ${commodity}: ${e.message}`);
      results[commodity] = { error: e.message, commodity };
    }
  }
  return results;
}

async function fetchFuelPrices(cities=['Delhi','Mumbai','Chennai','Kolkata','Bengaluru','Hyderabad']) {
  L.info(`Fuel prices for ${cities.length} cities`);
  const fuelData = {};

  // Strategy 1: Goodreturns petrol
  try {
    await rateLimit('https://www.goodreturns.in', 120_000);
    const html = await httpGet('https://www.goodreturns.in/petrol-price-in-india.html');
    const $    = parseHTML(html);

    // Try multiple selectors — Goodreturns layout changes occasionally
    const tableSelectors = ['table.petrol-price-table tbody tr', 'table#tblPetrolPrice tbody tr', 'table tbody tr'];
    for (const sel of tableSelectors) {
      $(sel).each((_, el) => {
        const cols  = $(el).find('td');
        if (cols.length < 2) return;
        const city  = txt($(cols[0]));
        const price = txt($(cols[1]));
        if (city && price && cities.some(c => city.toLowerCase().includes(c.toLowerCase()))) {
          fuelData[city] = { petrol: parseFloat(price.replace(/[₹,\s]/g,'')) || null };
        }
      });
      if (Object.keys(fuelData).length >= 3) break;
    }

    // LLM fallback if <3 cities found
    if (Object.keys(fuelData).length < 3) {
      L.warn('Cheerio petrol: insufficient data — LLM fallback');
      const extracted = await llmExtract(html,
        `Extract today's petrol prices for major Indian cities from this Goodreturns page.
Return JSON: {"Delhi":{"petrol":94.72},"Mumbai":{"petrol":104.21},"Chennai":{"petrol":100.75},"Kolkata":{"petrol":104.95},"Bengaluru":{"petrol":102.86}}`
      );
      if (extracted) Object.assign(fuelData, extracted);
    }

    L.ok(`Petrol: ${Object.keys(fuelData).length} cities`);
    await jitter(2000, 4000);
  } catch(e) { L.warn('Petrol fetch failed: '+e.message); }

  // Strategy 2: Diesel from same site
  try {
    await rateLimit('https://www.goodreturns.in', 120_000);
    const dHtml = await httpGet('https://www.goodreturns.in/diesel-price-in-india.html');
    const $d    = parseHTML(dHtml);

    $d('table tbody tr').each((_, el) => {
      const cols  = $d(el).find('td');
      const city  = txt($d(cols[0])), price = txt($d(cols[1]));
      if (city && price && cities.some(c => city.toLowerCase().includes(c.toLowerCase()))) {
        if (!fuelData[city]) fuelData[city] = {};
        fuelData[city].diesel = parseFloat(price.replace(/[₹,\s]/g,'')) || null;
      }
    });
  } catch(e) { L.warn('Diesel fetch failed: '+e.message); }

  return { prices: fuelData, fetchedAt: new Date().toISOString(), source: 'goodreturns.in', cityCount: Object.keys(fuelData).length };
}

async function fetchGovAlerts() {
  L.info('Government alerts (RBI, NDMA)...');
  const alerts = [];

  const sources = [
    {
      url      : 'https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx',
      label    : 'RBI',
      category : 'monetary',
      rowSel   : 'table tr, .pressRelease tr',
      titleSel : 'a, td:nth-child(2)',
      dateSel  : 'td:first-child',
      rateMs   : 600_000,
    },
    {
      url      : 'https://ndma.gov.in/Media/Press-Release',
      label    : 'NDMA',
      category : 'disaster',
      rowSel   : 'table tr, .list-group-item',
      titleSel : 'a, h4, .title',
      dateSel  : '.date, td:first-child, time',
      rateMs   : 600_000,
    },
  ];

  for (const src of sources) {
    try {
      await rateLimit(src.url, src.rateMs);
      const html = await httpGet(src.url, { useProxy: true, timeout: 25_000 });
      const $    = parseHTML(html);

      $(src.rowSel).slice(1, 6).each((_, el) => {
        const title = txt($(el).find(src.titleSel));
        const date  = txt($(el).find(src.dateSel));
        const link  = $(el).find('a').first().attr('href') || '';
        if (title.length > 10) {
          alerts.push({
            title,
            date,
            link    : link.startsWith('http') ? link : `https://${new URL(src.url).hostname}${link}`,
            source  : src.label,
            category: src.category,
          });
        }
      });

      L.ok(`${src.label}: ${alerts.filter(a=>a.source===src.label).length} alerts`);
      await jitter(2000, 4000);
    } catch(e) { L.warn(`${src.label} alerts failed: ${e.message}`); }
  }

  return alerts;
}

module.exports = { fetchMandiPrices, fetchFuelPrices, fetchGovAlerts, COMMODITY_IDS };
