// /api/clock: the only way to clock in or out once the website is retired.
//
// Called by the /clock Claude Code skill with a per-person device token in the
// `x-clock-token` header. The token decides who you are and what you may do:
//   worker (Dez, Chloe): their own clock, their own numbers, nothing else.
//   owner  (Justin, Sam): their own clock plus the admin jobs the website used
//                         to do (memos, missed shifts, corrections, projects).
//
// Every clock change goes through the clock_in / clock_out database functions
// (one locked transaction each), never a raw insert + delete.
import { deviceFromRequest, enroll } from "./_lib/auth.js";
import { db, enc } from "./_lib/supa.js";
import { drainOutbox } from "./_lib/notify.js";
import {
  annotate, sumWindow, windowsFor, deductionFor, hoursToOvertime,
  hstDateString, weekMonday, round2,
} from "./_lib/pay.js";

const CATS = ["Travel", "On-Site", "Coordination", "Admin", "Video Updates", "Virtual Assistance"];
const DAY_MS = 86_400_000;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);

// ── small validators ───────────────────────────────────────────────────────
function reqId(body) {
  const id = body.request_id;
  if (typeof id !== "string" || id.length < 8 || id.length > 100) throw bad("request_id is required (8-100 chars)");
  return id;
}
function uuid(v, name) {
  if (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) throw bad(`${name} must be an id`);
  return v;
}
// Times must carry their zone (e.g. 2026-09-22T17:00:00-10:00). A bare
// "2026-09-22T17:00:00" would be read in the server's zone (UTC), 10 hours off.
function isoTime(v, name) {
  if (typeof v !== "string" || !/(Z|[+-]\d\d:?\d\d)$/.test(v.trim())) {
    throw bad(`${name} must be a date-time with its time zone, e.g. 2026-09-22T17:00:00-10:00`);
  }
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw bad(`${name} must be a date-time`);
  return t;
}
function text(v, name, max = 1000) {
  if (typeof v !== "string" || !v.trim()) throw bad(`${name} is required`);
  if (v.length > max) throw bad(`${name} is too long`);
  return v.trim();
}
function category(v) {
  if (v === undefined || v === null || v === "") return "Admin";
  if (!CATS.includes(v)) throw bad(`category must be one of: ${CATS.join(", ")}`);
  return v;
}
function namesOf(dev) {
  return [dev.worker_name, ...(dev.worker_aliases || [])];
}
function inList(names) {
  return `in.(${names.map((n) => `"${n.replace(/"/g, "")}"`).join(",")})`;
}

// ── data loads ─────────────────────────────────────────────────────────────
async function loadPayConfig(workerName) {
  // Fresh on every request: rates must never come from a stale cache.
  const rows = await db.get("settings?or=(key.like.worker_config_*,key.like.worker_deductions_*)&select=key,value");
  let cfg = null;
  let ded = null;
  for (const r of rows || []) {
    if (r.value?.worker !== workerName) continue;
    if (r.key.startsWith("worker_config_")) cfg = r.value;
    if (r.key.startsWith("worker_deductions_")) ded = r.value;
  }
  return { cfg, ded };
}

async function loadProjects() {
  const rows = await db.get("projects?select=id,name,j_rate,s_rate,archived&order=name.asc");
  return new Map((rows || []).map((p) => [p.id, { ...p, name: p.name.replace(/\s+/g, " ").trim() }]));
}

async function loadEntries(names, fromMs) {
  return db.getAll(
    `time_entries?worker=${enc(inList(names))}&start_time=gte.${enc(new Date(fromMs).toISOString())}` +
    "&select=id,worker,duration_ms,start_time,end_time,work_location,category,description,project_id,review_status,review_note" +
    "&order=start_time.asc,id.asc"
  );
}

async function peopleByName() {
  const rows = await db.get("clock_people?active=is.true&select=*");
  return new Map((rows || []).map((p) => [p.display_name.toLowerCase(), p]));
}

async function personFor(name) {
  const people = await peopleByName();
  const p = people.get(String(name || "").toLowerCase());
  if (!p) throw bad(`Unknown person "${name}". Known: ${[...people.keys()].join(", ")}`);
  return p;
}

async function audit(actor, action, entryId, before, after, note) {
  await db.insert("clock_audit", {
    actor_profile_id: actor.profile_id, action, entry_id: entryId || null,
    before: before || null, after: after || null, note: note || null,
  });
}

async function ownEntry(dev, entryId) {
  const rows = await db.get(`time_entries?id=eq.${enc(uuid(entryId, "entry_id"))}&select=*`);
  const e = rows?.[0];
  if (!e) throw new HttpError(404, "No such entry");
  if (dev.role !== "owner" && !namesOf(dev).includes(e.worker)) throw new HttpError(403, "Not your entry");
  return e;
}

// ── the status payload behind both widgets ─────────────────────────────────
async function statusFor(dev, nowMs = Date.now()) {
  const win = windowsFor(nowMs);
  const names = namesOf(dev);
  const [openRows, projects, entries] = await Promise.all([
    db.get(`clock_status?user_id=eq.${enc(dev.profile_id)}&select=*`),
    loadProjects(),
    loadEntries(names, weekMonday(win.ytd.start)),
  ]);
  const open = openRows?.[0] || null;

  const out = {
    now: new Date(nowMs).toISOString(),
    today_hst: hstDateString(nowMs),
    me: { display: dev.display_name, role: dev.role, worker_name: dev.worker_name },
    clock: open
      ? {
          in: true,
          start_time: open.start_time,
          session_id: open.session_id,
          project_id: open.project_id,
          project_name: projects.get(open.project_id)?.name || null,
          elapsed_hours: round2((nowMs - Date.parse(open.start_time)) / 3_600_000),
        }
      : { in: false },
    // Read on its own with no date limit: an unresolved shift from last year
    // still blocks payroll, so the prompt must still find it.
    needs_review: (await db.getAll(
      `time_entries?worker=${enc(inList(names))}&review_status=eq.needs_review` +
      "&select=id,start_time,end_time,review_note&order=start_time.asc,id.asc"
    )).map((e) => ({ entry_id: e.id, start_time: e.start_time, end_time: e.end_time, note: e.review_note })),
  };

  if (dev.role === "worker") {
    const { cfg, ded } = await loadPayConfig(dev.worker_name);
    if (!cfg) throw new HttpError(500, `No pay config for ${dev.worker_name}. Refusing to guess a rate.`);
    const rows = annotate(entries || [], cfg);
    const totals = {};
    for (const k of ["today", "week", "period", "month", "ytd"]) totals[k] = sumWindow(rows, win[k]);
    const deduction = deductionFor(ded, win.period.payDate);
    out.totals = totals;
    out.hours_to_overtime = hoursToOvertime(cfg, entries || [], win.week, nowMs);
    out.stub = {
      label: "Projected. Justin sends the actual pay stub.",
      period: win.period.label,
      pay_date: hstDateString(win.period.payDate),
      regular_hours: totals.period.regular_hours,
      ot_hours: totals.period.ot_hours,
      regular_pay: totals.period.regular_pay,
      ot_pay: totals.period.ot_pay,
      gross: totals.period.gross,
      deduction,
      net: round2(totals.period.gross - (deduction?.amount || 0)),
    };
  } else {
    // Owners bill by project instead of drawing wages.
    const rateKey = dev.worker_name.startsWith("Sam") ? "s_rate" : "j_rate";
    const byProject = (w) => {
      const acc = new Map();
      for (const e of entries || []) {
        const t = Date.parse(e.start_time);
        if (t < w.start || t >= w.end) continue;
        const p = projects.get(e.project_id);
        const cur = acc.get(e.project_id) || { project_id: e.project_id, project: p?.name || "Unknown project", hours: 0, billable: 0 };
        const h = (e.duration_ms || 0) / 3_600_000;
        cur.hours += h;
        cur.billable += h * Number(p?.[rateKey] || 0);
        acc.set(e.project_id, cur);
      }
      return [...acc.values()].map((x) => ({ ...x, hours: round2(x.hours), billable: round2(x.billable) }));
    };
    out.by_project = { today: byProject(win.today), week: byProject(win.week), month: byProject(win.month) };
    const last = open || [...(entries || [])].reverse()[0];
    out.last_project_id = last?.project_id || null;
    out.projects = [...projects.values()].filter((p) => !p.archived)
      .map((p) => ({ id: p.id, name: p.name, rate: Number(p[rateKey] || 0) }));
  }

  // Memos: due today or earlier (last 30 days), not yet acknowledged by me.
  const today = hstDateString(nowMs);
  const since = hstDateString(nowMs - 30 * DAY_MS);
  const memos = await db.get(
    `clock_memos?target_profile_ids=cs.${enc(`{${dev.profile_id}}`)}&show_on=lte.${today}&show_on=gte.${since}` +
    "&select=id,body,show_on,created_at,clock_memo_acks(profile_id)&order=created_at.asc"
  );
  out.memos = (memos || [])
    .filter((m) => !(m.clock_memo_acks || []).some((a) => a.profile_id === dev.profile_id))
    .map((m) => ({ id: m.id, body: m.body, show_on: m.show_on }));

  return out;
}

// Deliver queued emails, but never let a slow Gmail hold up a clock action.
async function tryDrain() {
  await Promise.race([
    drainOutbox(10).catch(() => null),
    new Promise((r) => setTimeout(r, 6000)),
  ]);
}

// ── actions ────────────────────────────────────────────────────────────────
const workerActions = {
  async status(dev) {
    return statusFor(dev);
  },

  async in(dev, body) {
    let project = dev.fixed_project_id;
    if (!project) {
      project = uuid(body.project_id, "project_id");
      const projects = await loadProjects();
      const p = projects.get(project);
      if (!p || p.archived) throw bad("That project does not exist or is archived");
    }
    // `at` = when the person actually asked. A clock-in stuck offline keeps
    // its real start (the database caps it at 12 hours back and never before
    // their last saved shift ended).
    let at = null;
    if (body.at) {
      const t = isoTime(body.at, "at");
      if (t > Date.now() + 120_000) throw bad("at cannot be in the future");
      at = new Date(t).toISOString();
    }
    const result = await db.rpc("clock_in", {
      p_user: dev.profile_id, p_project: project, p_request_id: reqId(body),
      p_display: dev.display_name, p_notify: dev.role === "worker",
      p_worker_names: namesOf(dev), p_at: at,
    });
    await tryDrain();
    return { result, status: await statusFor(dev) };
  },

  async out(dev, body) {
    // Record the time right now with a neutral line; the skill fills in the
    // real summary afterward (set_summary), so writing it never adds paid time.
    const description = dev.role === "owner" && body.description
      ? text(body.description, "description")
      : "Shift (summary added after clock-out)";
    let at = null;
    if (body.at) {
      const t = isoTime(body.at, "at");
      if (t > Date.now() + 120_000) throw bad("at cannot be in the future");
      // A clock-out with an earlier time must say which shift it is for, or a
      // late retry could close (and zero out) a shift started since.
      if (!body.session_id) throw bad("A clock-out with a time must include the shift it belongs to");
      at = new Date(t).toISOString();
    }
    const result = await db.rpc("clock_out", {
      p_user: dev.profile_id, p_worker: dev.worker_name, p_display: dev.display_name,
      p_request_id: reqId(body), p_category: category(body.category), p_description: description,
      p_reason: "manual", p_notify: dev.role === "worker",
      p_expected_session: body.session_id ? uuid(body.session_id, "session_id") : null,
      p_at: at,
    });
    await tryDrain();
    return { result, status: await statusFor(dev) };
  },

  async set_summary(dev, body) {
    const e = await ownEntry(dev, body.entry_id);
    if (Date.now() - Date.parse(e.created_at) > 36 * 3_600_000 && dev.role !== "owner") {
      throw new HttpError(403, "Too old to edit. Ask Justin.");
    }
    const patch = { description: text(body.description, "description") };
    if (body.category) patch.category = category(body.category);
    const [after] = await db.patch(`time_entries?id=eq.${enc(e.id)}`, patch);
    await audit(dev, "set_summary", e.id, { description: e.description, category: e.category }, patch);
    return { entry: after };
  },

  async memo_ack(dev, body) {
    const ids = Array.isArray(body.memo_ids) ? body.memo_ids.map((m) => uuid(m, "memo_id")) : [];
    for (const id of ids) {
      await fetchIgnoreDup(() => db.insert("clock_memo_acks", { memo_id: id, profile_id: dev.profile_id }));
    }
    return { acked: ids.length };
  },

  async fix_missed_clockout(dev, body) {
    return { entry: await editShift(dev, dev, "worker_fix", {
      entry_id: uuid(body.entry_id, "entry_id"), end: isoTime(body.end_time, "end_time"),
    }) };
  },
};

async function fetchIgnoreDup(fn) {
  try { await fn(); } catch (err) { if (!/23505|duplicate/i.test(String(err.message))) throw err; }
}

// Every change to a saved shift goes through clock_edit_shift: one locked
// transaction that re-reads the shift, refuses overlaps (saved AND open
// shifts), future end times and other people's shifts, and writes the audit
// row and any agent.care@ email together with the change.
async function editShift(actor, person, mode, f) {
  const iso = (ms) => (ms === undefined || ms === null ? null : new Date(ms).toISOString());
  return db.rpc("clock_edit_shift", {
    p_mode: mode,
    p_actor: actor.profile_id,
    p_actor_display: actor.display_name,
    p_person: person.profile_id,
    p_worker: person.worker_name,
    p_worker_names: namesOf(person),
    p_person_display: person.display_name,
    p_notify: person.role === "worker",
    p_entry_id: f.entry_id || null,
    p_project: f.project_id || null,
    p_start: iso(f.start),
    p_end: iso(f.end),
    p_category: f.category || null,
    p_description: f.description || null,
    p_note: f.note || null,
  });
}

// The person a saved shift belongs to (by its worker name). Falls back to a
// stand-in so owners can still fix a legacy row nobody on /clock owns.
async function personOfEntry(entryId, actor) {
  const e = (await db.get(`time_entries?id=eq.${enc(uuid(entryId, "entry_id"))}&select=worker`))?.[0];
  if (!e) throw new HttpError(404, "No such entry");
  const people = await db.get("clock_people?select=*");
  const p = (people || []).find((x) => namesOf(x).includes(e.worker));
  return p || { ...actor, worker_name: e.worker, worker_aliases: [], display_name: e.worker, role: "owner" };
}

const ownerActions = {
  async who_is_on() {
    const rows = await db.get("clock_status?select=user_id,start_time,project_id,profiles(name)");
    const projects = await loadProjects();
    return {
      on_the_clock: (rows || []).map((r) => ({
        name: r.profiles?.name, start_time: r.start_time,
        project: projects.get(r.project_id)?.name || null,
        hours_so_far: round2((Date.now() - Date.parse(r.start_time)) / 3_600_000),
      })),
    };
  },

  async worker_status(_dev, body) {
    return statusFor(await personFor(body.person));
  },

  async memo_create(dev, body) {
    const people = await peopleByName();
    const targets = (Array.isArray(body.targets) ? body.targets : []).map((t) => {
      const d = people.get(String(t).toLowerCase());
      if (!d) throw bad(`Unknown memo target "${t}"`);
      return d.profile_id;
    });
    if (!targets.length) throw bad("targets is required, e.g. [\"dez\", \"chloe\"]");
    const showOn = body.show_on || hstDateString(Date.now() + DAY_MS);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(showOn)) throw bad("show_on must be YYYY-MM-DD");
    const [memo] = await db.insert("clock_memos", {
      body: text(body.body, "body", 4000), target_profile_ids: [...new Set(targets)],
      show_on: showOn, created_by: dev.profile_id,
    });
    return { memo };
  },

  async memo_list() {
    const memos = await db.get("clock_memos?select=*,clock_memo_acks(profile_id,acked_at)&order=created_at.desc&limit=20");
    return { memos };
  },

  async review_queue() {
    const rows = await db.get("time_entries?review_status=eq.needs_review&select=id,worker,start_time,end_time,review_note&order=start_time.asc");
    return { needs_review: rows || [] };
  },

  async resolve_review(dev, body) {
    const person = await personOfEntry(body.entry_id, dev);
    if (body.end_time) {
      return { entry: await editShift(dev, person, "owner_edit", {
        entry_id: body.entry_id, end: isoTime(body.end_time, "end_time"), note: body.note,
      }) };
    }
    return { entry: await editShift(dev, person, "owner_approve", { entry_id: body.entry_id, note: body.note }) };
  },

  async add_shift(dev, body) {
    const who = await personFor(body.person);
    const project = who.fixed_project_id || uuid(body.project_id, "project_id");
    return { entry: await editShift(dev, who, "owner_add", {
      project_id: project,
      start: isoTime(body.start_time, "start_time"),
      end: isoTime(body.end_time, "end_time"),
      category: category(body.category),
      description: body.description ? text(body.description, "description") : null,
      note: body.note,
    }) };
  },

  async correct_shift(dev, body) {
    const person = await personOfEntry(body.entry_id, dev);
    const f = { entry_id: body.entry_id, note: body.note };
    if (body.start_time) f.start = isoTime(body.start_time, "start_time");
    if (body.end_time) f.end = isoTime(body.end_time, "end_time");
    if (body.description) f.description = text(body.description, "description");
    if (body.category) f.category = category(body.category);
    if (!f.start && !f.end && !f.description && !f.category) throw bad("Nothing to change");
    return { entry: await editShift(dev, person, "owner_edit", f) };
  },

  async delete_shift(dev, body) {
    const e = await ownEntry(dev, body.entry_id);
    await audit(dev, "delete_shift", e.id, e, null, body.note);
    await db.del(`time_entries?id=eq.${enc(e.id)}`);
    return { deleted: e.id };
  },

  async list_projects() {
    return { projects: [...(await loadProjects()).values()] };
  },

  async add_project(dev, body) {
    const row = {
      name: text(body.name, "name", 200),
      j_rate: Number(body.j_rate ?? 75), s_rate: Number(body.s_rate ?? 60),
      created_by: dev.profile_id,
    };
    if (!(row.j_rate >= 0) || !(row.s_rate >= 0)) throw bad("Rates must be numbers");
    const [project] = await db.insert("projects", row);
    await audit(dev, "add_project", null, null, project);
    return { project };
  },

  async list_devices() {
    const rows = await db.get("clock_devices?select=id,display_name,role,device_label,last_used_at,revoked_at,created_at&order=display_name.asc,created_at.desc");
    return { devices: rows };
  },

  // Taking someone off /clock entirely (offboarding). Revoking one device is not
  // enough on its own: a Mac with a live Command Center sign-in re-enrolls itself.
  async set_person_active(dev, body) {
    const p = await (async () => {
      const rows = await db.get("clock_people?select=*");
      return (rows || []).find((r) => r.display_name.toLowerCase() === String(body.person || "").toLowerCase());
    })();
    if (!p) throw bad(`Unknown person "${body.person}"`);
    if (p.profile_id === dev.profile_id) throw bad("You cannot switch yourself off");
    const active = body.active === true;
    await db.patch(`clock_people?profile_id=eq.${enc(p.profile_id)}`, { active });
    if (!active) {
      await db.patch(`clock_devices?profile_id=eq.${enc(p.profile_id)}&revoked_at=is.null`, { revoked_at: new Date().toISOString() });
    }
    await audit(dev, "set_person_active", null, { active: p.active }, { person: p.display_name, active });
    return { person: p.display_name, active };
  },

  async revoke_device(dev, body) {
    const [row] = await db.patch(`clock_devices?id=eq.${enc(uuid(body.device_id, "device_id"))}`, { revoked_at: new Date().toISOString() });
    await audit(dev, "revoke_device", null, null, { device_id: row?.id, display_name: row?.display_name });
    return { revoked: row?.id || null };
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const body0 = (typeof req.body === "object" && req.body) || {};
    if (body0.action === "enroll") {
      const r = await enroll(req, body0.device_label);
      return res.status(r.status).json(r.body);
    }
    const dev = await deviceFromRequest(req);
    if (!dev) return res.status(401).json({ error: "Unknown or revoked device token" });
    const body = (typeof req.body === "object" && req.body) || {};
    const action = String(body.action || "status");
    const fn = workerActions[action] || (dev.role === "owner" ? ownerActions[action] : null);
    if (!fn) {
      const known = ownerActions[action] ? "That action is for Justin and Sam only." : `Unknown action "${action}".`;
      return res.status(ownerActions[action] ? 403 : 400).json({ error: known });
    }
    return res.status(200).json(await fn(dev, body));
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: String(err.message || err) });
  }
}

