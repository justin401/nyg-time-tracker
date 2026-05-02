import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { HeatMap, TrendChart, ComparisonCards, EarningsForecast, LiveBadge, EarningsTracker } from "./components/DashboardWidgets";
import { SearchBar, DateRangeFilter, exportCSV, BulkEditBar, detectDuplicates, BudgetTracker, DarkModeToggle } from "./components/AdminTools";
import { InvoiceHistory, PaymentStatusBadge } from "./components/InvoiceWidgets";
import AdminPanel from "./components/AdminPanel";
import { loadWorkerConfigs, getEntryRate, calcWorkerPay } from "./lib/workerPay";

// Default theme (dark navy)
const C_DEFAULT = {
  bg: "#0B1219", bg2: "#111D2B", card: "#15202E", card2: "#1A2836",
  accent: "#29ABE2", glow: "0 0 20px rgba(41,171,226,0.3), 0 0 40px rgba(41,171,226,0.1)",
  glowSm: "0 0 10px rgba(41,171,226,0.2)",
  green: "#00E676", greenGlow: "0 0 15px rgba(0,230,118,0.3)",
  red: "#FF5252", redGlow: "0 0 15px rgba(255,82,82,0.3)",
  white: "#E8F0FE", dim: "#7B8FA3", border: "#1E3148",
  input: "#0D1520", orange: "#FFB74D",
  catTravel: "#BB86FC", catOnSite: "#00E676", catCoord: "#29ABE2",
  catAdmin: "#FFB74D", catVideo: "#FF80AB",
};
// Chloe's theme (pink & purple -- high contrast text on dark bg)
const C_CHLOE = {
  bg: "#1A0E1F", bg2: "#1F1228", card: "#2A1640", card2: "#321D4A",
  accent: "#F0A0C8", glow: "0 0 20px rgba(240,160,200,0.3), 0 0 40px rgba(187,134,252,0.15)",
  glowSm: "0 0 10px rgba(240,160,200,0.25)",
  green: "#F0A0C8", greenGlow: "0 0 15px rgba(240,160,200,0.3)",
  red: "#FF80AB", redGlow: "0 0 15px rgba(255,128,171,0.3)",
  white: "#FFF0F5", dim: "#D4A0D4", border: "#4A2866",
  input: "#1E0E2A", orange: "#E8B4E8",
  catTravel: "#CE9FFC", catOnSite: "#F0A0C8", catCoord: "#B8A0F0",
  catAdmin: "#E8B4E8", catVideo: "#FF99CC",
};
// Theme will be set dynamically based on user - use C_DEFAULT as initial
let C = C_DEFAULT;
const CATS = ["Travel", "On-Site", "Coordination", "Admin", "Video Updates", "Virtual Assistance"];
const getCatColor = () => ({ Travel: C.catTravel, "On-Site": C.catOnSite, Coordination: C.catCoord, Admin: C.catAdmin, "Video Updates": C.catVideo, "Virtual Assistance": "#4FC3F7" });
let catColor = getCatColor();
const GET_RATE = 0.04712;

// ── QUICK-FILL TEMPLATES (Chloe) ──
const TEMPLATES = [
  { label: "Asana Audit", desc: "Reviewed and updated Asana project tasks, checked dependencies, and organized workflows for the team." },
  { label: "Document Filing", desc: "Organized and filed client documents, contracts, and transaction records into proper folders and systems." },
  { label: "Video Editing", desc: "Edited and produced video content for marketing, client updates, or social media distribution." },
  { label: "Email Management", desc: "Processed incoming emails, drafted responses, and organized correspondence for team members and clients." },
  { label: "Data Entry", desc: "Entered data into spreadsheets, databases, and client management systems with verification and cleanup." },
  { label: "Social Media", desc: "Created and scheduled social media content, drafted captions, and managed posting across platforms." },
  { label: "Calendar Mgmt", desc: "Managed team calendar, scheduled client meetings, set reminders, and coordinated availability." },
  { label: "Client Follow-up", desc: "Coordinated follow-up calls and messages with clients, tracked responses, and updated CRM records." },
  { label: "Transaction Coord", desc: "Managed transaction timelines, coordinated between parties, and tracked critical deadlines and documents." },
  { label: "Marketing", desc: "Prepared marketing assets, brochures, and promotional content for listings and team campaigns." },
  { label: "Task Organization", desc: "Audited task lists, prioritized action items, and created workflows for team efficiency." },
  { label: "Admin Support", desc: "Handled general administrative work including scheduling, correspondence, and systems management." },
];

// ── MOTIVATIONAL QUOTES (Chloe clock-in) ──
const QUOTES = [
  "You're capable of amazing things.",
  "Progress over perfection, always.",
  "Your hustle is your superpower.",
  "Done is better than perfect.",
  "Keep going, you're closer than you think.",
  "Excellence is a habit, not an act.",
  "You've got this, Chloe. \uD83D\uDCAA",
  "Small wins compound into big victories.",
  "Stay focused. The rest is noise.",
  "Your future self will thank you.",
  "Consistency beats intensity every time.",
  "Make it happen. \uD83D\uDE80",
  "You're stronger than you think.",
  "Detail-oriented people change the world.",
  "Organize, execute, dominate.",
  "Every task done is a win.",
  "Pressure creates diamonds.",
  "Keep your head down and keep moving.",
  "Organized chaos is still organized.",
  "Your work ethic speaks volumes.",
  "Be the person who gets things done.",
  "Momentum builds success. Keep moving.",
  "You're writing your own story.",
  "Admin work? More like orchestrating success. \u2728",
  "One task at a time. One day at a time.",
  "Your dedication is your competitive edge.",
  "Make today count.",
  "Hustle in silence, let results make the noise.",
];

// ── CONFETTI ──
function fireConfetti() {
  const canvas = document.createElement('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  Object.assign(canvas.style, { position: 'fixed', top: '0', left: '0', pointerEvents: 'none', zIndex: '9999' });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const particles = [];
  const colors = ['#ff6eb4', '#c084fc', '#fbbf24', '#34d399', '#60a5fa'];
  const startTime = Date.now(), duration = 2000;
  function createParticle() {
    const angle = (Math.random() - 0.5) * Math.PI, velocity = 8 + Math.random() * 12;
    return { x: canvas.width / 2, y: canvas.height, vx: Math.cos(angle) * velocity, vy: -Math.sin(angle) * velocity - 5, color: colors[Math.floor(Math.random() * colors.length)], size: 4 + Math.random() * 6, rotation: Math.random() * Math.PI * 2, rv: (Math.random() - 0.5) * 0.2 };
  }
  function animate() {
    const elapsed = Date.now() - startTime;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (elapsed < duration && particles.length < 150) { if (Math.random() < 0.6) particles.push(createParticle()); }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.vy += 0.2; p.x += p.vx; p.y += p.vy; p.rotation += p.rv;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rotation); ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore();
      if (p.y > canvas.height) particles.splice(i, 1);
    }
    if (elapsed < duration || particles.length > 0) requestAnimationFrame(animate);
    else document.body.removeChild(canvas);
  }
  animate();
}

const fm = {
  live(ms) { const t = Math.floor(ms / 1000); return [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60].map(v => String(v).padStart(2, "0")).join(":"); },
  hrs(ms) { return (Math.ceil(ms / 60000) / 60).toFixed(2); },
  money(n) { return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","); },
  date(d) { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); },
  time(d) { return new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }); },
  wkStart(d) { const dt = new Date(d), day = dt.getDay(); dt.setDate(dt.getDate() - day + (day === 0 ? -6 : 1)); dt.setHours(0, 0, 0, 0); return dt.toISOString(); },
};

const Btn = ({ children, bg, glow, onClick, disabled, style }) => (
  <button onClick={onClick} disabled={disabled} style={{ padding: "10px 20px", background: bg || C.accent, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: disabled ? "default" : "pointer", boxShadow: glow || "none", opacity: disabled ? 0.5 : 1, transition: "all 0.2s", ...style }}>{children}</button>
);
const Inp = ({ value, onChange, type, style, ...p }) => (
  <input type={type || "text"} value={value} onChange={onChange} {...p} style={{ width: "100%", padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, background: C.input, color: C.white, fontSize: 14, boxSizing: "border-box", outline: "none", ...style }} />
);
const Sel = ({ value, onChange, children, style }) => (
  <select value={value} onChange={onChange} style={{ width: "100%", padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, background: C.input, color: C.white, fontSize: 14, boxSizing: "border-box", ...style }}>{children}</select>
);
const Lbl = ({ children }) => <div style={{ fontSize: 11, fontWeight: 600, color: C.dim, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{children}</div>;
const Card = ({ children, glow, style }) => <div style={{ background: C.card, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, boxShadow: glow || "none", ...style }}>{children}</div>;
const Badge = ({ cat }) => <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: `${catColor[cat]}22`, color: catColor[cat] }}>{cat}</span>;

export default function TimeTracker({ session, onLogout }) {
  const [projects, setProjects] = useState([]);
  const [entries, setEntries] = useState([]);
  const [clocking, setClocking] = useState(null);
  const [activePrj, _setActivePrj] = useState(null);
  const setActivePrj = (id) => { _setActivePrj(id); if (id) sessionStorage.setItem("nyg_active_project", id); };
  const [elapsed, setElapsed] = useState(0);
  const [view, setView] = useState("dashboard");
  const [panel, setPanel] = useState(null);
  const [form, setForm] = useState({});
  const [polishing, setPolishing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState({ text: "Loading...", color: C.orange });
  const [showArchived, setShowArchived] = useState(false);
  const [reportFilter, setReportFilter] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [streak, setStreak] = useState(0);
  const [quote, setQuote] = useState("");
  const [shiftSummary, setShiftSummary] = useState(null);
  const [searchFiltered, setSearchFiltered] = useState(null);
  const [dateFilter, setDateFilter] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [invoices, setInvoices] = useState([]);
  const [workerConfigs, setWorkerConfigs] = useState({});
  const timerRef = useRef(null);
  const clockRef = useRef(null);

  const userName = session.user.user_metadata?.name || session.user.email;
  const userEmail = session.user.email || "";
  const isChloe = userName?.includes("Chloe") || userEmail.includes("chloe@");
  const isDesmond = userName?.includes("Desmond") || userName?.includes("Dez") || userEmail.includes("dez@");
  const isAgentCare = isChloe || isDesmond;
  const isAdmin = userName?.includes("Justin") || userName?.includes("justin");
  const CHLOE_PROJECT_ID = "12f5605f-b0a5-46c9-9cbd-34956d8016a8";
  const DESMOND_PROJECT_ID = "b134954f-16ca-4a0e-86ff-63210acb0895";
  const agentCareProjectId = isChloe ? CHLOE_PROJECT_ID : isDesmond ? DESMOND_PROJECT_ID : null;
  // Set theme based on user
  C = isChloe ? C_CHLOE : C_DEFAULT;
  catColor = getCatColor();

  // Back-compat shim: existing call sites use getChloeRate(location, date).
  // Routes through the engine using Chloe's worker_config.
  const getChloeRate = (location, entryDate) => getEntryRate(
    { worker: "Chloe Mello", work_location: location || "office", start_time: entryDate },
    workerConfigs,
    {}
  );

  const showStatus = (text, color) => {
    setStatus({ text, color });
    setTimeout(() => setStatus({ text: "", color: "" }), 4000);
  };

  // ── LOAD DATA ──
  useEffect(() => {
    (async () => {
      try {
        const [{ data: prjs }, { data: ents }, { data: clk }, configs] = await Promise.all([
          supabase.from("projects").select("*").order("created_at"),
          supabase.from("time_entries").select("*").order("start_time"),
          supabase.from("clock_status").select("*").eq("user_id", session.user.id).limit(1),
          loadWorkerConfigs(supabase, { force: true }),
        ]);
        setProjects(prjs || []);
        setEntries(ents || []);
        setWorkerConfigs(configs || {});
        if (clk && clk.length > 0) {
          setClocking(clk[0]);
          clockRef.current = clk[0];
        }
        if (prjs && prjs.length > 0) {
          const saved = sessionStorage.getItem("nyg_active_project");
          const savedValid = saved && prjs.some(p => p.id === saved);
          setActivePrj(agentCareProjectId || (savedValid ? saved : prjs[0].id));
        }
        showStatus(`Loaded ${(prjs || []).length} projects, ${(ents || []).length} entries`, C.green);
      } catch (e) {
        showStatus("Load failed: " + e.message, C.red);
      }
      setLoaded(true);
    })();
  }, [session]);

  // ── STREAK CALCULATION (Chloe) ──
  useEffect(() => {
    if (!isChloe || entries.length === 0) return;
    const chloeEntries = entries.filter(e => e.worker === "Chloe Mello");
    if (chloeEntries.length === 0) return;
    const days = new Set(chloeEntries.map(e => new Date(e.start_time).toISOString().split("T")[0]));
    let count = 0;
    const d = new Date(); d.setHours(0, 0, 0, 0);
    // Check today first, then go backwards
    if (!days.has(d.toISOString().split("T")[0])) d.setDate(d.getDate() - 1);
    while (days.has(d.toISOString().split("T")[0])) { count++; d.setDate(d.getDate() - 1); }
    setStreak(count);
  }, [entries, isChloe]);

  // ── TIMER ──
  useEffect(() => {
    if (clocking) {
      timerRef.current = setInterval(() => setElapsed(Date.now() - new Date(clockRef.current?.start_time).getTime()), 1000);
    } else { setElapsed(0); }
    return () => clearInterval(timerRef.current);
  }, [clocking]);

  // ── DERIVED ──
  const visibleProjects = showArchived ? projects : projects.filter(p => !p.archived);
  const proj = projects.find(p => p.id === activePrj) || projects[0];
  // Agent-care workers see only their own entries; admins see all.
  const pe = entries.filter(e => e.project_id === activePrj && (
    !isAgentCare ||
    (isChloe && e.worker === "Chloe Mello") ||
    (isDesmond && e.worker === "Desmond Mello")
  ));
  const projectRates = { j_rate: proj?.j_rate, s_rate: proj?.s_rate };
  const getRate = (w, e) => getEntryRate({ worker: w, ...(e || {}) }, workerConfigs, projectRates);
  const jMs = pe.filter(e => e.worker === "Justin K. Taparra").reduce((s, e) => s + e.duration_ms, 0);
  const sMs = pe.filter(e => e.worker === "Sam Palompo").reduce((s, e) => s + e.duration_ms, 0);
  const cMs = pe.filter(e => e.worker === "Chloe Mello").reduce((s, e) => s + e.duration_ms, 0);
  const dMs = pe.filter(e => e.worker === "Desmond Mello").reduce((s, e) => s + e.duration_ms, 0);
  const totMs = jMs + sMs + cMs + dMs;
  const jAmt = (Math.ceil(jMs / 60000) / 60) * (proj?.j_rate || 75);
  const sAmt = (Math.ceil(sMs / 60000) / 60) * (proj?.s_rate || 60);
  // Agent-care pay routes through the engine: Chloe = tiered_location, Desmond = weekly_ot.
  const cAmt = calcWorkerPay("Chloe Mello", pe, workerConfigs, { projectRates }).totalPay;
  const dAmt = calcWorkerPay("Desmond Mello", pe, workerConfigs, { projectRates }).totalPay;
  const sub = jAmt + sAmt + cAmt + dAmt, getTax = sub * GET_RATE, total = sub + getTax;
  const catData = CATS.map(c => ({ c, ms: pe.filter(e => e.category === c).reduce((s, e) => s + e.duration_ms, 0) })).filter(x => x.ms > 0);
  const catMax = catData.length ? Math.max(...catData.map(x => x.ms)) : 1;

  // ── REPORT FILTERING ──
  const getFilteredEntries = (entries) => {
    if (reportFilter === "all") return entries;
    const now = new Date();
    let start, end;
    if (reportFilter === "this-week") {
      start = new Date(fm.wkStart(now));
    } else if (reportFilter === "last-week") {
      const ws = new Date(fm.wkStart(now));
      start = new Date(ws); start.setDate(start.getDate() - 7);
      end = new Date(ws); end.setMilliseconds(-1);
    } else if (reportFilter === "this-month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (reportFilter === "last-month") {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    } else if (reportFilter === "last-30") {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (reportFilter === "last-year") {
      start = new Date(now.getFullYear() - 1, 0, 1);
      end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
    } else if (reportFilter === "ytd") {
      start = new Date(now.getFullYear(), 0, 1);
    } else if (reportFilter === "custom") {
      if (customFrom) start = new Date(customFrom + "T00:00:00");
      if (customTo) end = new Date(customTo + "T23:59:59");
      if (!start && !end) return entries;
    }
    return entries.filter(e => {
      const d = new Date(e.start_time);
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  };

  // ── ACTIONS ──
  const clockIn = async () => {
    const row = { user_id: session.user.id, project_id: activePrj, start_time: new Date().toISOString() };
    const { data, error } = await supabase.from("clock_status").insert(row).select().single();
    if (error) return showStatus("Clock in failed: " + error.message, C.red);
    setClocking(data);
    clockRef.current = data;
    if (navigator.vibrate) navigator.vibrate(100);
    if (isChloe) {
      setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
      showStatus("\uD83C\uDF1F Clocked in! Let's gooo \uD83D\uDCAA", C.green);
    } else {
      showStatus("Clocked in!", C.green);
    }
    // iMessage notifications handled by chloe_clock_watcher.py (polls Supabase)
  };

  const openClockOut = () => { setForm({ cat: "Admin", desc: "", worker: isChloe ? "Chloe Mello" : isDesmond ? "Desmond Mello" : userName, location: isChloe ? "" : null }); setPanel("clockOut"); };

  const saveClockOut = async () => {
    if (!isAgentCare && !form.desc.trim()) return;
    if (isChloe && !form.location) return showStatus("Please select Office or Home 💜", C.orange);
    const end = new Date().toISOString();
    const dur = new Date(end).getTime() - new Date(clocking.start_time).getTime();
    const entry = { project_id: clocking.project_id, worker: form.worker, category: form.cat, description: form.desc, start_time: clocking.start_time, end_time: end, duration_ms: dur, created_by: session.user.id, ...(form.location ? { work_location: form.location } : {}) };
    const { data, error } = await supabase.from("time_entries").insert(entry).select().single();
    if (error) return showStatus("Save failed: " + error.message, C.red);
    await supabase.from("clock_status").delete().eq("id", clocking.id);
    setEntries([...entries, data]);
    setClocking(null);
    clockRef.current = null;
    setPanel(null);
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    fireConfetti();
    const hrs = parseFloat(fm.hrs(dur));
    const rate = getRate(form.worker, { work_location: form.location, start_time: end });
    setShiftSummary({ hrs, earned: hrs * rate, location: form.location, worker: form.worker });
    setTimeout(() => setShiftSummary(null), 8000);
    const loc = form.location === "office" ? "the office" : "home";
    showStatus(isChloe ? `\uD83C\uDF89 Clocked out from ${loc}! Great work babe \uD83D\uDC85` : "Clocked out and saved!", C.green);
    setQuote("");
    // iMessage notifications handled by chloe_clock_watcher.py (polls Supabase)
  };

  const openManual = () => { setForm({ date: new Date().toISOString().split("T")[0], st: "09:00", et: "10:00", cat: "Admin", desc: "", worker: isChloe ? "Chloe Mello" : isDesmond ? "Desmond Mello" : userName, location: isChloe ? "" : null }); setPanel("manual"); };

  const saveManual = async () => {
    if (!isAgentCare && !form.desc.trim()) return;
    if (isChloe && !form.location) return showStatus("Please select Office or Home 💜", C.orange);
    const start = new Date(`${form.date}T${form.st}`), end = new Date(`${form.date}T${form.et}`);
    const dur = end.getTime() - start.getTime();
    if (dur <= 0) return alert("End time must be after start time");
    const entry = { project_id: activePrj, worker: form.worker, category: form.cat, description: form.desc, start_time: start.toISOString(), end_time: end.toISOString(), duration_ms: dur, created_by: session.user.id, ...(form.location ? { work_location: form.location } : {}) };
    const { data, error } = await supabase.from("time_entries").insert(entry).select().single();
    if (error) return showStatus("Save failed: " + error.message, C.red);
    setEntries([...entries, data]);
    setPanel(null);
    showStatus(isChloe ? "\u2728 Entry saved! You're crushing it \uD83D\uDC96" : "Entry saved!", C.green);
  };

  const openEdit = (e) => {
    const s = new Date(e.start_time), en = new Date(e.end_time);
    setForm({ id: e.id, date: s.toISOString().split("T")[0], st: `${String(s.getHours()).padStart(2, "0")}:${String(s.getMinutes()).padStart(2, "0")}`, et: `${String(en.getHours()).padStart(2, "0")}:${String(en.getMinutes()).padStart(2, "0")}`, cat: e.category, desc: e.description, worker: e.worker, location: e.work_location || (e.worker === "Chloe Mello" ? "" : null) });
    setPanel("edit");
  };

  const saveEdit = async () => {
    const isAgentCareWorker = form.worker === "Chloe Mello" || form.worker === "Desmond Mello";
    if (!isAgentCareWorker && !form.desc.trim()) return;
    if ((isChloe || form.worker === "Chloe Mello") && !form.location) return showStatus("Please select Office or Home", C.orange);
    const start = new Date(`${form.date}T${form.st}`), end = new Date(`${form.date}T${form.et}`);
    const dur = end.getTime() - start.getTime();
    if (dur <= 0) return alert("End time must be after start time");
    const updates = { worker: form.worker, category: form.cat, description: form.desc, start_time: start.toISOString(), end_time: end.toISOString(), duration_ms: dur, ...(form.location ? { work_location: form.location } : {}) };
    const { error } = await supabase.from("time_entries").update(updates).eq("id", form.id);
    if (error) return showStatus("Update failed: " + error.message, C.red);
    setEntries(entries.map(e => e.id === form.id ? { ...e, ...updates } : e));
    setPanel(null);
    showStatus(isChloe ? "\uD83D\uDC9C Entry updated! \u2728" : "Entry updated!", C.green);
  };

  const delEntry = async (id) => {
    const { error } = await supabase.from("time_entries").delete().eq("id", id);
    if (error) return showStatus("Delete failed: " + error.message, C.red);
    setEntries(entries.filter(e => e.id !== id));
    showStatus("Entry deleted", C.green);
  };

  const openAddPrj = () => { setForm({ name: "", jRate: "75", sRate: "60", cRate: "27" }); setPanel("addPrj"); };

  const saveProject = async () => {
    if (!form.name.trim()) return;
    const row = { name: form.name, j_rate: parseFloat(form.jRate) || 75, s_rate: parseFloat(form.sRate) || 60, c_rate: parseFloat(form.cRate) || 27, created_by: session.user.id };
    const { data, error } = await supabase.from("projects").insert(row).select().single();
    if (error) return showStatus("Save failed: " + error.message, C.red);
    setProjects([...projects, data]);
    setActivePrj(data.id);
    setPanel(null);
    showStatus("Project added!", C.green);
  };

  const openEditPrj = () => {
    if (!proj) return;
    setForm({ name: proj.name, jRate: String(proj.j_rate || 75), sRate: String(proj.s_rate || 60), cRate: String(proj.c_rate || 27) });
    setPanel("editPrj");
  };

  const saveEditPrj = async () => {
    if (!form.name.trim()) return;
    const updates = { name: form.name, j_rate: parseFloat(form.jRate) || 75, s_rate: parseFloat(form.sRate) || 60, c_rate: parseFloat(form.cRate) || 27 };
    const { error } = await supabase.from("projects").update(updates).eq("id", activePrj);
    if (error) return showStatus("Update failed: " + error.message, C.red);
    setProjects(projects.map(p => p.id === activePrj ? { ...p, ...updates } : p));
    setPanel(null);
    showStatus("Project updated!", C.green);
  };

  const toggleArchive = async (id, archived) => {
    const { error } = await supabase.from("projects").update({ archived: !archived }).eq("id", id);
    if (error) return showStatus("Update failed: " + error.message, C.red);
    setProjects(projects.map(p => p.id === id ? { ...p, archived: !archived } : p));
    showStatus(archived ? "Project restored!" : "Project archived!", C.green);
  };

  const deleteProject = async (id) => {
    if (!confirm("Delete this project and ALL its time entries? This cannot be undone.")) return;
    const { error: entryErr } = await supabase.from("time_entries").delete().eq("project_id", id);
    if (entryErr) return showStatus("Failed to delete entries: " + entryErr.message, C.red);
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) return showStatus("Delete failed: " + error.message, C.red);
    const remaining = projects.filter(p => p.id !== id);
    setProjects(remaining);
    setEntries(entries.filter(e => e.project_id !== id));
    if (activePrj === id) setActivePrj(remaining[0]?.id || null);
    showStatus("Project deleted!", C.green);
  };

  // ── EXPORT / IMPORT ──
  const exportData = () => {
    const json = JSON.stringify({ projects, entries }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "nyg-time-tracker-backup.json"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── POLISH ──
  const polish = async () => {
    if (!form.desc.trim()) return;
    setPolishing(true);
    try {
      const r = await fetch("/api/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: form.desc }),
      });
      const d = await r.json();
      if (d.polished) setForm(prev => ({ ...prev, desc: d.polished }));
    } catch (e) { console.log("Polish err:", e); }
    setPolishing(false);
  };

  // ── REPORTS ──
  const filteredPe = getFilteredEntries(pe);
  const wkGroups = {};
  filteredPe.forEach(e => { const w = fm.wkStart(e.start_time); if (!wkGroups[w]) wkGroups[w] = []; wkGroups[w].push(e); });
  const sortedWks = Object.keys(wkGroups).sort().reverse();

  const copyWeek = (wk) => {
    const es = wkGroups[wk].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    const workerTotals = {};
    es.forEach(e => {
      if (!workerTotals[e.worker]) workerTotals[e.worker] = { ms: 0, pay: 0 };
      workerTotals[e.worker].ms += e.duration_ms;
      workerTotals[e.worker].pay += (Math.ceil(e.duration_ms / 60000) / 60) * getRate(e.worker, e);
    });
    const wS = Object.values(workerTotals).reduce((s, w) => s + w.pay, 0);
    const wG = wS * GET_RATE, wT = wS + wG;
    let t = `NYG LLC - Weekly Report\nProject: ${proj.name}\nWeek of: ${fm.date(wk)}\n\nDate | Worker | Hours | Rate | Location | Category | Description\n-----|--------|-------|------|----------|----------|------------\n`;
    es.forEach(e => { t += `${fm.date(e.start_time)} | ${e.worker} | ${fm.hrs(e.duration_ms)} | $${getRate(e.worker, e)}/hr | ${e.work_location || "-"} | ${e.category} | ${e.description}\n`; });
    Object.entries(workerTotals).forEach(([worker, data]) => {
      t += `\n${worker}: ${(Math.ceil(data.ms / 60000) / 60).toFixed(2)} hrs = ${fm.money(data.pay)}`;
    });
    t += `\nSubtotal: ${fm.money(wS)}\nGET (4.712%): ${fm.money(wG)}\nTotal: ${fm.money(wT)}`;
    navigator.clipboard.writeText(t).then(() => alert("Copied to clipboard!"));
  };

  const downloadWeekPDF = (wk) => {
    const es = wkGroups[wk].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    // Dynamic worker summary -- only workers who actually have entries
    const workerTotals = {};
    es.forEach(e => {
      if (!workerTotals[e.worker]) workerTotals[e.worker] = { ms: 0, pay: 0 };
      workerTotals[e.worker].ms += e.duration_ms;
      const hrs = Math.ceil(e.duration_ms / 60000) / 60;
      workerTotals[e.worker].pay += hrs * getRate(e.worker, e);
    });
    const wS = Object.values(workerTotals).reduce((s, w) => s + w.pay, 0);
    const wG = wS * GET_RATE, wT = wS + wG;
    const workerCount = Object.keys(workerTotals).length;

    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(11, 18, 25);
    doc.rect(0, 0, pageW, 40, "F");
    doc.setTextColor(232, 240, 254);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("NYG LLC", 20, 22);
    doc.setFontSize(8);
    doc.setTextColor(41, 171, 226);
    doc.text("SERVICED AT THE HIGHEST LEVEL", 20, 30);

    // Report info
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("WEEKLY REPORT", pageW - 20, 16, { align: "right" });
    doc.setFontSize(9);
    doc.text(`Week of: ${fm.date(wk)}`, pageW - 20, 23, { align: "right" });
    doc.text(`Generated: ${fm.date(new Date())}`, pageW - 20, 29, { align: "right" });

    // Project name
    doc.setTextColor(41, 171, 226);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(proj.name, 20, 52);

    // Table (two rows per entry: data + full description)
    const tableBody = [];
    es.forEach((e, i) => {
      const rowBg = i % 2 === 0 ? [255, 255, 255] : [245, 247, 250];
      tableBody.push([
        { content: fm.date(e.start_time), styles: { fillColor: rowBg } },
        { content: e.worker.split(" ")[0], styles: { fillColor: rowBg } },
        { content: fm.hrs(e.duration_ms), styles: { fillColor: rowBg, halign: "right", fontStyle: "bold" } },
        { content: fm.money(getRate(e.worker, e)) + "/hr", styles: { fillColor: rowBg } },
        { content: e.work_location ? (e.work_location === "office" ? "Office" : "Home") : "-", styles: { fillColor: rowBg } },
        { content: e.category, styles: { fillColor: rowBg } },
        { content: fm.money(parseFloat(fm.hrs(e.duration_ms)) * getRate(e.worker, e)), styles: { fillColor: rowBg, halign: "right", fontStyle: "bold" } },
      ]);
      tableBody.push([
        { content: e.description || "(no description)", colSpan: 7, styles: { fillColor: rowBg, fontSize: 7, textColor: [100, 100, 100], fontStyle: "italic", cellPadding: { top: 1, bottom: 4, left: 8, right: 8 } } },
      ]);
    });

    autoTable(doc, {
      startY: 58,
      head: [["Date", "Worker", "Hours", "Rate", "Location", "Category", "Amount"]],
      body: tableBody,
      theme: "grid",
      headStyles: { fillColor: [21, 32, 46], textColor: [232, 240, 254], fontSize: 8, fontStyle: "bold", halign: "center" },
      bodyStyles: { fontSize: 8, textColor: [60, 60, 60], halign: "center" },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 20 },
        2: { cellWidth: 16 },
        3: { cellWidth: 22 },
        4: { cellWidth: 18 },
        5: { cellWidth: 24 },
        6: { cellWidth: 24 },
      },
      margin: { left: 16, right: 16 },
    });

    let finalY = doc.lastAutoTable.finalY + 10;

    // Check if summary fits on current page
    const summaryHeight = 30 + workerCount * 10;
    if (finalY > doc.internal.pageSize.getHeight() - summaryHeight - 20) {
      doc.addPage();
      finalY = 20;
    }

    // Summary box
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(20, finalY, pageW - 40, summaryHeight, 3, 3, "F");
    doc.setDrawColor(41, 171, 226);
    doc.setLineWidth(0.5);
    doc.line(20, finalY, pageW - 20, finalY);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);

    const col1 = 30, col2 = pageW - 30;
    let y = finalY + 12;

    // Dynamic worker lines -- only workers with entries
    Object.entries(workerTotals).forEach(([worker, data]) => {
      const hrs = (Math.ceil(data.ms / 60000) / 60).toFixed(2);
      doc.text(`${worker}: ${hrs} hrs`, col1, y);
      doc.setFont("helvetica", "bold");
      doc.text(fm.money(data.pay), col2, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      y += 8;
    });

    if (workerCount > 1) {
      doc.setDrawColor(200, 200, 200);
      doc.line(col1, y - 3, col2, y - 3);
    }

    doc.text("Subtotal:", col1, y);
    doc.text(fm.money(wS), col2, y, { align: "right" });
    y += 8;
    doc.text("GET (4.712%):", col1, y);
    doc.text(fm.money(wG), col2, y, { align: "right" });
    y += 10;

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 150, 76);
    doc.text("TOTAL:", col1, y);
    doc.text(fm.money(wT), col2, y, { align: "right" });

    // Footer
    const footerY = doc.internal.pageSize.getHeight() - 15;
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "normal");
    doc.text("NYG LLC | Serviced at the Highest Level", pageW / 2, footerY, { align: "center" });

    doc.save(`NYG-Report-${fm.date(wk).replace(/[^a-zA-Z0-9]/g, "-")}.pdf`);
  };

  // ── KEYBOARD SHORTCUTS (must be after action functions) ──
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "i") { e.preventDefault(); if (!clocking && activePrj) clockIn(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "o") { e.preventDefault(); if (clocking) openClockOut(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "m") { e.preventDefault(); if (!clocking) openManual(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [clocking, activePrj]);

  const dezCfg = workerConfigs["Desmond Mello"];
  // Resolve Chloe's currently-active sub-config (new structure is `history`-wrapped).
  const chloeWrapper = workerConfigs["Chloe Mello"];
  const chloeActiveCfg = chloeWrapper?.type === "history"
    ? (chloeWrapper.configs || []).slice().reverse().find(c => !c.effective_to || new Date(c.effective_to) >= new Date()) || (chloeWrapper.configs || []).slice(-1)[0]
    : chloeWrapper;
  const chloeIsFlat = chloeActiveCfg?.type === "tiered_weekly_ot";
  const chloeStraightRate = chloeActiveCfg?.rates?.before?.straight ?? chloeActiveCfg?.rates?.before ?? 28;
  const WorkerSel = ({ value, onChange }) => (
    <Sel value={value} onChange={onChange}>
      <option value="Justin K. Taparra">Justin K. Taparra ({fm.money(proj?.j_rate || 75)}/hr)</option>
      <option value="Sam Palompo">Sam Palompo ({fm.money(proj?.s_rate || 60)}/hr)</option>
      <option value="Chloe Mello">Chloe Mello ({chloeIsFlat ? `${fm.money(chloeStraightRate)}/hr, OT auto` : `${fm.money(getChloeRate("office"))}-${fm.money(getChloeRate("home"))}/hr`})</option>
      <option value="Desmond Mello">Desmond Mello ({fm.money(dezCfg?.straightRate ?? 36)}/hr, OT auto)</option>
    </Sel>
  );

  const showLocationPicker = isChloe || (!isChloe && form.worker === "Chloe Mello");

  const LocationPicker = () => (
    <div style={{ marginBottom: 12 }}>
      <Lbl>{isChloe ? "Where did you work? 💜" : "Work Location (Chloe)"}</Lbl>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button onClick={() => setForm({ ...form, location: "office" })} style={{ padding: "14px 10px", borderRadius: 10, border: form.location === "office" ? `2px solid ${C.accent}` : `2px solid ${C.border}`, background: form.location === "office" ? `${C.accent}22` : C.input, color: form.location === "office" ? C.accent : C.dim, fontWeight: 700, fontSize: 14, cursor: "pointer", transition: "all 0.2s", boxShadow: form.location === "office" ? C.glowSm : "none" }}>
          {isChloe ? "🏢 Office" : "Office"}{!chloeIsFlat && <><br/><span style={{ fontSize: 11, fontWeight: 400 }}>{fm.money(getChloeRate("office", form.date || new Date()))}/hr</span></>}
        </button>
        <button onClick={() => setForm({ ...form, location: "home" })} style={{ padding: "14px 10px", borderRadius: 10, border: form.location === "home" ? `2px solid ${C.accent}` : `2px solid ${C.border}`, background: form.location === "home" ? `${C.accent}22` : C.input, color: form.location === "home" ? C.accent : C.dim, fontWeight: 700, fontSize: 14, cursor: "pointer", transition: "all 0.2s", boxShadow: form.location === "home" ? C.glowSm : "none" }}>
          {isChloe ? "🏠 Home" : "Home"}{!chloeIsFlat && <><br/><span style={{ fontSize: 11, fontWeight: 400 }}>{fm.money(getChloeRate("home", form.date || new Date()))}/hr</span></>}
        </button>
      </div>
    </div>
  );

  const renderEntryForm = (title, showDates, onSave, saveLbl, saveBg, saveGlow) => (
    <Card glow={C.glow} style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.accent, marginBottom: 16 }}>{title}</div>
      {showDates && (
        <div className="form-grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div><Lbl>Date</Lbl><Inp type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
          <div><Lbl>Start</Lbl><Inp type="time" value={form.st} onChange={e => setForm({ ...form, st: e.target.value })} /></div>
          <div><Lbl>End</Lbl><Inp type="time" value={form.et} onChange={e => setForm({ ...form, et: e.target.value })} /></div>
        </div>
      )}
      <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: isAgentCare ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 12 }}>
        {!isAgentCare && <div><Lbl>Worker</Lbl><WorkerSel value={form.worker} onChange={e => setForm({ ...form, worker: e.target.value, location: e.target.value === "Chloe Mello" ? (form.location || "") : null })} /></div>}
        <div><Lbl>Category</Lbl><Sel value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })}>{CATS.map(c => <option key={c}>{c}</option>)}</Sel></div>
      </div>
      {showLocationPicker && <LocationPicker />}
      {isChloe && (
        <div style={{ marginBottom: 12 }}>
          <Lbl>Quick Fill \uD83D\uDE80</Lbl>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {TEMPLATES.map(t => (
              <button key={t.label} onClick={() => setForm(f => ({ ...f, desc: f.desc ? f.desc + " " + t.desc : t.desc }))} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 16, border: `1px solid ${C.border}`, background: C.bg2, color: C.accent, cursor: "pointer", fontWeight: 600, transition: "all 0.15s" }}>{t.label}</button>
            ))}
          </div>
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <Lbl>{isAgentCare ? "Notes (optional)" : "What did you work on? (required)"}</Lbl>
        <textarea value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} placeholder={isAgentCare ? "Anything you want to note (optional)" : "Be detailed. Your client will see this on the invoice."} rows={isAgentCare ? 2 : 4} style={{ width: "100%", padding: 12, borderRadius: 8, border: `1px solid ${C.border}`, background: C.input, color: C.white, fontSize: 14, resize: "vertical", boxSizing: "border-box", outline: "none", fontFamily: "system-ui" }} />
        {!isAgentCare && (
          <div style={{ marginTop: 6 }}>
            <button onClick={polish} disabled={polishing || !form.desc.trim()} style={{ background: "transparent", border: `1px solid ${C.accent}`, color: C.accent, borderRadius: 6, padding: "5px 14px", fontSize: 12, fontWeight: 600, cursor: polishing ? "default" : "pointer", opacity: (polishing || !form.desc.trim()) ? 0.4 : 1 }}>{polishing ? "Polishing..." : "Polish with AI (Opus)"}</button>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn bg={saveBg || C.green} glow={saveGlow || C.greenGlow} onClick={onSave} disabled={!isAgentCare && !form.desc.trim()} style={{ flex: 1, fontSize: 15 }}>{saveLbl || "Save"}</Btn>
        <Btn bg={C.card2} onClick={() => setPanel(null)}>Cancel</Btn>
      </div>
    </Card>
  );

  if (!loaded) return <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.accent, fontFamily: "system-ui" }}>Loading...</div>;

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: C.bg, minHeight: "100vh", color: C.white }}>
      {/* Header */}
      <div className="sticky-header" style={{ background: C.bg2, padding: "18px 24px", borderBottom: `1px solid ${C.border}` }}>
        <div className="header-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1 }}>{isAgentCare ? `Team Taparra${isChloe ? " \u2728" : ""}` : "NYG LLC"}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.accent, letterSpacing: 2.5, textShadow: C.glowSm }}>{isChloe ? "SERVICE AT THE HIGHEST LEVEL \uD83D\uDC96" : "SERVICED AT THE HIGHEST LEVEL"}</div>
          </div>
          <div className="header-controls" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {!isAgentCare && <>
              <Sel value={activePrj || ""} onChange={e => setActivePrj(e.target.value)} style={{ width: "auto", minWidth: 180, fontSize: 13 }}>
                {visibleProjects.map(p => <option key={p.id} value={p.id}>{p.name}{p.archived ? " (archived)" : ""}</option>)}
              </Sel>
              <Btn bg={C.accent} glow={C.glowSm} onClick={openAddPrj} style={{ padding: "10px 14px" }}>+</Btn>
            </>}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 4 }}>
              <span style={{ fontSize: 12, color: C.dim }}>{userName}</span>
              <button onClick={onLogout} style={{ fontSize: 11, color: C.red, background: "none", border: `1px solid ${C.red}44`, borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontWeight: 600 }}>Logout</button>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 6 }}>
          <div>{status.text && <span style={{ fontSize: 11, color: status.color, fontWeight: 600 }}>{status.text}</span>}</div>
          {!isChloe && <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowArchived(!showArchived)} style={{ fontSize: 11, color: C.dim, background: "none", border: `1px solid ${C.border}`, borderRadius: 4, padding: "3px 10px", cursor: "pointer" }}>{showArchived ? "Hide Archived" : "Show Archived"}</button>
            <button onClick={exportData} style={{ fontSize: 11, color: C.accent, background: "none", border: `1px solid ${C.accent}44`, borderRadius: 4, padding: "3px 10px", cursor: "pointer" }}>Export Backup</button>
          </div>}
        </div>
      </div>

      {/* Nav */}
      <div style={{ display: "flex", background: C.bg2, borderBottom: `1px solid ${C.border}`, overflowX: "auto" }}>
        {[...(isChloe ? ["dashboard", "entries", "reports"] : isAdmin ? ["dashboard", "entries", "reports", "invoices", "admin"] : ["dashboard", "entries", "reports", "invoices"])].map(v => (
          <button key={v} onClick={() => setView(v)} style={{ flex: 1, padding: "14px 0", border: "none", background: "transparent", borderBottom: view === v ? `3px solid ${C.accent}` : "3px solid transparent", color: view === v ? C.accent : C.dim, fontWeight: 700, fontSize: 13, cursor: "pointer", textTransform: "uppercase", letterSpacing: 1.5, textShadow: view === v ? `0 0 10px ${C.accent}` : "none" }}>{v}</button>
        ))}
      </div>

      <div style={{ padding: "24px 16px", maxWidth: 820, margin: "0 auto" }}>
        {/* Timer */}
        <Card glow={clocking ? "0 0 25px rgba(255,82,82,0.3)" : C.glowSm} style={{ marginBottom: 24, textAlign: "center", border: `1px solid ${clocking ? C.red + "66" : C.border}`, background: clocking ? `linear-gradient(135deg, ${C.card}, #1A1520)` : C.card }}>
          {/* Shift Summary Card */}
          {shiftSummary && (
            <div style={{ background: `linear-gradient(135deg, ${C.card2}, ${C.card})`, borderRadius: 12, padding: 16, marginBottom: 12, border: `1px solid ${C.accent}44`, textAlign: "center", animation: "fadeIn 0.3s" }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{isChloe ? "\uD83C\uDF89" : "\u2705"}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.accent }}>{isChloe ? "Great shift!" : "Shift complete!"}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.green, margin: "4px 0" }}>{shiftSummary.hrs}h | {fm.money(shiftSummary.earned)}</div>
              {shiftSummary.location && <div style={{ fontSize: 12, color: C.dim }}>{shiftSummary.location === "office" ? "\uD83C\uDFE2 Office" : "\uD83C\uDFE0 Home"}</div>}
            </div>
          )}
          {clocking ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.red, letterSpacing: 2, marginBottom: 6, textShadow: `0 0 8px ${C.red}` }}>CLOCKED IN</div>
              <div className="timer-display" style={{ fontSize: 52, fontWeight: 800, fontVariantNumeric: "tabular-nums", textShadow: "0 0 30px rgba(255,82,82,0.3)", lineHeight: 1.1 }}>{fm.live(elapsed)}</div>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 6, marginBottom: 4 }}>Started {fm.time(clocking.start_time)}</div>
              {isChloe && quote && <div style={{ fontSize: 13, color: C.accent, fontStyle: "italic", marginBottom: 12, opacity: 0.85 }}>"{quote}"</div>}
              {isChloe && streak > 1 && <div style={{ fontSize: 12, color: C.orange, marginBottom: 12, fontWeight: 600 }}>\uD83D\uDD25 {streak}-day streak!</div>}
              {panel !== "clockOut" && <Btn bg={C.red} glow={C.redGlow} onClick={openClockOut} style={{ fontSize: 16, padding: "14px 50px" }}>Clock Out</Btn>}
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: C.dim, marginBottom: 6 }}>{isChloe ? "\uD83C\uDF38 Ready to track time \uD83C\uDF38" : "Ready to track time"}</div>
              {isChloe && streak > 1 && <div style={{ fontSize: 12, color: C.orange, marginBottom: 6, fontWeight: 600 }}>\uD83D\uDD25 {streak}-day streak! Keep it going!</div>}
              {proj && <div style={{ fontSize: 14, fontWeight: 700, color: C.accent, marginBottom: 4, textShadow: `0 0 10px ${C.accent}44` }}>{proj.name}</div>}
              {proj && <div style={{ fontSize: 12, color: C.dim, marginBottom: 20 }}>{isChloe ? (chloeIsFlat ? `${fm.money(chloeStraightRate)}/hr (OT requires advance approval)` : `Office: ${fm.money(getChloeRate("office"))}/hr | Home: ${fm.money(getChloeRate("home"))}/hr`) : isDesmond ? `${fm.money(dezCfg?.straightRate ?? 36)}/hr (OT auto-calculated after 40 hrs/week)` : `Justin: ${fm.money(proj.j_rate || 75)}/hr | Sam: ${fm.money(proj.s_rate || 60)}/hr`}</div>}
              <div className="timer-buttons" style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <Btn bg={C.green} glow={C.greenGlow} onClick={clockIn} style={{ fontSize: 16, padding: "14px 50px" }}>{isChloe ? "\uD83D\uDC9C Clock In" : "Clock In"}</Btn>
                <Btn bg={C.card2} onClick={openManual}>{isChloe ? "\u270F\uFE0F Add Entry" : "+ Manual Entry"}</Btn>
              </div>
            </>
          )}
        </Card>

        {panel === "clockOut" && renderEntryForm("Clock Out", false, saveClockOut, "Save & Clock Out", C.red, C.redGlow)}
        {panel === "manual" && renderEntryForm("Manual Time Entry", true, saveManual)}
        {panel === "edit" && renderEntryForm("Edit Time Entry", true, saveEdit)}

        {panel === "addPrj" && !isChloe && (
          <Card glow={C.glow} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.accent, marginBottom: 16 }}>New Project</div>
            <div style={{ marginBottom: 12 }}><Lbl>Project Name</Lbl><Inp value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., PM - 123 Main St (Smith)" /></div>
            <div className="form-grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div><Lbl>Justin's Rate ($/hr)</Lbl><Inp type="number" value={form.jRate || ""} onChange={e => setForm({ ...form, jRate: e.target.value })} /></div>
              <div><Lbl>Sam's Rate ($/hr)</Lbl><Inp type="number" value={form.sRate || ""} onChange={e => setForm({ ...form, sRate: e.target.value })} /></div>
              <div><Lbl>Chloe's Rate ($/hr)</Lbl><Inp type="number" value={form.cRate || ""} onChange={e => setForm({ ...form, cRate: e.target.value })} /></div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn bg={C.accent} glow={C.glowSm} onClick={saveProject} disabled={!form.name?.trim()} style={{ flex: 1 }}>Add Project</Btn>
              <Btn bg={C.card2} onClick={() => setPanel(null)}>Cancel</Btn>
            </div>
          </Card>
        )}

        {panel === "editPrj" && !isChloe && (
          <Card glow={C.glow} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.accent, marginBottom: 16 }}>Edit Project</div>
            <div style={{ marginBottom: 12 }}><Lbl>Project Name</Lbl><Inp value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div><Lbl>Justin's Rate ($/hr)</Lbl><Inp type="number" value={form.jRate || ""} onChange={e => setForm({ ...form, jRate: e.target.value })} /></div>
              <div><Lbl>Sam's Rate ($/hr)</Lbl><Inp type="number" value={form.sRate || ""} onChange={e => setForm({ ...form, sRate: e.target.value })} /></div>
              <div><Lbl>Chloe's Rate ($/hr)</Lbl><Inp type="number" value={form.cRate || ""} onChange={e => setForm({ ...form, cRate: e.target.value })} /></div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn bg={C.accent} glow={C.glowSm} onClick={saveEditPrj} disabled={!form.name?.trim()} style={{ flex: 1 }}>Save Changes</Btn>
              <Btn bg={C.card2} onClick={() => setPanel(null)}>Cancel</Btn>
            </div>
          </Card>
        )}

        {/* Dashboard */}
        {view === "dashboard" && (
          <>
            <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
              {[
                { label: isAgentCare ? "MY HOURS" : "TOTAL HOURS", val: fm.hrs(isChloe ? cMs : isDesmond ? dMs : totMs), sub: isAgentCare ? "" : `J: ${fm.hrs(jMs)} | S: ${fm.hrs(sMs)} | C: ${fm.hrs(cMs)} | D: ${fm.hrs(dMs)}`, color: C.accent },
                { label: isChloe ? "\uD83D\uDCB0 EARNINGS" : isDesmond ? "EARNINGS" : "SUBTOTAL", val: fm.money(isChloe ? cAmt : isDesmond ? dAmt : sub), sub: isAgentCare ? "" : `GET: ${fm.money(getTax)}`, color: C.orange },
                { label: isChloe ? "\uD83D\uDC9E TOTAL" : isDesmond ? "TOTAL EARNED" : "TOTAL DUE", val: fm.money(isChloe ? cAmt : isDesmond ? dAmt : total), sub: isAgentCare ? "" : "including GET 4.712%", color: C.green },
              ].map((c, i) => (
                <Card key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, letterSpacing: 1.5, marginBottom: 6 }}>{c.label}</div>
                  <div className="stat-value" style={{ fontSize: 26, fontWeight: 800, color: c.color, textShadow: `0 0 15px ${c.color}33` }}>{c.val}</div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>{c.sub}</div>
                </Card>
              ))}
            </div>
            {/* Dashboard Widgets */}
            {!isChloe && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }} className="stats-grid">
                <Card><ComparisonCards entries={pe} fm={fm} C={C} /></Card>
                <Card><EarningsForecast entries={pe} getRate={getRate} fm={fm} C={C} /></Card>
              </div>
            )}
            <Card style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>
                {isChloe ? "\uD83D\uDCC5 Activity Map" : "90-Day Activity"}
              </div>
              <HeatMap entries={pe} C={C} />
            </Card>
            <Card style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Hours Trend (30 days)</div>
              <TrendChart entries={pe} days={30} C={C} />
            </Card>
            <EarningsTracker entries={pe} isChloe={isChloe} fm={fm} C={C} getRate={getRate} />
            {!isChloe && (
              <Card style={{ marginBottom: 24, marginTop: 12 }}>
                <LiveBadge supabase={supabase} C={C} />
              </Card>
            )}
            {proj && !isChloe && proj.budget && (
              <div style={{ marginBottom: 24 }}>
                <BudgetTracker project={proj} entries={pe} getRate={getRate} fm={fm} C={C} />
              </div>
            )}
            {catData.length > 0 && (
              <Card style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Hours by Category</div>
                {catData.map(x => (
                  <div key={x.c} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                      <span style={{ fontWeight: 600, color: catColor[x.c] }}>{x.c}</span>
                      <span style={{ color: C.dim }}>{(x.ms / 3600000).toFixed(2)} hrs</span>
                    </div>
                    <div style={{ background: C.bg, borderRadius: 4, height: 6, overflow: "hidden" }}>
                      <div style={{ background: catColor[x.c], borderRadius: 4, height: 6, width: `${(x.ms / catMax) * 100}%`, boxShadow: `0 0 8px ${catColor[x.c]}44`, transition: "width 0.4s" }} />
                    </div>
                  </div>
                ))}
              </Card>
            )}
            {pe.length > 0 ? (
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Recent Entries</div>
                {pe.slice(-5).reverse().map(e => (
                  <Card key={e.id} style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", padding: 14 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.description}</div>
                      <div style={{ fontSize: 11, color: C.dim }}>{fm.date(e.start_time)} - {fm.time(e.start_time)} to {fm.time(e.end_time)} - {e.worker}</div>
                      <Badge cat={e.category} />
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.accent, textShadow: `0 0 10px ${C.accent}33`, marginLeft: 12, flexShrink: 0 }}>{fm.hrs(e.duration_ms)}h</div>
                  </Card>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", color: C.dim, padding: 50, fontSize: 14 }}>{isChloe ? "\uD83C\uDF3A No entries yet! Hit Clock In to get started \uD83D\uDE0A" : "No time entries yet. Hit Clock In to start tracking."}</div>
            )}
          </>
        )}

        {/* Entries */}
        {view === "entries" && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <SearchBar entries={pe} onFilter={setSearchFiltered} C={C} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>All Time Entries ({(searchFiltered || pe).length})</div>
              {proj && !isChloe && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={openEditPrj} style={{ fontSize: 11, color: C.accent, background: "none", border: `1px solid ${C.accent}44`, borderRadius: 4, padding: "4px 12px", cursor: "pointer" }}>Edit Project</button>
                  <button onClick={() => toggleArchive(proj.id, proj.archived)} style={{ fontSize: 11, color: proj.archived ? C.green : C.orange, background: "none", border: `1px solid ${proj.archived ? C.green : C.orange}44`, borderRadius: 4, padding: "4px 12px", cursor: "pointer" }}>{proj.archived ? "Restore" : "Archive"}</button>
                  <button onClick={() => deleteProject(proj.id)} style={{ fontSize: 11, color: C.red, background: "none", border: `1px solid ${C.red}44`, borderRadius: 4, padding: "4px 12px", cursor: "pointer" }}>Delete</button>
                  <button onClick={() => exportCSV(pe, getRate, proj?.name || "export")} style={{ fontSize: 11, color: C.green, background: "none", border: `1px solid ${C.green}44`, borderRadius: 4, padding: "4px 12px", cursor: "pointer" }}>Export CSV</button>
                </div>
              )}
            </div>
            {(searchFiltered || pe).length === 0 && <div style={{ color: C.dim, textAlign: "center", padding: 40 }}>No entries found.</div>}
            {(searchFiltered || pe).slice().reverse().map(e => (
              <Card key={e.id} style={{ marginBottom: 10, padding: 14 }}>
                <div className="entry-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{e.description}</div>
                    <div style={{ fontSize: 12, color: C.dim }}>{fm.date(e.start_time)} - {fm.time(e.start_time)} to {fm.time(e.end_time)}</div>
                    <div style={{ fontSize: 12, color: C.dim, marginBottom: 4 }}>{e.worker} - {fm.money(getRate(e.worker, e))}/hr{e.work_location ? ` (${e.work_location === "office" ? "Office" : "Home"})` : ""}</div>
                    <Badge cat={e.category} />
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: C.accent }}>{fm.hrs(e.duration_ms)}h</div>
                    <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{fm.money(parseFloat(fm.hrs(e.duration_ms)) * getRate(e.worker, e))}</div>
                    <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                      <button onClick={() => openEdit(e)} style={{ fontSize: 11, color: C.accent, background: "none", border: `1px solid ${C.accent}44`, borderRadius: 4, padding: "2px 10px", cursor: "pointer" }}>Edit</button>
                      <button onClick={() => delEntry(e.id)} style={{ fontSize: 11, color: C.red, background: "none", border: `1px solid ${C.red}44`, borderRadius: 4, padding: "2px 10px", cursor: "pointer" }}>Delete</button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Reports */}
        {view === "reports" && (
          <div>
            <div className="report-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{isChloe ? "\uD83D\uDCCB My Reports \uD83C\uDF38" : "Weekly Reports"}</div>
              <Sel value={reportFilter} onChange={e => setReportFilter(e.target.value)} style={{ width: "auto", minWidth: 160, fontSize: 12 }}>
                <option value="all">All Time</option>
                <option value="this-week">This Week</option>
                <option value="last-week">Last Week</option>
                <option value="this-month">This Month</option>
                <option value="last-month">Last Month</option>
                <option value="last-30">Last 30 Days</option>
                <option value="ytd">Year to Date</option>
                <option value="last-year">Last Year</option>
                <option value="custom">Custom Dates</option>
              </Sel>
            </div>
            {reportFilter === "custom" && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <Inp type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ width: "auto", fontSize: 12 }} />
                <span style={{ color: C.dim, fontSize: 12 }}>to</span>
                <Inp type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ width: "auto", fontSize: 12 }} />
              </div>
            )}
            {sortedWks.length === 0 && <div style={{ color: C.dim, textAlign: "center", padding: 40 }}>No entries to report.</div>}
            {sortedWks.map(wk => {
              const es = wkGroups[wk].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
              const wkWorkerTotals = {};
              es.forEach(e => {
                if (!wkWorkerTotals[e.worker]) wkWorkerTotals[e.worker] = { ms: 0, pay: 0 };
                wkWorkerTotals[e.worker].ms += e.duration_ms;
                wkWorkerTotals[e.worker].pay += (Math.ceil(e.duration_ms / 60000) / 60) * getRate(e.worker, e);
              });
              const wS = Object.values(wkWorkerTotals).reduce((s, w) => s + w.pay, 0);
              const wG = wS * GET_RATE, wT = wS + wG;
              const hoursLabel = Object.entries(wkWorkerTotals).map(([w, d]) => `${w.split(" ")[0]}: ${(Math.ceil(d.ms / 60000) / 60).toFixed(2)}`).join(" | ");
              return (
                <Card key={wk} style={{ marginBottom: 16 }}>
                  <div className="report-week-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.accent }}>Week of {fm.date(wk)}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn bg={C.green} glow={C.greenGlow} onClick={() => downloadWeekPDF(wk)} style={{ padding: "6px 14px", fontSize: 12 }}>Download PDF</Btn>
                      <Btn bg={C.accent} glow={C.glowSm} onClick={() => copyWeek(wk)} style={{ padding: "6px 14px", fontSize: 12 }}>Copy for QuickBooks</Btn>
                    </div>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                      <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>{["Date", "Worker", "Hours", "Rate", "Location", "Category", "Description"].map(h => (<th key={h} style={{ textAlign: "left", padding: "6px 4px", fontWeight: 700, color: C.dim, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>{h}</th>))}</tr></thead>
                      <tbody>{es.map(e => (<tr key={e.id} style={{ borderBottom: `1px solid ${C.border}22` }}><td style={{ padding: "8px 4px" }}>{fm.date(e.start_time)}</td><td style={{ padding: "8px 4px", color: C.dim }}>{e.worker.split(" ")[0]}</td><td style={{ padding: "8px 4px", color: C.accent, fontWeight: 700 }}>{fm.hrs(e.duration_ms)}</td><td style={{ padding: "8px 4px", color: C.dim }}>{fm.money(getRate(e.worker, e))}/hr</td><td style={{ padding: "8px 4px", color: C.dim }}>{e.work_location ? (e.work_location === "office" ? "Office" : "Home") : "-"}</td><td style={{ padding: "8px 4px" }}><Badge cat={e.category} /></td><td style={{ padding: "8px 4px", color: C.dim, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.description}</td></tr>))}</tbody>
                    </table>
                  </div>
                  <div className="stats-grid" style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    {[
                      { label: "HOURS", val: hoursLabel, color: C.accent },
                      { label: "GET", val: fm.money(wG), color: C.orange },
                      { label: "TOTAL", val: fm.money(wT), color: C.green },
                    ].map((x, i) => (
                      <div key={i} style={{ background: C.bg, borderRadius: 8, padding: 10, textAlign: "center" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, letterSpacing: 1 }}>{x.label}</div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: x.color, textShadow: `0 0 10px ${x.color}33` }}>{x.val}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Invoices (admin only) */}
        {view === "invoices" && !isChloe && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Invoice History</div>
            <InvoiceHistory
              invoices={invoices}
              onStatusChange={async (id, newStatus) => {
                const { error } = await supabase.from("invoice_history").update({ status: newStatus, ...(newStatus === "paid" ? { paid_at: new Date().toISOString() } : {}) }).eq("id", id);
                if (!error) setInvoices(invoices.map(inv => inv.id === id ? { ...inv, status: newStatus } : inv));
              }}
              fm={fm}
              C={C}
            />
          </div>
        )}

        {/* Admin Panel */}
        {view === "admin" && isAdmin && (
          <AdminPanel
            entries={entries}
            projects={projects}
            activePrj={activePrj}
            C={C}
            fm={fm}
            getChloeRate={getChloeRate}
            workerConfigs={workerConfigs}
            supabase={supabase}
            session={session}
            onEntriesChange={setEntries}
            onEditEntry={openEdit}
            onDeleteEntry={delEntry}
          />
        )}
      </div>

      {/* Responsive styles */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 600px) {
          .stats-grid { grid-template-columns: 1fr !important; }
          .form-grid-3 { grid-template-columns: 1fr !important; }
          .form-grid-2 { grid-template-columns: 1fr !important; }
          .header-controls { flex-direction: column; align-items: stretch !important; }
          .header-row { flex-direction: column; }
          .timer-display { font-size: 36px !important; }
          .stat-value { font-size: 20px !important; }
          .entry-row { flex-direction: column; }
          .report-week-header { flex-direction: column; }
          .sticky-header { position: sticky; top: 0; z-index: 100; }
        }
      `}</style>
    </div>
  );
}
