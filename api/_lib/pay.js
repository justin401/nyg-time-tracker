// Pay math for the /clock widgets.
//
// This is a line-for-line port of ~/justin-assistant/pay_report.py, the engine
// the real pay stubs come from, so the projection matches the stub to the cent.
// Deliberately NOT src/lib/workerPay.js: that one undercounts overtime when a
// week straddles the 15th/16th and reads rate dates in the server's time zone.
//
// Conventions copied from pay_report.py on purpose (see the plan's section 6
// before changing any of them, they move real money):
//   * Rate-change dates with no offset are read as UTC (Python's
//     fromisoformat(...).replace(tzinfo=UTC)). Fixed here so a server in any
//     time zone gives the same answer.
//   * Overtime is scored per Mon-Sun HST week, chronologically, on the full
//     week even when part of it falls in an earlier window.
//   * A history-wrapped config annotates each sub-config's entries separately.
//   * Holiday double-time is off (pay_report only applies it by explicit flag).

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const HST_OFFSET_MS = -10 * HOUR_MS; // Hawaii has no daylight saving

// ── HST calendar helpers (all return UTC epoch ms) ─────────────────────────
export function hstMidnight(ms) {
  const local = ms + HST_OFFSET_MS;
  return local - (((local % DAY_MS) + DAY_MS) % DAY_MS) - HST_OFFSET_MS;
}

export function hstDateString(ms) {
  return new Date(ms + HST_OFFSET_MS).toISOString().slice(0, 10);
}

function hstYMD(ms) {
  const d = new Date(ms + HST_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay() };
}

function hstDate(y, m, d) {
  return Date.UTC(y, m, d) - HST_OFFSET_MS; // HST midnight as UTC ms
}

export function weekMonday(ms) {
  const { dow } = hstYMD(ms);
  return hstMidnight(ms) - ((dow + 6) % 7) * DAY_MS;
}

export function payPeriodFor(ms) {
  const { y, m, d } = hstYMD(ms);
  if (d <= 15) {
    return { start: hstDate(y, m, 1), end: hstDate(y, m, 16), payDate: hstDate(y, m, 16), label: `${monthName(m)} 1-15` };
  }
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return {
    start: hstDate(y, m, 16),
    end: hstDate(y, m + 1, 1),
    payDate: hstDate(y, m + 1, 1),
    label: `${monthName(m)} 16-${lastDay}`,
  };
}

export function windowsFor(nowMs) {
  const { y, m } = hstYMD(nowMs);
  const today = hstMidnight(nowMs);
  const mon = weekMonday(nowMs);
  return {
    today: { start: today, end: today + DAY_MS },
    week: { start: mon, end: mon + 7 * DAY_MS },
    period: payPeriodFor(nowMs),
    month: { start: hstDate(y, m, 1), end: hstDate(y, m + 1, 1) },
    ytd: { start: hstDate(y, 0, 1), end: hstDate(y + 1, 0, 1) },
  };
}

function monthName(m) {
  return ["January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December"][m];
}

// ── config handling (mirrors pay_report.py) ────────────────────────────────
// Mirrors pay_report.py exactly: datetime.fromisoformat(s).replace(tzinfo=UTC).
// Python keeps the wall-clock time and THROWS AWAY any offset, then calls it UTC,
// so we do the same (the config dates carry no offset today anyway). A space
// between date and time is accepted, like Python.
function parseCfgDate(s) {
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?/.exec(String(s).trim());
  if (!m) throw new Error(`Unreadable date in pay config: ${s}`);
  const t = Date.parse(`${m[1]}T${m[2] || "00:00:00"}Z`);
  if (Number.isNaN(t)) throw new Error(`Unreadable date in pay config: ${s}`);
  return t;
}

function resolveSub(entryMs, wrapper) {
  if (wrapper.type !== "history") return wrapper;
  const list = wrapper.configs || [];
  for (const c of list) {
    const f = parseCfgDate(c.effective_from);
    const to = parseCfgDate(c.effective_to);
    if (f !== null && entryMs < f) continue;
    if (to !== null && entryMs > to) continue;
    return c;
  }
  return list[list.length - 1] || null;
}

function tierFor(entryMs, cfg) {
  const days = Math.floor((entryMs - parseCfgDate(cfg.probationStart)) / DAY_MS);
  return days >= cfg.probationDays ? "after" : "before";
}

// ── annotation: one row per paid slice, like pay_report's display rows ────
function annotateLocation(entries, cfg) {
  return entries.map((e) => {
    const h = (e.duration_ms || 0) / HOUR_MS;
    const loc = e.work_location || "office";
    const rate = cfg.rates?.[loc]?.[tierFor(e._ms, cfg)] ?? 0;
    return { ms: e._ms, hours: h, amount: h * rate, ot: false, review: e.review_status };
  });
}

function annotateWeekly(entries, cfg, rateFor) {
  const threshold = cfg.otThreshold * HOUR_MS;
  const weeks = new Map();
  for (const e of entries) {
    if (!e.duration_ms) continue;
    const wk = weekMonday(e._ms);
    if (!weeks.has(wk)) weeks.set(wk, []);
    weeks.get(wk).push(e);
  }
  const rows = [];
  for (const wk of [...weeks.keys()].sort((a, b) => a - b)) {
    const list = weeks.get(wk).sort((a, b) => a._ms - b._ms);
    let cumul = 0;
    for (const e of list) {
      const ms = e.duration_ms || 0;
      const { straight, ot } = rateFor(e);
      const next = cumul + ms;
      if (next <= threshold) {
        rows.push({ ms: e._ms, hours: ms / HOUR_MS, amount: (ms / HOUR_MS) * straight, ot: false, review: e.review_status });
      } else if (cumul >= threshold) {
        rows.push({ ms: e._ms, hours: ms / HOUR_MS, amount: (ms / HOUR_MS) * ot, ot: true, review: e.review_status });
      } else {
        const reg = (threshold - cumul) / HOUR_MS;
        const over = (ms - (threshold - cumul)) / HOUR_MS;
        rows.push({ ms: e._ms, hours: reg, amount: reg * straight, ot: false, review: e.review_status });
        rows.push({ ms: e._ms, hours: over, amount: over * ot, ot: true, review: e.review_status });
      }
      cumul = next;
    }
  }
  return rows;
}

function annotateSub(entries, sub) {
  if (sub.type === "tiered_location") return annotateLocation(entries, sub);
  if (sub.type === "weekly_ot") {
    return annotateWeekly(entries, sub, () => ({ straight: sub.straightRate, ot: sub.otRate }));
  }
  if (sub.type === "tiered_weekly_ot") {
    return annotateWeekly(entries, sub, (e) => {
      const r = sub.rates?.[tierFor(e._ms, sub)] || {};
      return { straight: r.straight ?? 0, ot: r.ot ?? (r.straight ?? 0) * 1.5 };
    });
  }
  throw new Error(`Unknown pay type: ${sub.type}`);
}

/** All paid slices for a worker, annotated against full weeks. */
export function annotate(entries, wrapper) {
  if (!wrapper) throw new Error("No pay config for this worker. Refusing to guess a rate.");
  const prepared = entries.map((e) => ({ ...e, _ms: Date.parse(e.start_time) }));
  if (wrapper.type !== "history") return annotateSub(prepared, wrapper);
  const groups = new Map();
  for (const e of prepared) {
    const sub = resolveSub(e._ms, wrapper);
    if (!sub) continue;
    if (!groups.has(sub)) groups.set(sub, []);
    groups.get(sub).push(e);
  }
  const rows = [];
  for (const [sub, list] of groups) rows.push(...annotateSub(list, sub));
  return rows.sort((a, b) => a.ms - b.ms);
}

export function sumWindow(rows, win) {
  let regH = 0, otH = 0, regPay = 0, otPay = 0, review = 0;
  for (const r of rows) {
    if (r.ms < win.start || r.ms >= win.end) continue;
    if (r.ot) { otH += r.hours; otPay += r.amount; } else { regH += r.hours; regPay += r.amount; }
    if (r.review === "needs_review") review += 1;
  }
  return {
    hours: round2(regH + otH),
    regular_hours: round2(regH),
    ot_hours: round2(otH),
    regular_pay: round2(regPay),
    ot_pay: round2(otPay),
    gross: round2(regPay + otPay),
    needs_review: review,
  };
}

export function deductionFor(deductionsCfg, payDateMs) {
  if (!deductionsCfg) return null;
  const iso = hstDateString(payDateMs);
  for (const ded of deductionsCfg.deductions || []) {
    for (const s of ded.schedule || []) {
      if (s.pay_date === iso) {
        return { name: ded.name || "Deduction", amount: round2(s.amount ?? ded.per_paycheck ?? 0) };
      }
    }
  }
  return null;
}

/**
 * Hours left before overtime this week. Counts only this week's hours that fall
 * under the CURRENT pay config, because a history-wrapped config tallies each
 * config's hours separately (as pay_report.py does). Null when there is no OT.
 */
export function hoursToOvertime(wrapper, entries, weekWindow, nowMs) {
  const current = wrapper.type === "history" ? resolveSub(nowMs, wrapper) : wrapper;
  if (!current || !current.otThreshold) return null;
  let ms = 0;
  for (const e of entries) {
    const t = Date.parse(e.start_time);
    if (t < weekWindow.start || t >= weekWindow.end) continue;
    const sub = wrapper.type === "history" ? resolveSub(t, wrapper) : wrapper;
    if (sub === current) ms += e.duration_ms || 0;
  }
  return round2(Math.max(0, current.otThreshold - ms / HOUR_MS));
}

// Match Python's "{:.2f}" on the payroll side. Both round the EXACT binary
// value of the float, and differ only on an exact tie (x.xx5000... exactly):
// Python rounds to even, JavaScript's toFixed rounds up. toFixed(60) spells out
// the exact value for amounts this size, so a tie is detected exactly.
export function round2(n) {
  const exact = Math.abs(n).toFixed(60);
  const frac = exact.split(".")[1];
  if (frac.slice(2) === "5" + "0".repeat(57)) {
    const down = Math.trunc(Math.abs(n) * 100);
    const even = down % 2 === 0 ? down : down + 1;
    return (Math.sign(n) || 1) * even / 100;
  }
  return Number(n.toFixed(2));
}
