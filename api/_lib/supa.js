// Service-role access to the tracker tables (same Supabase project as the
// Command Center). Server-side only: this key never leaves Vercel.
const URL_BASE = process.env.SUPABASE_URL || "https://gdyfcqpbbehozyyjrnah.supabase.co";

function key() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return k;
}

async function call(path, { method = "GET", body, prefer } = {}) {
  const headers = {
    apikey: key(),
    Authorization: `Bearer ${key()}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { msg = JSON.parse(text).message || msg; } catch { /* keep raw */ }
    const err = new Error(res.status < 500 ? msg : `supabase ${method} ${path.split("?")[0]} -> ${res.status}: ${msg}`);
    // Database rule violations (bad input, overlap, not yours) come back as 4xx
    // and are shown to the person; anything else stays a 500.
    if (res.status >= 400 && res.status < 500) err.status = res.status === 409 ? 409 : res.status === 403 ? 403 : 400;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

/** Reads every row, 1000 at a time (the server caps a single read at 1000). */
async function getAll(path) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await call(`${path}${path.includes("?") ? "&" : "?"}limit=1000&offset=${offset}`);
    out.push(...(page || []));
    if (!page || page.length < 1000) return out;
  }
}

export const db = {
  get: (path) => call(path),
  getAll,
  insert: (table, row) => call(table, { method: "POST", body: row, prefer: "return=representation" }),
  patch: (path, row) => call(path, { method: "PATCH", body: row, prefer: "return=representation" }),
  rpc: (fn, args) => call(`rpc/${fn}`, { method: "POST", body: args }),
  del: (path) => call(path, { method: "DELETE", prefer: "return=representation" }),
};

export const enc = encodeURIComponent;
