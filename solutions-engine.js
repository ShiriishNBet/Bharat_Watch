'use strict';
/**
 * BHARAT WATCH — SOLUTIONS ENGINE
 *
 * For every impact identified, generates 3–5 actionable solutions
 * with real historical examples, citizen-type specific guidance,
 * priority scoring, and estimated savings/benefit.
 *
 * Philosophy: Don't just tell people what's happening.
 * Tell them what to DO about it — with proof it works.
 *
 * CITIZEN TYPES:
 *   farmer        → crop decisions, MSP, storage, buyer access
 *   homemaker     → household budget, substitute goods, bulk buying
 *   it_professional → investments, EMI timing, tax planning
 *   gulf_worker   → remittance timing, investment back home
 *   small_business → supply chain, pricing, credit
 *   daily_wager   → scheme access, income diversification
 *   investor      → portfolio moves, sector rotation
 *   student       → education costs, scholarship access
 */

const Cache   = require('../core/cache');
const llm     = require('./llm-adapter');
const { buildLiveData } = require('../core/live-data');
const { makeLogger } = require('../core/logger');
const L = makeLogger('SOLUTIONS');

// ── Solution categories ──────────────────────────────────────────────────
const SOLUTION_CATEGORIES = {
  immediate   : { label: 'Do This NOW',          urgency: 'high',   timeframe: '0–48 hours'  },
  thisWeek    : { label: 'Do This This Week',     urgency: 'medium', timeframe: '3–7 days'    },
  thisMonth   : { label: 'Plan This Month',       urgency: 'low',    timeframe: '2–4 weeks'   },
  longTerm    : { label: 'Long-term Strategy',    urgency: 'info',   timeframe: '1–3 months'  },
  govScheme   : { label: 'Government Scheme',     urgency: 'info',   timeframe: 'Apply today' },
};

// ── Citizen profile → relevant solution types ────────────────────────────
const CITIZEN_SOLUTION_MAP = {
  farmer: {
    priorities   : ['crop_storage','msp_procurement','export_market','cooperative','insurance'],
    govSchemes   : ['PM-KISAN','e-NAM','PMFBY','KCC','Soil Health Card'],
    examples_from: ['Maharashtra onion farmers 2023', 'Punjab wheat MSP 2022', 'Karnataka tomato crisis 2023'],
  },
  homemaker: {
    priorities   : ['bulk_buying','substitute_goods','govt_ration','budget_shift','waste_reduction'],
    govSchemes   : ['PMGKAY ration', 'Jan Aushadhi', 'PM Ujjwala (LPG)'],
    examples_from: ['Delhi NCR families during onion crisis 2023', 'Mumbai household adaptation 2022'],
  },
  it_professional: {
    priorities   : ['sip_timing','emi_refinance','tax_harvesting','emergency_fund','currency_hedge'],
    govSchemes   : ['NPS tax benefit', 'PMJJBY insurance', 'Sovereign Gold Bond'],
    examples_from: ['Bengaluru techies during 2022 rate hike cycle', 'IT sector during 2023 layoffs'],
  },
  gulf_worker: {
    priorities   : ['remittance_timing','nre_account','real_estate_wait','family_insurance','india_sip'],
    govSchemes   : ['NRI bond', 'FCNR account', 'Pravasi Bharatiya Bima Yojana'],
    examples_from: ['Kerala remittance patterns during 2022 rupee fall', 'Gulf NRIs during 2020 crisis'],
  },
  small_business: {
    priorities   : ['inventory_buffer','supplier_diversity','credit_line','price_hedging','digital_payments'],
    govSchemes   : ['MSME loan scheme', 'CGTMSE', 'Udyam portal', 'GeM marketplace'],
    examples_from: ['Surat textile MSMEs during 2022 yarn crisis', 'Delhi traders during lockdown'],
  },
  daily_wager: {
    priorities   : ['mgnrega_registration','ration_card','skill_training','savings_habit','health_insurance'],
    govSchemes   : ['MGNREGA', 'PM Awas Yojana', 'PMJAY Ayushman', 'e-Shram card'],
    examples_from: ['UP migrant workers during 2021', 'Bihar MGNREGA success stories 2022'],
  },
  investor: {
    priorities   : ['sector_rotation','fii_flow_tracking','gold_allocation','debt_rebalance','sip_continuation'],
    govSchemes   : ['Sovereign Gold Bond', 'NPS', 'ELSS tax saving'],
    examples_from: ['FII exodus and re-entry 2023', 'India IT sector correction and recovery 2022–23'],
  },
};

// ── Core: generate solutions for a specific impact + citizen type ─────────
async function generateSolutions(impact, citizenType='homemaker', location={state:'Delhi'}) {
  const liveData   = buildLiveData();
  const profile    = CITIZEN_SOLUTION_MAP[citizenType] || CITIZEN_SOLUTION_MAP.homemaker;
  const markets    = liveData.markets;
  const fx         = liveData.fxRates;
  const commodities = liveData.commodities;

  // Build live market context
  const mktContext = markets.sensex
    ? `Sensex ${markets.sensex.value?.toLocaleString('en-IN')} (${markets.sensex.changePct > 0 ? '+' : ''}${markets.sensex.changePct}%)`
    : '';
  const commContext = commodities.slice(0, 5)
    .map(c => `${c.name}: ${c.price}${c.unit} (${c.chg})`).join(', ');

  const prompt = `You are a practical financial advisor for Indian citizens. Your job is to give ACTIONABLE solutions with REAL EXAMPLES.

IMPACT TO SOLVE: ${impact}

CITIZEN PROFILE:
- Type: ${citizenType}
- Location: ${location.state || 'India'}, ${location.city || ''}
- Relevant government schemes: ${profile.govSchemes.join(', ')}

LIVE MARKET DATA:
- ${mktContext}
- Commodities: ${commContext}
- USD/INR: ₹${fx.USD_INR || '84'}

Generate exactly 5 solutions. For EACH solution include:
1. A REAL HISTORICAL EXAMPLE of someone who did this successfully in India
2. Specific numbers (how much they saved, earned, or protected)
3. Exact steps to implement TODAY
4. Which government scheme or platform to use (with URL if known)

Return ONLY this JSON (no markdown):
{
  "impact_summary": "one sentence of what is happening",
  "impact_on_monthly_budget": "₹XXX more/less per month",
  "solutions": [
    {
      "id": "sol_1",
      "category": "immediate|thisWeek|thisMonth|longTerm|govScheme",
      "title": "Short action title",
      "action": "Exactly what to do — specific, step-by-step",
      "saving_or_benefit": "₹XXX per month / % gain / specific outcome",
      "real_example": {
        "who": "Name or description of real person/group",
        "where": "State/city in India",
        "when": "Year or period",
        "what_they_did": "Exactly what action they took",
        "result": "Specific outcome with numbers"
      },
      "how_to_start": "First step to take in next 2 hours",
      "resources": [
        { "name": "Platform/scheme name", "url": "https://...", "type": "government|app|market|bank" }
      ],
      "difficulty": "easy|medium|hard",
      "time_to_benefit": "48 hours|1 week|1 month|3 months"
    }
  ],
  "citizen_type": "${citizenType}",
  "location": "${location.state || 'India'}",
  "generated_for": "${new Date().toDateString()}"
}`;

  const text = await llm.call(prompt, 'brief');
  const clean = text.replace(/```json\s*/i,'').replace(/```$/,'').trim();
  return JSON.parse(clean);
}

// ── Generate solutions for ALL current impacts ────────────────────────────
async function generateAllSolutions(citizenType='homemaker', location={}) {
  L.info(`Generating solutions for ${citizenType} in ${location.state || 'India'}`);
  const t0 = Date.now();

  const liveData = buildLiveData();
  const ai       = Cache.read('ai-brief');
  const pred     = {
    markets    : Cache.read('pred-markets')?.data,
    commodities: Cache.read('pred-commodities')?.data,
    policy     : Cache.read('pred-policy')?.data,
  };

  // Build impact list from live data
  const impacts = [];

  // Commodity price impacts
  const spiking = liveData.commodities
    .filter(c => c.dir === 'up' && c.chgNumeric > 3)
    .map(c => `${c.name} price up — currently ${c.price}${c.unit} (${c.chg})`);
  if (spiking.length > 0) impacts.push(`Food price spike: ${spiking.slice(0,3).join('; ')}`);

  // Market impacts
  if (pred.markets?.direction === 'bearish') impacts.push(`Stock market expected to fall — ${pred.markets.headline}`);
  if (pred.markets?.direction === 'bullish') impacts.push(`Stock market rally expected — ${pred.markets.headline}`);

  // Policy impacts
  if (pred.policy?.direction) impacts.push(`Policy outlook: ${pred.policy.headline || pred.policy.direction}`);

  // AI brief impacts
  if (ai?.data?.briefText) {
    const brief = ai.data.briefText.slice(0, 300);
    impacts.push(`Global situation: ${brief.split('\n')[0] || brief.slice(0,150)}`);
  }

  // Fallback
  if (impacts.length === 0) impacts.push('Monitor weekly household expenses and investment portfolio');

  // Generate solutions for top 3 impacts in parallel
  const topImpacts = impacts.slice(0, 3);
  const results = await Promise.allSettled(
    topImpacts.map(impact => generateSolutions(impact, citizenType, location))
  );

  const solutions = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  const output = {
    citizenType,
    location,
    impactsAnalysed: topImpacts.length,
    solutions,
    generatedAt: new Date().toISOString(),
    durationMs : Date.now() - t0,
  };

  // Cache by citizen type
  Cache.write(`solutions-${citizenType}-${(location.state||'india').toLowerCase().replace(/\s/g,'-')}`, output, {
    source: 'solutions-engine',
  });

  L.ok(`Solutions generated: ${solutions.length} sets for ${citizenType}`);
  return output;
}

// ── Quick solutions for the dashboard strip ───────────────────────────────
async function getQuickSolutions(citizenType='homemaker') {
  const liveData = buildLiveData();

  // Find the most urgent impact right now
  const urgentCommodity = liveData.commodities
    .sort((a,b) => (b.chgNumeric||0) - (a.chgNumeric||0))[0];

  const impact = urgentCommodity?.chgNumeric > 5
    ? `${urgentCommodity.name} price spike: ${urgentCommodity.price}${urgentCommodity.unit} (${urgentCommodity.chg})`
    : 'Current economic conditions in India';

  return generateSolutions(impact, citizenType, {});
}

module.exports = {
  generateSolutions,
  generateAllSolutions,
  getQuickSolutions,
  SOLUTION_CATEGORIES,
  CITIZEN_SOLUTION_MAP,
};
