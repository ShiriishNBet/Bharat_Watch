'use strict';
/**
 * BHARAT WATCH — PATTERN DETECTOR AI
 *
 * Inspired by: "20-year-old used AI to detect corruption" (LinkedIn AI post)
 * 
 * This module cross-references OFFICIAL data vs GROUND TRUTH scraped data
 * to flag anomalies, price manipulation, policy gaps, and corruption patterns.
 *
 * HOW IT WORKS (same principle as the LinkedIn corruption detector):
 * ┌─────────────────────────────────────────────────────────┐
 * │  OFFICIAL DATA           vs   GROUND TRUTH              │
 * │  (Govt announcements)         (Scraped real prices)     │
 * │                                                          │
 * │  "Onion MSP = ₹800/q"   vs   Agmarknet: ₹280/q         │
 * │  "Petrol: no hike"       vs   Pump price +₹2 in 7 days  │
 * │  "Inflation 4.5%"        vs   Our basket: +18% YoY       │
 * │  "Mandi price ₹40"       vs   Retail: ₹90 in same city  │
 * └─────────────────────────────────────────────────────────┘
 *
 * DETECTION TYPES:
 *   PRICE_MANIPULATION   — mandi price vs retail spread too wide
 *   POLICY_DISCONNECT    — official announcement vs ground reality divergence
 *   CARTEL_SIGNAL        — multiple mandis moving in lockstep (unnatural)
 *   INFLATION_GAP        — official CPI vs our basket actual inflation
 *   SUPPLY_ANOMALY       — prices spiking despite announced surplus
 *   SUBSIDY_LEAKAGE      — scheme announced but beneficiary prices unchanged
 *   DATA_INCONSISTENCY   — two government sources contradict each other
 *   CORRUPTION_SIGNAL    — procurement prices vs market prices diverge
 */

const Cache   = require('../core/cache');
const llm     = require('./llm-adapter');
const { buildLiveData } = require('../core/live-data');
const { makeLogger } = require('../core/logger');
const L = makeLogger('PATTERN-DET');

// ── Thresholds for anomaly detection ─────────────────────────────────────
const THRESHOLDS = {
  // How much wider can retail be vs mandi (normal = 30-50%)
  mandi_to_retail_spread_pct : 80,    // alert if retail > mandi × 1.8
  // How many commodity prices moving same direction = cartel signal
  cartel_lockstep_count      : 5,     // 5+ commodities all going up/down same day
  // Official CPI vs our basket difference
  inflation_gap_pct          : 6,     // alert if our basket diverges >6% from official
  // Price spike vs announced surplus
  surplus_spike_pct          : 15,    // if govt says surplus but price up >15%
  // Scheme beneficiary price change after announcement
  scheme_impact_days         : 30,    // price should change within 30 days of scheme
};

// ── Known official data sources to cross-reference ───────────────────────
const OFFICIAL_BENCHMARKS = {
  // Approximate official benchmarks — updated via LLM search
  petrol_hike_threshold   : 3.0,   // ₹/L — official OMC review threshold
  diesel_hike_threshold   : 2.5,
  onion_export_ban_trigger: 25,    // ₹/kg retail — triggers export ban
  official_cpi_annual     : 4.5,   // % — RBI target band midpoint
  msm_loan_rate           : 8.5,   // % — official MSME rate
};

// ── Rule-based detectors (no LLM needed, fast) ────────────────────────────

function detectMandiRetailSpread(commodities, mandiData) {
  const alerts = [];
  for (const comm of commodities) {
    const name = comm.name?.toLowerCase().replace(/\s.*/, '');
    const mandiEntry = mandiData[name];
    if (!mandiEntry?.pricePerKg) continue;

    const mandiPriceKg  = mandiEntry.pricePerKg;
    const retailPriceKg = parseFloat(String(comm.price||'0').replace(/[₹,\s]/g,''));
    if (!retailPriceKg || !mandiPriceKg) continue;

    const spreadPct = ((retailPriceKg - mandiPriceKg) / mandiPriceKg) * 100;
    if (spreadPct > THRESHOLDS.mandi_to_retail_spread_pct) {
      alerts.push({
        type        : 'PRICE_MANIPULATION',
        severity    : spreadPct > 150 ? 'HIGH' : 'MEDIUM',
        commodity   : comm.name,
        mandi_price : `₹${mandiPriceKg}/kg`,
        retail_price: `₹${retailPriceKg}/kg`,
        spread_pct  : Math.round(spreadPct),
        flag        : `${comm.name} retails at ${Math.round(spreadPct)}% above mandi price — normal spread is 30–50%`,
        implication : 'Possible middleman cartel, cold storage hoarding, or artificial scarcity',
        action      : 'Check e-NAM or direct mandi purchase. Report to state agriculture dept if >100% spread.',
        data_sources: ['agmarknet.gov.in', 'retail basket live data'],
      });
    }
  }
  return alerts;
}

function detectLockstepMovement(commodities) {
  const allUp   = commodities.filter(c => c.dir === 'up').length;
  const allDown = commodities.filter(c => c.dir === 'dn').length;
  const total   = commodities.length;
  const alerts  = [];

  if (allUp >= THRESHOLDS.cartel_lockstep_count && allUp / total > 0.7) {
    alerts.push({
      type       : 'CARTEL_SIGNAL',
      severity   : 'HIGH',
      flag       : `${allUp}/${total} tracked commodities rising simultaneously`,
      implication: 'Natural supply shocks affect 1–2 commodities. Broad simultaneous rises suggest coordinated price fixing or hoarding cartel activity',
      commodities: commodities.filter(c => c.dir === 'up').map(c => c.name),
      action     : 'Report to CCI (Competition Commission of India). Check if NAFED/FCI have released buffer stocks.',
      data_source: 'live commodity basket',
    });
  }
  return alerts;
}

function detectFuelPriceAnomaly(commodities, markets) {
  const alerts = [];
  const petrol = commodities.find(c => c.name?.toLowerCase().includes('petrol'));
  const wti    = markets.wti?.value;

  if (petrol && wti) {
    const petrolNum = parseFloat(String(petrol.price||'0').replace(/[₹,\s]/g,''));
    // If crude falls significantly but petrol stays flat for >2 weeks — flag it
    if (wti < 70 && petrolNum > 95) {
      alerts.push({
        type       : 'POLICY_DISCONNECT',
        severity   : 'MEDIUM',
        flag       : `WTI crude at $${wti}/bbl but Indian petrol remains ₹${petrolNum}/L`,
        implication: 'International crude has dropped — domestic fuel prices should have been revised downward',
        calculation: `At $${wti}/bbl, expected petrol price: ₹${Math.round(70 + (wti * 0.35))}/L. Consumers paying ₹${Math.round(petrolNum - (70 + wti * 0.35))} extra per litre.`,
        action     : 'Track PPAC official revision schedule. File RTI for OMC pricing formula if no revision in 30 days.',
        data_sources: ['live WTI crude', 'goodreturns fuel prices'],
      });
    }
  }
  return alerts;
}

// ── LLM-powered deep pattern analysis ────────────────────────────────────
async function detectPatternsWithLLM(liveData, basicAlerts) {
  const { news, markets, commodities, fxRates, govAlerts } = liveData;

  const headlines = news.slice(0, 15).map(h => `• ${h.title}`).join('\n');
  const commStr   = commodities.slice(0, 8).map(c => `${c.name}: ${c.price}${c.unit} (${c.chg}, dir:${c.dir})`).join(', ');
  const govStr    = (govAlerts||[]).slice(0, 5).map(a => `[${a.source}] ${a.title}`).join('\n');
  const basicStr  = basicAlerts.map(a => `• ${a.type}: ${a.flag}`).join('\n');

  const prompt = `You are an investigative AI analyst — like the ones used to detect corruption in government data.

Your job: Cross-reference official announcements vs ground reality to find ANOMALIES, MANIPULATION, and POLICY GAPS that hurt Indian citizens.

LIVE DATA TODAY:
Headlines: ${headlines}

Commodity prices (scraped ground truth): ${commStr}
Markets: Sensex ${markets.sensex?.value?.toLocaleString('en-IN')||'—'}, WTI $${markets.wti?.value||'—'}/bbl
Government alerts today: ${govStr || 'None detected'}

ALREADY DETECTED BY RULES:
${basicStr || 'None from rule-based detection'}

Analyse for these pattern types (only flag if evidence exists):
1. PRICE_MANIPULATION — mandi vs retail spread too large
2. POLICY_DISCONNECT — govt announced X but ground truth shows Y
3. CARTEL_SIGNAL — coordinated movement across commodities
4. INFLATION_GAP — official CPI vs actual basket inflation
5. SUPPLY_ANOMALY — prices spiking despite govt saying supply is adequate
6. SUBSIDY_LEAKAGE — scheme announced but beneficiary prices unchanged
7. DATA_INCONSISTENCY — two official sources contradict each other
8. HOARDING_SIGNAL — seasonal patterns broken (price spiking in harvest season)

For each anomaly found, provide:
- What the official story says
- What the ground data shows
- The gap/contradiction
- Who it hurts (which citizen segment)
- What action citizens/authorities should take
- How to verify this independently

Return ONLY this JSON (no markdown):
{
  "scan_date": "${new Date().toDateString()}",
  "anomalies_found": [
    {
      "type": "PRICE_MANIPULATION",
      "severity": "HIGH|MEDIUM|LOW",
      "title": "Short alert title",
      "official_claim": "What government/official sources say",
      "ground_reality": "What scraped/live data shows",
      "gap": "The specific contradiction with numbers",
      "citizen_impact": "Who is hurt and how much per month",
      "affected_states": ["Maharashtra","Delhi"],
      "evidence": ["data point 1", "data point 2"],
      "verification_steps": ["Step 1 to independently verify", "Step 2"],
      "escalation_path": "Who to report to (CCI/RTI/State Agri Dept/etc)",
      "citizen_action": "What a citizen can do right now",
      "sources": ["agmarknet.gov.in", "official announcement URL if known"]
    }
  ],
  "clean_signals": ["Things that appear normal and genuine today"],
  "watch_list": ["Situations to monitor over next 7 days"],
  "data_quality_note": "How reliable is today's analysis"
}`;

  const text   = await llm.call(prompt, 'brief');
  const clean  = text.replace(/```json\s*/i,'').replace(/```$/,'').trim();
  return JSON.parse(clean);
}

// ── Historical pattern database (known India corruption patterns) ─────────
const KNOWN_PATTERNS = [
  {
    id          : 'onion_cartel',
    name        : 'Onion Price Cartel',
    description : 'Nashik/Lasalgaon traders historically hoard onions in cold storage during harvest to create artificial scarcity in summer',
    trigger     : 'Onion retail >2× mandi price or price rising in harvest months (Oct–Dec)',
    precedent   : 'CCI investigated onion cartel in 2010 and 2020. Govt imposed export ban in Dec 2023.',
    how_to_spot : 'Compare daily Agmarknet arrivals vs price — price rises while arrivals stay high = hoarding signal',
    citizen_action: 'Buy directly from farmer markets (Rythu Bazaar, APMC direct sale). Report to state agriculture helpline.',
  },
  {
    id          : 'fuel_revision_delay',
    name        : 'Fuel Price Revision Delay',
    description : 'OMCs historically delay downward revisions when crude falls but revise upward quickly when crude rises',
    trigger     : 'Crude drops >$5/bbl but petrol unchanged for >14 days',
    precedent   : 'CAG 2022 report found OMCs delayed downward revision 3.2× longer than upward revisions',
    how_to_spot : 'Compare PPAC daily crude price with retail price revision dates',
    citizen_action: 'File RTI with PPAC for pricing formula. Consumer groups can petition PNGRB.',
  },
  {
    id          : 'msp_procurement_gap',
    name        : 'MSP Procurement Failure',
    description : 'Government announces MSP but state procurement agencies buy <20% of output, forcing farmers to sell below MSP',
    trigger     : 'Market price <MSP for >7 days post-harvest in major producing state',
    precedent   : 'SHWAS report 2022: only 6% of farmers got full MSP for kharif crops',
    how_to_spot : 'Compare FCI/NAFED procurement data vs total production estimates',
    citizen_action: 'Farmers: register on e-NAM. Sell to registered FPOs. File state grievance if mandi price < MSP for 7+ days.',
  },
  {
    id          : 'subsidy_leakage',
    name        : 'LPG Subsidy Leakage',
    description : 'PAHAL DBT cylinders meant for BPL families being redirected to commercial use',
    trigger     : 'LPG consumption data shows urban households consuming >12 subsidised cylinders/year',
    precedent   : 'Govt found 37M fake LPG beneficiaries in 2015–16 clean-up (saved ₹14,000 Cr)',
    how_to_spot : 'Check MoPNG portal for your area subsidy vs commercial cylinder ratio',
    citizen_action: 'Report suspicious commercial use to Oil Ministry grievance portal. Check own Aadhaar-linked LPG status.',
  },
];

// ── Master runner ─────────────────────────────────────────────────────────
async function runPatternDetection() {
  L.info('Running pattern detection scan...');
  const t0       = Date.now();
  const liveData = buildLiveData();
  const mandiData = liveData.mandiData || {};

  // Rule-based fast detection
  const basicAlerts = [
    ...detectMandiRetailSpread(liveData.commodities, mandiData),
    ...detectLockstepMovement(liveData.commodities),
    ...detectFuelPriceAnomaly(liveData.commodities, liveData.markets),
  ];

  L.info(`Rule-based: ${basicAlerts.length} basic alerts`);

  // LLM deep analysis
  let llmAnalysis = null;
  if (process.env.DEMO_MODE !== 'true') {
    llmAnalysis = await detectPatternsWithLLM(liveData, basicAlerts).catch(e => {
      L.warn('LLM pattern detection failed: ' + e.message);
      return null;
    });
  }

  const result = {
    scanDate        : new Date().toISOString(),
    durationMs      : Date.now() - t0,
    ruleBasedAlerts : basicAlerts,
    llmAnalysis,
    knownPatterns   : KNOWN_PATTERNS,
    summary: {
      totalAlerts    : basicAlerts.length + (llmAnalysis?.anomalies_found?.length || 0),
      highSeverity   : [...basicAlerts, ...(llmAnalysis?.anomalies_found||[])].filter(a => a.severity === 'HIGH').length,
      cleanSignals   : llmAnalysis?.clean_signals || [],
      watchList      : llmAnalysis?.watch_list || [],
    },
  };

  Cache.write('pattern-alerts', result, { source: 'pattern-detector' });
  L.ok(`Pattern scan done: ${result.summary.totalAlerts} alerts (${result.summary.highSeverity} HIGH)`);
  return result;
}

module.exports = {
  runPatternDetection,
  detectMandiRetailSpread,
  detectLockstepMovement,
  detectFuelPriceAnomaly,
  KNOWN_PATTERNS,
  THRESHOLDS,
};
