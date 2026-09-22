// agent.care@ emails for clock events, sent as Cortana.
//
// Every clock change writes a row to clock_notifications inside the same
// database transaction (see clock_in/clock_out), so an email can never be
// lost: this module only DELIVERS the outbox. Rows are claimed with
// FOR UPDATE SKIP LOCKED, so two runs can never send the same email, and a
// failed send is retried by the sweep job.
//
// Gmail is called directly with a service-account JWT (domain-wide delegation
// as cortana-ai@, scope gmail.send). Same credential and grant as the Command
// Center's cortana-gmail.ts, without the googleapis dependency.
import { createSign } from "node:crypto";
import { db, enc } from "./supa.js";
import { CORTANA_SIGNATURE_HTML } from "./signature.js";

const CORTANA = "cortana-ai@teamtaparra.com";
// CLOCK_EMAIL_TO exists only so tests can send to a mailbox nobody watches.
const TO = process.env.CLOCK_EMAIL_TO || "agent.care@teamtaparra.com";
const HST_OFFSET_MS = -10 * 3_600_000;

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessToken() {
  const raw = process.env.GMAIL_SA_KEY;
  if (!raw) throw new Error("GMAIL_SA_KEY is not set");
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    sub: CORTANA,
    scope: "https://www.googleapis.com/auth/gmail.send",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const sig = b64url(signer.sign(sa.private_key));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${sig}`,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`Google token error ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data.access_token;
}

async function sendEmail(token, subject, html) {
  const raw = [
    `From: Cortana <${CORTANA}>`,
    `To: ${TO}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    html,
  ].join("\r\n");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: b64url(raw) }),
  });
  if (!res.ok) throw new Error(`Gmail send ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export function fmtTime(iso) {
  const d = new Date(Date.parse(iso) + HST_OFFSET_MS);
  let h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function fmtDay(iso) {
  const d = new Date(Date.parse(iso) + HST_OFFSET_MS);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${days[d.getUTCDay()]} ${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function fmtHours(ms) {
  return (ms / 3_600_000).toFixed(2);
}

/** Subject + HTML body for one outbox row. Exported for tests. */
export function renderNotification(n) {
  const p = n.payload || {};
  const who = p.display || "Someone";
  let subject;
  let lines;
  if (n.event === "in") {
    subject = `${who} clocked in at ${fmtTime(p.at)}`;
    lines = [subject];
  } else if (n.event === "out") {
    subject = `${who} clocked out at ${fmtTime(p.end)}`;
    lines = [subject, `${fmtHours(p.duration_ms)} hrs (started ${fmtTime(p.start)})`];
  } else if (n.event === "auto_close") {
    subject = `${who}'s shift was closed automatically after 12 hours`;
    lines = [
      `${who} clocked in ${fmtDay(p.start)} at ${fmtTime(p.start)} and never clocked out.`,
      `The shift was closed at the 12-hour cap (${fmtTime(p.end)}) and marked NEEDS REVIEW.`,
      "Payroll will stop on it until the real end time is confirmed.",
    ];
  } else if (n.event === "correction") {
    subject = `${who} corrected an auto-closed shift`;
    lines = [
      `Shift on ${fmtDay(p.start)}: end time changed from ${fmtTime(p.old_end)} to ${fmtTime(p.new_end)}.`,
      `${fmtHours(p.duration_ms)} hrs. Changed by ${p.actor || who}.`,
    ];
  } else {
    subject = `${who}: clock event (${n.event})`;
    lines = [subject];
  }
  const body = lines.map((l) => `<p style="margin:0 0 8px;">${escapeHtml(l)}</p>`).join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#333;">${body}${CORTANA_SIGNATURE_HTML}</div>`;
  return { subject, html };
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Deliver pending outbox rows. Returns counts. Never throws for a single bad
 * email; the row keeps its error and is retried on the next sweep.
 * Sending is OFF unless CLOCK_EMAIL_ENABLED=1 (the Studio watcher still owns
 * the emails until cutover, and two senders would double every email).
 */
export async function drainOutbox(limit = 20) {
  if (process.env.CLOCK_EMAIL_ENABLED !== "1") return { sent: 0, failed: 0, skipped: "disabled" };
  const rows = await db.rpc("clock_claim_notifications", { p_limit: limit });
  if (!rows?.length) return { sent: 0, failed: 0 };
  let token;
  let sent = 0;
  let failed = 0;
  for (const n of rows) {
    try {
      token = token || (await accessToken());
      const { subject, html } = renderNotification(n);
      await sendEmail(token, subject, html);
      sent += 1;
      // Gmail has no "send once" key, so the stamp is what stops a re-send.
      // Try hard to record it; if it still fails the worst case is a duplicate
      // notification email, never a lost one.
      for (let i = 0; i < 3; i++) {
        try {
          await db.patch(`clock_notifications?id=eq.${enc(n.id)}`, { sent_at: new Date().toISOString(), last_error: null });
          break;
        } catch (e) {
          if (i === 2) throw e;
          await new Promise((r) => setTimeout(r, 400 * (i + 1)));
        }
      }
    } catch (err) {
      if (!String(err.message || "").startsWith("supabase")) failed += 1;
      await db
        .patch(`clock_notifications?id=eq.${enc(n.id)}`, { last_error: String(err.message || err).slice(0, 500) })
        .catch(() => {});
    }
  }
  return { sent, failed };
}
