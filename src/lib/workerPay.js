// Worker pay engine.
// Reads worker_config_* rows from the `settings` table and computes per-entry
// rates and per-period pay summaries.
//
// Two pay types today:
//   - tiered_location: Chloe — rate by location (office/home) and probation tier (before/after)
//   - weekly_ot:       Desmond — flat straight rate up to threshold/week, OT rate beyond
//
// Justin and Sam are not in worker_configs; their rates come from project.j_rate / project.s_rate.
// Callers should fall back to the project rate when getWorkerConfig() returns null.

let _cache = null;
let _cacheAt = 0;
const CACHE_TTL_MS = 60_000;

export async function loadWorkerConfigs(supabase, { force = false } = {}) {
  if (!force && _cache && Date.now() - _cacheAt < CACHE_TTL_MS) return _cache;
  const { data, error } = await supabase
    .from('settings')
    .select('key, value')
    .like('key', 'worker_config_%');
  if (error) throw error;
  const map = {};
  for (const row of data || []) {
    const cfg = row.value;
    if (cfg && cfg.worker) map[cfg.worker] = cfg;
  }
  _cache = map;
  _cacheAt = Date.now();
  return map;
}

export function invalidateWorkerConfigCache() {
  _cache = null;
  _cacheAt = 0;
}

export function getWorkerConfig(workerName, configs) {
  return (configs && configs[workerName]) || null;
}

// Resolve the active sub-config for an entry when the worker's config is a
// `history` wrapper. Returns the sub-config whose [effective_from, effective_to]
// window contains entry.start_time. Falls back to the last config if no match.
export function resolveConfigForEntry(entry, cfg) {
  if (!cfg) return null;
  if (cfg.type !== 'history') return cfg;
  const t = entry?.start_time ? new Date(entry.start_time) : new Date();
  const list = cfg.configs || [];
  for (const c of list) {
    const from = c.effective_from ? new Date(c.effective_from) : null;
    const to = c.effective_to ? new Date(c.effective_to) : null;
    if (from && t < from) continue;
    if (to && t > to) continue;
    return c;
  }
  return list[list.length - 1] || null;
}

// Per-entry rate (used for inline display in entry lists, PDF rows, dashboards).
// For weekly_ot / tiered_weekly_ot workers, returns the straight rate as a
// display proxy — actual regular vs OT split is determined by calcWorkerPay()
// over the full period.
export function getEntryRate(entry, configs, projectRates = {}) {
  const wrapper = getWorkerConfig(entry.worker, configs);
  const cfg = resolveConfigForEntry(entry, wrapper);
  if (!cfg) {
    if (entry.worker === 'Sam Palompo') return projectRates.s_rate ?? 60;
    return projectRates.j_rate ?? 75;
  }
  if (cfg.type === 'tiered_location') return chloeEntryRate(entry, cfg);
  if (cfg.type === 'weekly_ot') return cfg.straightRate;
  if (cfg.type === 'tiered_weekly_ot') return tieredStraight(entry, cfg);
  return 0;
}

function tieredStraight(entry, cfg) {
  const start = entry?.start_time ? new Date(entry.start_time) : new Date();
  const probationStart = new Date(cfg.probationStart);
  const days = Math.floor((start - probationStart) / 86_400_000);
  const tier = days >= cfg.probationDays ? 'after' : 'before';
  return cfg.rates?.[tier]?.straight ?? 0;
}

function chloeEntryRate(entry, cfg) {
  const start = entry?.start_time ? new Date(entry.start_time) : new Date();
  const probationStart = new Date(cfg.probationStart);
  const days = Math.floor((start - probationStart) / 86_400_000);
  const tier = days >= cfg.probationDays ? 'after' : 'before';
  const location = entry?.work_location || 'office';
  return cfg.rates?.[location]?.[tier] ?? 0;
}

// HST-aware Monday week-key: returns YYYY-MM-DD of the Monday that anchors
// the working week containing `date`. Used to bucket weekly_ot entries.
function getWeekKey(date, timezone = 'Pacific/Honolulu') {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  const wd = parts.find(p => p.type === 'weekday').value;
  const map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const offset = map[wd] ?? 0;
  const local = new Date(`${y}-${m}-${d}T12:00:00Z`);
  local.setUTCDate(local.getUTCDate() - offset);
  return local.toISOString().slice(0, 10);
}

const EMPTY = Object.freeze({
  regularHours: 0, otHours: 0, regularPay: 0, otPay: 0, lumpSumTotal: 0, totalPay: 0,
});

// Compute pay totals for a single worker over a set of entries.
// Returns { regularHours, otHours, regularPay, otPay, lumpSumTotal, totalPay }.
// Handles `history` wrapper configs by grouping entries by their resolved
// sub-config and summing each group's pay.
export function calcWorkerPay(workerName, entries, configs, { projectRates = {} } = {}) {
  const wrapper = getWorkerConfig(workerName, configs);
  if (!wrapper) {
    const rate = workerName === 'Sam Palompo'
      ? (projectRates.s_rate ?? 60)
      : (projectRates.j_rate ?? 75);
    return summarizeFlatRate(entries.filter(e => e.worker === workerName), rate);
  }
  const mine = entries.filter(e => e.worker === workerName);

  // If config is history-wrapped, partition entries by which sub-config applies
  // and sum each group. Otherwise dispatch directly.
  if (wrapper.type === 'history') {
    const groups = new Map(); // sub-cfg -> entries[]
    for (const e of mine) {
      const sub = resolveConfigForEntry(e, wrapper);
      if (!sub) continue;
      if (!groups.has(sub)) groups.set(sub, []);
      groups.get(sub).push(e);
    }
    const acc = { ...EMPTY };
    for (const [sub, subEntries] of groups) {
      const part = dispatchCalc(sub, subEntries);
      acc.regularHours += part.regularHours;
      acc.otHours += part.otHours;
      acc.regularPay += part.regularPay;
      acc.otPay += part.otPay;
      acc.lumpSumTotal += part.lumpSumTotal;
      acc.totalPay += part.totalPay;
    }
    return acc;
  }
  return dispatchCalc(wrapper, mine);
}

function dispatchCalc(cfg, entries) {
  if (cfg.type === 'tiered_location') return calcTieredLocationPay(entries, cfg);
  if (cfg.type === 'weekly_ot') return calcWeeklyOtPay(entries, cfg);
  if (cfg.type === 'tiered_weekly_ot') return calcTieredWeeklyOtPay(entries, cfg);
  return { ...EMPTY };
}

function summarizeFlatRate(entries, rate) {
  let hours = 0, pay = 0, lumpSumTotal = 0;
  for (const e of entries) {
    if (e.lump_sum_amount && Number(e.lump_sum_amount) > 0) {
      lumpSumTotal += Number(e.lump_sum_amount);
      continue;
    }
    const h = (e.duration_ms || 0) / 3_600_000;
    hours += h;
    pay += h * rate;
  }
  return {
    regularHours: hours, otHours: 0,
    regularPay: pay, otPay: 0,
    lumpSumTotal, totalPay: pay + lumpSumTotal,
  };
}

function calcTieredLocationPay(entries, cfg) {
  let hours = 0, pay = 0, lumpSumTotal = 0;
  for (const e of entries) {
    if (e.lump_sum_amount && Number(e.lump_sum_amount) > 0) {
      lumpSumTotal += Number(e.lump_sum_amount);
      continue;
    }
    const h = (e.duration_ms || 0) / 3_600_000;
    hours += h;
    pay += h * chloeEntryRate(e, cfg);
  }
  return {
    regularHours: hours, otHours: 0,
    regularPay: pay, otPay: 0,
    lumpSumTotal, totalPay: pay + lumpSumTotal,
  };
}

function calcWeeklyOtPay(entries, cfg) {
  const weeks = {};
  let lumpSumTotal = 0;
  for (const e of entries) {
    if (e.lump_sum_amount && Number(e.lump_sum_amount) > 0) {
      lumpSumTotal += Number(e.lump_sum_amount);
      continue;
    }
    if (!e.duration_ms) continue;
    const key = getWeekKey(new Date(e.start_time), cfg.timezone);
    weeks[key] = (weeks[key] || 0) + e.duration_ms;
  }
  let regularHours = 0, otHours = 0;
  for (const ms of Object.values(weeks)) {
    const h = ms / 3_600_000;
    const reg = Math.min(h, cfg.otThreshold);
    const ot = Math.max(0, h - cfg.otThreshold);
    regularHours += reg;
    otHours += ot;
  }
  const regularPay = regularHours * cfg.straightRate;
  const otPay = otHours * cfg.otRate;
  return {
    regularHours, otHours,
    regularPay, otPay,
    lumpSumTotal, totalPay: regularPay + otPay + lumpSumTotal,
  };
}

// Tier-aware weekly OT: tier (before/after probation) is determined per entry;
// each week buckets straight up to threshold then OT beyond.
function calcTieredWeeklyOtPay(entries, cfg) {
  const weeks = {};
  let lumpSumTotal = 0;
  for (const e of entries) {
    if (e.lump_sum_amount && Number(e.lump_sum_amount) > 0) {
      lumpSumTotal += Number(e.lump_sum_amount);
      continue;
    }
    if (!e.duration_ms) continue;
    const key = getWeekKey(new Date(e.start_time), cfg.timezone);
    if (!weeks[key]) weeks[key] = [];
    weeks[key].push(e);
  }
  let regularHours = 0, otHours = 0, regularPay = 0, otPay = 0;
  const thresholdMs = cfg.otThreshold * 3_600_000;
  for (const wk of Object.values(weeks)) {
    const sorted = [...wk].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    let cumul = 0;
    for (const e of sorted) {
      const ms = e.duration_ms || 0;
      const probationStart = new Date(cfg.probationStart);
      const t = new Date(e.start_time);
      const days = Math.floor((t - probationStart) / 86_400_000);
      const tier = days >= cfg.probationDays ? 'after' : 'before';
      const straight = cfg.rates?.[tier]?.straight ?? 0;
      const otRate = cfg.rates?.[tier]?.ot ?? straight * 1.5;
      const newCumul = cumul + ms;
      if (newCumul <= thresholdMs) {
        const h = ms / 3_600_000;
        regularHours += h;
        regularPay += h * straight;
      } else if (cumul >= thresholdMs) {
        const h = ms / 3_600_000;
        otHours += h;
        otPay += h * otRate;
      } else {
        const regMs = thresholdMs - cumul;
        const otMs = ms - regMs;
        const rH = regMs / 3_600_000;
        const oH = otMs / 3_600_000;
        regularHours += rH; otHours += oH;
        regularPay += rH * straight; otPay += oH * otRate;
      }
      cumul = newCumul;
    }
  }
  return {
    regularHours, otHours,
    regularPay, otPay,
    lumpSumTotal, totalPay: regularPay + otPay + lumpSumTotal,
  };
}

// Helper for tagging an entry as straight vs OT based on weekly running total.
// Useful for PDF rendering where each line wants to show "$36" vs "$54".
// Returns { rate, isOt } for the given entry, given all entries that share its
// weekly_ot config and week. Pass entries pre-sorted ascending by start_time.
export function classifyWeeklyOtEntry(entry, sameWeekEntries, cfg) {
  const before = sameWeekEntries.filter(e =>
    new Date(e.start_time) < new Date(entry.start_time)
  );
  const hoursBefore = before.reduce((s, e) => s + (e.duration_ms || 0), 0) / 3_600_000;
  const hoursThis = (entry.duration_ms || 0) / 3_600_000;
  if (hoursBefore >= cfg.otThreshold) return { rate: cfg.otRate, isOt: true };
  if (hoursBefore + hoursThis <= cfg.otThreshold) return { rate: cfg.straightRate, isOt: false };
  // Entry straddles the threshold — caller should split. For display, mark as straight.
  return { rate: cfg.straightRate, isOt: false, straddles: true };
}

// For unit testing / debugging from a console
export const __internal = { chloeEntryRate, getWeekKey };
