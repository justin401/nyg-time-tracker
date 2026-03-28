import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";

const C = {
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
const CATS = ["Travel", "On-Site", "Coordination", "Admin", "Video Updates"];
const catColor = { Travel: C.catTravel, "On-Site": C.catOnSite, Coordination: C.catCoord, Admin: C.catAdmin, "Video Updates": C.catVideo };
const GET_RATE = 0.04712;

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
  const [activePrj, setActivePrj] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [view, setView] = useState("dashboard");
  const [panel, setPanel] = useState(null);
  const [form, setForm] = useState({});
  const [polishing, setPolishing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState({ text: "Loading...", color: C.orange });
  const [showArchived, setShowArchived] = useState(false);
  const [reportFilter, setReportFilter] = useState("all");
  const timerRef = useRef(null);
  const clockRef = useRef(null);

  const userName = session.user.user_metadata?.name || session.user.email;

  const showStatus = (text, color) => {
    setStatus({ text, color });
    setTimeout(() => setStatus({ text: "", color: "" }), 4000);
  };

  // ── LOAD DATA ──
  useEffect(() => {
    (async () => {
      try {
        const [{ data: prjs }, { data: ents }, { data: clk }] = await Promise.all([
          supabase.from("projects").select("*").order("created_at"),
          supabase.from("time_entries").select("*").order("start_time"),
          supabase.from("clock_status").select("*").eq("user_id", session.user.id).limit(1),
        ]);
        setProjects(prjs || []);
        setEntries(ents || []);
        if (clk && clk.length > 0) {
          setClocking(clk[0]);
          clockRef.current = clk[0];
        }
        if (prjs && prjs.length > 0) setActivePrj(prjs[0].id);
        showStatus(`Loaded ${(prjs || []).length} projects, ${(ents || []).length} entries`, C.green);
      } catch (e) {
        showStatus("Load failed: " + e.message, C.red);
      }
      setLoaded(true);
    })();
  }, [session]);

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
  const pe = entries.filter(e => e.project_id === activePrj);
  const getRate = (w) => w === "Sam Palompo" ? (proj?.s_rate || 60) : (proj?.j_rate || 75);
  const jMs = pe.filter(e => e.worker === "Justin K. Taparra").reduce((s, e) => s + e.duration_ms, 0);
  const sMs = pe.filter(e => e.worker === "Sam Palompo").reduce((s, e) => s + e.duration_ms, 0);
  const totMs = jMs + sMs;
  const jAmt = (Math.ceil(jMs / 60000) / 60) * (proj?.j_rate || 75);
  const sAmt = (Math.ceil(sMs / 60000) / 60) * (proj?.s_rate || 60);
  const sub = jAmt + sAmt, getTax = sub * GET_RATE, total = sub + getTax;
  const catData = CATS.map(c => ({ c, ms: pe.filter(e => e.category === c).reduce((s, e) => s + e.duration_ms, 0) })).filter(x => x.ms > 0);
  const catMax = catData.length ? Math.max(...catData.map(x => x.ms)) : 1;

  // ── REPORT FILTERING ──
  const getFilteredEntries = (entries) => {
    if (reportFilter === "all") return entries;
    const now = new Date();
    let start;
    if (reportFilter === "this-week") {
      start = new Date(fm.wkStart(now));
    } else if (reportFilter === "this-month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (reportFilter === "last-30") {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    return entries.filter(e => new Date(e.start_time) >= start);
  };

  // ── ACTIONS ──
  const clockIn = async () => {
    const row = { user_id: session.user.id, project_id: activePrj, start_time: new Date().toISOString() };
    const { data, error } = await supabase.from("clock_status").insert(row).select().single();
    if (error) return showStatus("Clock in failed: " + error.message, C.red);
    setClocking(data);
    clockRef.current = data;
    showStatus("Clocked in!", C.green);
  };

  const openClockOut = () => { setForm({ cat: "Admin", desc: "", worker: userName }); setPanel("clockOut"); };

  const saveClockOut = async () => {
    if (!form.desc.trim()) return;
    const end = new Date().toISOString();
    const dur = new Date(end).getTime() - new Date(clocking.start_time).getTime();
    const entry = { project_id: clocking.project_id, worker: form.worker, category: form.cat, description: form.desc, start_time: clocking.start_time, end_time: end, duration_ms: dur, created_by: session.user.id };
    const { data, error } = await supabase.from("time_entries").insert(entry).select().single();
    if (error) return showStatus("Save failed: " + error.message, C.red);
    await supabase.from("clock_status").delete().eq("id", clocking.id);
    setEntries([...entries, data]);
    setClocking(null);
    clockRef.current = null;
    setPanel(null);
    showStatus("Clocked out and saved!", C.green);
  };

  const openManual = () => { setForm({ date: new Date().toISOString().split("T")[0], st: "09:00", et: "10:00", cat: "Admin", desc: "", worker: userName }); setPanel("manual"); };

  const saveManual = async () => {
    if (!form.desc.trim()) return;
    const start = new Date(`${form.date}T${form.st}`), end = new Date(`${form.date}T${form.et}`);
    const dur = end.getTime() - start.getTime();
    if (dur <= 0) return alert("End time must be after start time");
    const entry = { project_id: activePrj, worker: form.worker, category: form.cat, description: form.desc, start_time: start.toISOString(), end_time: end.toISOString(), duration_ms: dur, created_by: session.user.id };
    const { data, error } = await supabase.from("time_entries").insert(entry).select().single();
    if (error) return showStatus("Save failed: " + error.message, C.red);
    setEntries([...entries, data]);
    setPanel(null);
    showStatus("Entry saved!", C.green);
  };

  const openEdit = (e) => {
    const s = new Date(e.start_time), en = new Date(e.end_time);
    setForm({ id: e.id, date: s.toISOString().split("T")[0], st: `${String(s.getHours()).padStart(2, "0")}:${String(s.getMinutes()).padStart(2, "0")}`, et: `${String(en.getHours()).padStart(2, "0")}:${String(en.getMinutes()).padStart(2, "0")}`, cat: e.category, desc: e.description, worker: e.worker });
    setPanel("edit");
  };

  const saveEdit = async () => {
    if (!form.desc.trim()) return;
    const start = new Date(`${form.date}T${form.st}`), end = new Date(`${form.date}T${form.et}`);
    const dur = end.getTime() - start.getTime();
    if (dur <= 0) return alert("End time must be after start time");
    const updates = { worker: form.worker, category: form.cat, description: form.desc, start_time: start.toISOString(), end_time: end.toISOString(), duration_ms: dur };
    const { error } = await supabase.from("time_entries").update(updates).eq("id", form.id);
    if (error) return showStatus("Update failed: " + error.message, C.red);
    setEntries(entries.map(e => e.id === form.id ? { ...e, ...updates } : e));
    setPanel(null);
    showStatus("Entry updated!", C.green);
  };

  const delEntry = async (id) => {
    const { error } = await supabase.from("time_entries").delete().eq("id", id);
    if (error) return showStatus("Delete failed: " + error.message, C.red);
    setEntries(entries.filter(e => e.id !== id));
    showStatus("Entry deleted", C.green);
  };

  const openAddPrj = () => { setForm({ name: "", jRate: "75", sRate: "60" }); setPanel("addPrj"); };

  const saveProject = async () => {
    if (!form.name.trim()) return;
    const row = { name: form.name, j_rate: parseFloat(form.jRate) || 75, s_rate: parseFloat(form.sRate) || 60, created_by: session.user.id };
    const { data, error } = await supabase.from("projects").insert(row).select().single();
    if (error) return showStatus("Save failed: " + error.message, C.red);
    setProjects([...projects, data]);
    setActivePrj(data.id);
    setPanel(null);
    showStatus("Project added!", C.green);
  };

  const openEditPrj = () => {
    if (!proj) return;
    setForm({ name: proj.name, jRate: String(proj.j_rate || 75), sRate: String(proj.s_rate || 60) });
    setPanel("editPrj");
  };

  const saveEditPrj = async () => {
    if (!form.name.trim()) return;
    const updates = { name: form.name, j_rate: parseFloat(form.jRate) || 75, s_rate: parseFloat(form.sRate) || 60 };
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
    const wjMs = es.filter(e => e.worker === "Justin K. Taparra").reduce((s, e) => s + e.duration_ms, 0);
    const wsMs = es.filter(e => e.worker === "Sam Palompo").reduce((s, e) => s + e.duration_ms, 0);
    const wjA = (Math.ceil(wjMs / 60000) / 60) * (proj?.j_rate || 75), wsA = (Math.ceil(wsMs / 60000) / 60) * (proj?.s_rate || 60);
    const wS = wjA + wsA, wG = wS * GET_RATE, wT = wS + wG;
    let t = `NYG LLC - Weekly Invoice\nProject: ${proj.name}\nWeek of: ${fm.date(wk)}\n\nDate | Worker | Hours | Rate | Category | Description\n-----|--------|-------|------|----------|------------\n`;
    es.forEach(e => { t += `${fm.date(e.start_time)} | ${e.worker} | ${fm.hrs(e.duration_ms)} | $${getRate(e.worker)}/hr | ${e.category} | ${e.description}\n`; });
    t += `\nJustin: ${(Math.ceil(wjMs / 60000) / 60).toFixed(2)} hrs x $${proj?.j_rate || 75} = ${fm.money(wjA)}`;
    t += `\nSam: ${(Math.ceil(wsMs / 60000) / 60).toFixed(2)} hrs x $${proj?.s_rate || 60} = ${fm.money(wsA)}`;
    t += `\nSubtotal: ${fm.money(wS)}\nGET (4.712%): ${fm.money(wG)}\nTotal Due: ${fm.money(wT)}`;
    navigator.clipboard.writeText(t).then(() => alert("Copied to clipboard!"));
  };

  const WorkerSel = ({ value, onChange }) => (
    <Sel value={value} onChange={onChange}>
      <option value="Justin K. Taparra">Justin K. Taparra ({fm.money(proj?.j_rate || 75)}/hr)</option>
      <option value="Sam Palompo">Sam Palompo ({fm.money(proj?.s_rate || 60)}/hr)</option>
    </Sel>
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
      <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div><Lbl>Worker</Lbl><WorkerSel value={form.worker} onChange={e => setForm({ ...form, worker: e.target.value })} /></div>
        <div><Lbl>Category</Lbl><Sel value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })}>{CATS.map(c => <option key={c}>{c}</option>)}</Sel></div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <Lbl>What did you work on? (required)</Lbl>
        <textarea value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} placeholder="Be detailed. Your client will see this on the invoice." rows={4} style={{ width: "100%", padding: 12, borderRadius: 8, border: `1px solid ${C.border}`, background: C.input, color: C.white, fontSize: 14, resize: "vertical", boxSizing: "border-box", outline: "none", fontFamily: "system-ui" }} />
        <div style={{ marginTop: 6 }}>
          <button onClick={polish} disabled={polishing || !form.desc.trim()} style={{ background: "transparent", border: `1px solid ${C.accent}`, color: C.accent, borderRadius: 6, padding: "5px 14px", fontSize: 12, fontWeight: 600, cursor: polishing ? "default" : "pointer", opacity: (polishing || !form.desc.trim()) ? 0.4 : 1 }}>{polishing ? "Polishing..." : "Polish with AI (Opus)"}</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn bg={saveBg || C.green} glow={saveGlow || C.greenGlow} onClick={onSave} disabled={!form.desc.trim()} style={{ flex: 1, fontSize: 15 }}>{saveLbl || "Save"}</Btn>
        <Btn bg={C.card2} onClick={() => setPanel(null)}>Cancel</Btn>
      </div>
    </Card>
  );

  if (!loaded) return <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.accent, fontFamily: "system-ui" }}>Loading...</div>;

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: C.bg, minHeight: "100vh", color: C.white }}>
      {/* Header */}
      <div style={{ background: C.bg2, padding: "18px 24px", borderBottom: `1px solid ${C.border}` }}>
        <div className="header-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1 }}>NYG LLC</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.accent, letterSpacing: 2.5, textShadow: C.glowSm }}>SERVICED AT THE HIGHEST LEVEL</div>
          </div>
          <div className="header-controls" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Sel value={activePrj || ""} onChange={e => setActivePrj(e.target.value)} style={{ width: "auto", minWidth: 180, fontSize: 13 }}>
              {visibleProjects.map(p => <option key={p.id} value={p.id}>{p.name}{p.archived ? " (archived)" : ""}</option>)}
            </Sel>
            <Btn bg={C.accent} glow={C.glowSm} onClick={openAddPrj} style={{ padding: "10px 14px" }}>+</Btn>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 4 }}>
              <span style={{ fontSize: 12, color: C.dim }}>{userName}</span>
              <button onClick={onLogout} style={{ fontSize: 11, color: C.red, background: "none", border: `1px solid ${C.red}44`, borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontWeight: 600 }}>Logout</button>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 6 }}>
          <div>{status.text && <span style={{ fontSize: 11, color: status.color, fontWeight: 600 }}>{status.text}</span>}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowArchived(!showArchived)} style={{ fontSize: 11, color: C.dim, background: "none", border: `1px solid ${C.border}`, borderRadius: 4, padding: "3px 10px", cursor: "pointer" }}>{showArchived ? "Hide Archived" : "Show Archived"}</button>
            <button onClick={exportData} style={{ fontSize: 11, color: C.accent, background: "none", border: `1px solid ${C.accent}44`, borderRadius: 4, padding: "3px 10px", cursor: "pointer" }}>Export Backup</button>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ display: "flex", background: C.bg2, borderBottom: `1px solid ${C.border}` }}>
        {["dashboard", "entries", "reports"].map(v => (
          <button key={v} onClick={() => setView(v)} style={{ flex: 1, padding: "14px 0", border: "none", background: "transparent", borderBottom: view === v ? `3px solid ${C.accent}` : "3px solid transparent", color: view === v ? C.accent : C.dim, fontWeight: 700, fontSize: 13, cursor: "pointer", textTransform: "uppercase", letterSpacing: 1.5, textShadow: view === v ? `0 0 10px ${C.accent}` : "none" }}>{v}</button>
        ))}
      </div>

      <div style={{ padding: "24px 16px", maxWidth: 820, margin: "0 auto" }}>
        {/* Timer */}
        <Card glow={clocking ? "0 0 25px rgba(255,82,82,0.3)" : C.glowSm} style={{ marginBottom: 24, textAlign: "center", border: `1px solid ${clocking ? C.red + "66" : C.border}`, background: clocking ? `linear-gradient(135deg, ${C.card}, #1A1520)` : C.card }}>
          {clocking ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.red, letterSpacing: 2, marginBottom: 6, textShadow: `0 0 8px ${C.red}` }}>CLOCKED IN</div>
              <div className="timer-display" style={{ fontSize: 52, fontWeight: 800, fontVariantNumeric: "tabular-nums", textShadow: "0 0 30px rgba(255,82,82,0.3)", lineHeight: 1.1 }}>{fm.live(elapsed)}</div>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 6, marginBottom: 16 }}>Started {fm.time(clocking.start_time)}</div>
              {panel !== "clockOut" && <Btn bg={C.red} glow={C.redGlow} onClick={openClockOut} style={{ fontSize: 16, padding: "14px 50px" }}>Clock Out</Btn>}
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: C.dim, marginBottom: 6 }}>Ready to track time</div>
              {proj && <div style={{ fontSize: 14, fontWeight: 700, color: C.accent, marginBottom: 4, textShadow: `0 0 10px ${C.accent}44` }}>{proj.name}</div>}
              {proj && <div style={{ fontSize: 12, color: C.dim, marginBottom: 20 }}>Justin: {fm.money(proj.j_rate || 75)}/hr | Sam: {fm.money(proj.s_rate || 60)}/hr</div>}
              <div className="timer-buttons" style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <Btn bg={C.green} glow={C.greenGlow} onClick={clockIn} style={{ fontSize: 16, padding: "14px 50px" }}>Clock In</Btn>
                <Btn bg={C.card2} onClick={openManual}>+ Manual Entry</Btn>
              </div>
            </>
          )}
        </Card>

        {panel === "clockOut" && renderEntryForm("Clock Out", false, saveClockOut, "Save & Clock Out", C.red, C.redGlow)}
        {panel === "manual" && renderEntryForm("Manual Time Entry", true, saveManual)}
        {panel === "edit" && renderEntryForm("Edit Time Entry", true, saveEdit)}

        {panel === "addPrj" && (
          <Card glow={C.glow} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.accent, marginBottom: 16 }}>New Project</div>
            <div style={{ marginBottom: 12 }}><Lbl>Project Name</Lbl><Inp value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., PM - 123 Main St (Smith)" /></div>
            <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div><Lbl>Justin's Rate ($/hr)</Lbl><Inp type="number" value={form.jRate || ""} onChange={e => setForm({ ...form, jRate: e.target.value })} /></div>
              <div><Lbl>Sam's Rate ($/hr)</Lbl><Inp type="number" value={form.sRate || ""} onChange={e => setForm({ ...form, sRate: e.target.value })} /></div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn bg={C.accent} glow={C.glowSm} onClick={saveProject} disabled={!form.name?.trim()} style={{ flex: 1 }}>Add Project</Btn>
              <Btn bg={C.card2} onClick={() => setPanel(null)}>Cancel</Btn>
            </div>
          </Card>
        )}

        {panel === "editPrj" && (
          <Card glow={C.glow} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.accent, marginBottom: 16 }}>Edit Project</div>
            <div style={{ marginBottom: 12 }}><Lbl>Project Name</Lbl><Inp value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div><Lbl>Justin's Rate ($/hr)</Lbl><Inp type="number" value={form.jRate || ""} onChange={e => setForm({ ...form, jRate: e.target.value })} /></div>
              <div><Lbl>Sam's Rate ($/hr)</Lbl><Inp type="number" value={form.sRate || ""} onChange={e => setForm({ ...form, sRate: e.target.value })} /></div>
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
                { label: "TOTAL HOURS", val: fm.hrs(totMs), sub: `Justin: ${fm.hrs(jMs)} | Sam: ${fm.hrs(sMs)}`, color: C.accent },
                { label: "SUBTOTAL", val: fm.money(sub), sub: `GET: ${fm.money(getTax)}`, color: C.orange },
                { label: "TOTAL DUE", val: fm.money(total), sub: "including GET 4.712%", color: C.green },
              ].map((c, i) => (
                <Card key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, letterSpacing: 1.5, marginBottom: 6 }}>{c.label}</div>
                  <div className="stat-value" style={{ fontSize: 26, fontWeight: 800, color: c.color, textShadow: `0 0 15px ${c.color}33` }}>{c.val}</div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>{c.sub}</div>
                </Card>
              ))}
            </div>
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
              <div style={{ textAlign: "center", color: C.dim, padding: 50, fontSize: 14 }}>No time entries yet. Hit Clock In to start tracking.</div>
            )}
          </>
        )}

        {/* Entries */}
        {view === "entries" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>All Time Entries ({pe.length})</div>
              {proj && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={openEditPrj} style={{ fontSize: 11, color: C.accent, background: "none", border: `1px solid ${C.accent}44`, borderRadius: 4, padding: "4px 12px", cursor: "pointer" }}>Edit Project</button>
                  <button onClick={() => toggleArchive(proj.id, proj.archived)} style={{ fontSize: 11, color: proj.archived ? C.green : C.orange, background: "none", border: `1px solid ${proj.archived ? C.green : C.orange}44`, borderRadius: 4, padding: "4px 12px", cursor: "pointer" }}>{proj.archived ? "Restore" : "Archive"}</button>
                  <button onClick={() => deleteProject(proj.id)} style={{ fontSize: 11, color: C.red, background: "none", border: `1px solid ${C.red}44`, borderRadius: 4, padding: "4px 12px", cursor: "pointer" }}>Delete</button>
                </div>
              )}
            </div>
            {pe.length === 0 && <div style={{ color: C.dim, textAlign: "center", padding: 40 }}>No entries yet.</div>}
            {pe.slice().reverse().map(e => (
              <Card key={e.id} style={{ marginBottom: 10, padding: 14 }}>
                <div className="entry-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{e.description}</div>
                    <div style={{ fontSize: 12, color: C.dim }}>{fm.date(e.start_time)} - {fm.time(e.start_time)} to {fm.time(e.end_time)}</div>
                    <div style={{ fontSize: 12, color: C.dim, marginBottom: 4 }}>{e.worker} - {fm.money(getRate(e.worker))}/hr</div>
                    <Badge cat={e.category} />
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: C.accent }}>{fm.hrs(e.duration_ms)}h</div>
                    <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{fm.money(parseFloat(fm.hrs(e.duration_ms)) * getRate(e.worker))}</div>
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
              <div style={{ fontSize: 14, fontWeight: 700 }}>Weekly Reports</div>
              <Sel value={reportFilter} onChange={e => setReportFilter(e.target.value)} style={{ width: "auto", minWidth: 140, fontSize: 12 }}>
                <option value="all">All Time</option>
                <option value="this-week">This Week</option>
                <option value="this-month">This Month</option>
                <option value="last-30">Last 30 Days</option>
              </Sel>
            </div>
            {sortedWks.length === 0 && <div style={{ color: C.dim, textAlign: "center", padding: 40 }}>No entries to report.</div>}
            {sortedWks.map(wk => {
              const es = wkGroups[wk].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
              const wjMs = es.filter(e => e.worker === "Justin K. Taparra").reduce((s, e) => s + e.duration_ms, 0);
              const wsMs = es.filter(e => e.worker === "Sam Palompo").reduce((s, e) => s + e.duration_ms, 0);
              const wjA = (Math.ceil(wjMs / 60000) / 60) * (proj?.j_rate || 75), wsA = (Math.ceil(wsMs / 60000) / 60) * (proj?.s_rate || 60);
              const wS = wjA + wsA, wG = wS * GET_RATE, wT = wS + wG;
              return (
                <Card key={wk} style={{ marginBottom: 16 }}>
                  <div className="report-week-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.accent }}>Week of {fm.date(wk)}</div>
                    <Btn bg={C.accent} glow={C.glowSm} onClick={() => copyWeek(wk)} style={{ padding: "6px 14px", fontSize: 12 }}>Copy for QuickBooks</Btn>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                      <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>{["Date", "Worker", "Hours", "Rate", "Category", "Description"].map(h => (<th key={h} style={{ textAlign: "left", padding: "6px 4px", fontWeight: 700, color: C.dim, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>{h}</th>))}</tr></thead>
                      <tbody>{es.map(e => (<tr key={e.id} style={{ borderBottom: `1px solid ${C.border}22` }}><td style={{ padding: "8px 4px" }}>{fm.date(e.start_time)}</td><td style={{ padding: "8px 4px", color: C.dim }}>{e.worker.split(" ")[0]}</td><td style={{ padding: "8px 4px", color: C.accent, fontWeight: 700 }}>{fm.hrs(e.duration_ms)}</td><td style={{ padding: "8px 4px", color: C.dim }}>{fm.money(getRate(e.worker))}/hr</td><td style={{ padding: "8px 4px" }}><Badge cat={e.category} /></td><td style={{ padding: "8px 4px", color: C.dim, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.description}</td></tr>))}</tbody>
                    </table>
                  </div>
                  <div className="stats-grid" style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    {[
                      { label: "HOURS", val: `J: ${(Math.ceil(wjMs / 60000) / 60).toFixed(2)} | S: ${(Math.ceil(wsMs / 60000) / 60).toFixed(2)}`, color: C.accent },
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
      </div>

      {/* Responsive styles */}
      <style>{`
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
        }
      `}</style>
    </div>
  );
}
