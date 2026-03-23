'use strict';
const { httpGet, parseHTML, txt, extractTable, llmExtract, rateLimit, jitter } = require('./web-scraper');
const { makeLogger } = require('../core/logger');
const L = makeLogger('GOV-SCRAPER');

const AGMARKNET_BASE = 'https://agmarknet.gov.in/PriceAndArrivals/CommodityWiseDailyReport.aspx';
const COMMODITY_IDS  = { onion:23, tomato:78, potato:24, rice:45, wheat:48, dal_tur:15 };

async function fetchMandiPrices(commodities=['onion','tomato','potato']) {
  L.info(`Mandi prices: ${commodities.join(', ')}`);
  const results = {};

  for (const commodity of commodities) {
    const cid = COMMODITY_IDS[commodity];
    if (!cid) continue;
    const url = `${AGMARKNET_BASE}?Commodity=${cid}&Day=0&CommodityHead=${commodity}`;

    try {
      await rateLimit(url, 90_000);
      const html = await httpGet(url, { useProxy: true, timeout: 25_000 });
      const $    = parseHTML(html);

      let rows = extractTable($, '#gridRecords table, table.tableagmark', 'tr:not(:first-child)', ['market','state','min','max','modal']);

      if (rows.length === 0) {
        L.warn(`Cheerio found 0 rows for ${commodity} — LLM fallback`);
        const llmResult = await llmExtract(html,
          `Extract ${commodity} prices. Return JSON array:
[{"market":"Nasik","state":"Maharashtra","minPrice":2000,"maxPrice":4000,"modalPrice":3000}]
Prices in INR per quintal.`
        );
        if (Array.isArray(llmResult)) rows = llmResult.map(r=>({market:r.market,state:r.state,min:r.minPrice,max:r.maxPrice,modal:r.modalPrice}));
      }

      const cleaned = rows.slice(0,15).map(r => ({
        market    : r.market||'',
        state     : r.state||'',
        minPrice  : parseFloat((r.min||r.minPrice||'0').toString().replace(/[₹,]/g,''))||0,
        maxPrice  : parseFloat((r.max||r.maxPrice||'0').toString().replace(/[₹,]/g,''))||0,
        modalPrice: parseFloat((r.modal||r.modalPrice||'0').toString().replace(/[₹,]/g,''))||0,
        unit:'INR/quintal', commodity,
      })).filter(r=>r.modalPrice>0);

      if (cleaned.length>0) {
        const avg = cleaned.reduce((s,r)=>s+r.modalPrice,0)/cleaned.length;
        results[commodity] = {
          markets:cleaned, avgModalPrice:Math.round(avg),
          pricePerKg:+(avg/100).toFixed(1), fetchedAt:new Date().toISOString(), source:'agmarknet.gov.in',
        };
        L.ok(`${commodity}: ₹${results[commodity].pricePerKg}/kg (${cleaned.length} mandis)`);
      }
      await jitter(2000, 5000);
    } catch(e) {
      L.error(`Mandi ${commodity}: ${e.message}`);
      results[commodity] = { error: e.message };
    }
  }
  return results;
}

async function fetchFuelPrices(cities=['Delhi','Mumbai','Chennai','Kolkata','Bengaluru']) {
  L.info('Fuel prices...');
  try {
    await rateLimit('https://www.goodreturns.in', 120_000);
    const html  = await httpGet('https://www.goodreturns.in/petrol-price-in-india.html');
    const $     = parseHTML(html);
    const data  = {};
    $('table tbody tr').each((_,el)=>{
      const cols = $(el).find('td');
      if (cols.length<2) return;
      const city  = txt($(cols[0]));
      const price = txt($(cols[1]));
      if (city && price && cities.some(c=>city.toLowerCase().includes(c.toLowerCase()))) {
        data[city] = { petrol: parseFloat(price.replace(/[₹,]/g,''))||null };
      }
    });
    await jitter(2000,4000);
    const dHtml = await httpGet('https://www.goodreturns.in/diesel-price-in-india.html');
    const $d    = parseHTML(dHtml);
    $d('table tbody tr').each((_,el)=>{
      const cols = $d(el).find('td');
      const city = txt($d(cols[0])), price = txt($d(cols[1]));
      if (city && price && cities.some(c=>city.toLowerCase().includes(c.toLowerCase()))) {
        if (!data[city]) data[city]={};
        data[city].diesel = parseFloat(price.replace(/[₹,]/g,''))||null;
      }
    });
    L.ok(`Fuel: ${Object.keys(data).length} cities`);
    return { prices:data, fetchedAt:new Date().toISOString(), source:'goodreturns.in' };
  } catch(e) {
    L.error('Fuel prices: '+e.message);
    return { error:e.message };
  }
}

async function fetchGovAlerts() {
  L.info('Government alerts...');
  const alerts = [];
  const sources = [
    { url:'https://www.rbi.org.in/scripts/PressReleaseDisplay.aspx', label:'RBI', rowSel:'table.tablebg tr', titleSel:'td a', dateSel:'td:first-child' },
    { url:'https://ndma.gov.in/Media/Press-Release',                label:'NDMA', rowSel:'table tr, .press-item', titleSel:'a, .title', dateSel:'.date, td:first-child' },
  ];
  for (const src of sources) {
    try {
      await rateLimit(src.url, 600_000);
      const html = await httpGet(src.url, { useProxy:true });
      const $    = parseHTML(html);
      $(src.rowSel).slice(1,6).each((_,el) => {
        const title = txt($(el).find(src.titleSel));
        const date  = txt($(el).find(src.dateSel));
        const link  = $(el).find('a').first().attr('href')||'';
        if (title.length>10) alerts.push({ title, date, link, source:src.label });
      });
      await jitter(2000,4000);
    } catch(e) { L.warn(`${src.label} alerts: ${e.message}`); }
  }
  L.ok(`Gov alerts: ${alerts.length} items`);
  return alerts;
}

module.exports = { fetchMandiPrices, fetchFuelPrices, fetchGovAlerts };
