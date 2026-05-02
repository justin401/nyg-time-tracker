import { useState, useMemo } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DateRangeFilter, SearchBar, exportCSV } from "./AdminTools";
import { getEntryRate, calcWorkerPay } from "../lib/workerPay";

export default function AdminPanel({ entries, projects, activePrj, C, fm, getChloeRate, workerConfigs, supabase, session, onEntriesChange, onEditEntry, onDeleteEntry }) {
  const [workerFilter, setWorkerFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [searchFiltered, setSearchFiltered] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({});
  const [ratesOpen, setRatesOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const CATS = ["Travel", "On-Site", "Coordination", "Admin", "Video Updates", "Virtual Assistance"];
  const WORKERS = ["Justin K. Taparra", "Sam Palompo", "Chloe Mello", "Desmond Mello"];

  const proj = projects.find(p => p.id === activePrj) || projects[0];
  const projectRates = { j_rate: proj?.j_rate, s_rate: proj?.s_rate };

  // Per-entry display rate. For weekly_ot workers (Desmond), this returns the
  // straight rate as a display proxy; actual regular vs OT split is handled by
  // the worker-pay summary below.
  const getRate = (worker, entry) => getEntryRate(
    { worker, ...(entry || {}) },
    workerConfigs || {},
    projectRates
  );

  // Filter entries
  const filtered = useMemo(() => {
    let result = entries;
    if (workerFilter !== "all") result = result.filter(e => e.worker === workerFilter);
    if (dateRange.from) { const [y,m,d] = dateRange.from.split("-"); const fromDate = new Date(y, m-1, d, 0, 0, 0); result = result.filter(e => new Date(e.start_time) >= fromDate); }
    if (dateRange.to) { const [y,m,d] = dateRange.to.split("-"); const toDate = new Date(y, m-1, d, 23, 59, 59); result = result.filter(e => new Date(e.start_time) <= toDate); }
    return result;
  }, [entries, workerFilter, dateRange]);

  const displayEntries = searchFiltered || filtered;

  // Summary calculations
  const summary = useMemo(() => {
    const totalMs = displayEntries.reduce((s, e) => s + (e.duration_ms || 0), 0);
    // Per-worker pay routes through the engine so weekly_ot (Desmond) gets
    // the OT bucket math right. Flat-rate workers (Justin, Sam, Chloe) are
    // numerically equivalent to the prior per-entry sum.
    const byWorker = {};
    const workersInView = [...new Set(displayEntries.map(e => e.worker))];
    for (const w of workersInView) {
      const my = displayEntries.filter(e => e.worker === w);
      const ms = my.reduce((s, e) => s + (e.duration_ms || 0), 0);
      const pay = calcWorkerPay(w, my, workerConfigs || {}, { projectRates });
      byWorker[w] = {
        ms,
        pay: pay.totalPay,
        regularHours: pay.regularHours,
        otHours: pay.otHours,
        regularPay: pay.regularPay,
        otPay: pay.otPay,
        lumpSumTotal: pay.lumpSumTotal,
      };
    }
    const totalPay = Object.values(byWorker).reduce((s, w) => s + w.pay, 0);
    const byCategory = {};
    displayEntries.forEach(e => {
      if (!byCategory[e.category]) byCategory[e.category] = { ms: 0, pay: 0 };
      byCategory[e.category].ms += e.duration_ms || 0;
      const hrs = Math.ceil((e.duration_ms || 0) / 60000) / 60;
      byCategory[e.category].pay += hrs * getRate(e.worker, e);
    });
    return { totalMs, totalPay, byCategory, byWorker };
  }, [displayEntries, workerConfigs, projectRates]);

  // Manual entry for any worker
  const openManual = () => {
    setManualForm({
      date: new Date().toISOString().split("T")[0],
      st: "09:00",
      et: "10:00",
      cat: "Admin",
      desc: "",
      worker: "Chloe Mello",
      location: "office",
    });
    setManualOpen(true);
  };

  const saveManual = async () => {
    if (!manualForm.desc.trim()) return;
    const start = new Date(`${manualForm.date}T${manualForm.st}`);
    const end = new Date(`${manualForm.date}T${manualForm.et}`);
    const dur = end.getTime() - start.getTime();
    if (dur <= 0) return alert("End time must be after start time");
    const entry = {
      project_id: activePrj,
      worker: manualForm.worker,
      category: manualForm.cat,
      description: manualForm.desc,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration_ms: dur,
      created_by: session.user.id,
      ...(manualForm.worker === "Chloe Mello" ? { work_location: manualForm.location } : {}),
    };
    const { data, error } = await supabase.from("time_entries").insert(entry).select().single();
    if (error) return alert("Save failed: " + error.message);
    onEntriesChange(prev => [...prev, data]);
    setManualOpen(false);
  };

  // Rate editing
  const [rateForm, setRateForm] = useState({});
  const openRates = () => {
    setRateForm({
      jRate: String(proj?.j_rate || 75),
      sRate: String(proj?.s_rate || 60),
      cRate: String(proj?.c_rate || 27),
    });
    setRatesOpen(true);
  };
  const saveRates = async () => {
    setSaving(true);
    const updates = {
      j_rate: parseFloat(rateForm.jRate) || 75,
      s_rate: parseFloat(rateForm.sRate) || 60,
      c_rate: parseFloat(rateForm.cRate) || 27,
    };
    const { error } = await supabase.from("projects").update(updates).eq("id", activePrj);
    setSaving(false);
    if (error) return alert("Update failed: " + error.message);
    setRatesOpen(false);
    // Reload handled by parent
    window.location.reload();
  };

  const inputStyle = { width: "100%", padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, background: C.input, color: C.white, fontSize: 14, boxSizing: "border-box", outline: "none" };
  const selectStyle = { ...inputStyle, cursor: "pointer" };
  const cardStyle = { background: C.card, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, marginBottom: 16 };
  const lblStyle = { fontSize: 11, fontWeight: 600, color: C.dim, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 };
  const btnStyle = (bg, glow) => ({ padding: "10px 20px", background: bg || C.accent, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: glow || "none" });

  const probationEnd = new Date("2026-04-07");
  probationEnd.setDate(probationEnd.getDate() + 90);
  const daysInProbation = Math.floor((new Date() - new Date("2026-04-07")) / (1000 * 60 * 60 * 24));
  const probationRemaining = 90 - daysInProbation;

  // ── PDF REPORT ──
  const downloadReport = () => {
    const sorted = displayEntries.slice().sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    if (sorted.length === 0) return alert("No entries to generate report for.");

    const workerName = workerFilter === "all" ? "All Workers" : workerFilter;
    // Parse date strings as local time (not UTC) to avoid timezone shift
    const parseDateLocal = (d) => { const [y, m, day] = d.split("-"); return new Date(y, m - 1, day); };
    const periodFrom = dateRange.from ? fm.date(parseDateLocal(dateRange.from)) : fm.date(sorted[0].start_time);
    const periodTo = dateRange.to ? fm.date(parseDateLocal(dateRange.to)) : fm.date(sorted[sorted.length - 1].start_time);
    const reportDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();

    // ─── HEADER BAR ───
    doc.setFillColor(11, 18, 25);
    doc.rect(0, 0, pageW, 44, "F");
    doc.setTextColor(232, 240, 254);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("NYG LLC", 20, 20);
    doc.setFontSize(8);
    doc.setTextColor(41, 171, 226);
    doc.text("SERVICED AT THE HIGHEST LEVEL", 20, 28);
    doc.setFontSize(16);
    doc.setTextColor(232, 240, 254);
    doc.text("PAY REPORT", pageW - 20, 18, { align: "right" });
    doc.setFontSize(9);
    doc.setTextColor(160, 180, 200);
    doc.text(`Report Generated: ${reportDate}`, pageW - 20, 26, { align: "right" });
    doc.text(`Period: ${periodFrom} - ${periodTo}`, pageW - 20, 33, { align: "right" });

    // ─── WORKER INFO ───
    let y = 54;
    doc.setTextColor(41, 171, 226);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`Worker: ${workerName}`, 20, y);
    y += 7;
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.setFont("helvetica", "normal");
    doc.text(`Project: ${proj?.name || "N/A"}`, 20, y);
    y += 10;

    // ─── ENTRIES TABLE (two rows per entry: data + description) ───
    const tableBody = [];
    sorted.forEach((e, i) => {
      const hrs = parseFloat(fm.hrs(e.duration_ms));
      const rate = getRate(e.worker, e);
      const amount = hrs * rate;
      const rowBg = i % 2 === 0 ? [255, 255, 255] : [245, 247, 250];
      // Data row
      tableBody.push([
        { content: fm.date(e.start_time), styles: { fillColor: rowBg } },
        { content: fm.time(e.start_time), styles: { fillColor: rowBg } },
        { content: fm.time(e.end_time), styles: { fillColor: rowBg } },
        { content: fm.hrs(e.duration_ms), styles: { fillColor: rowBg, halign: "right" } },
        { content: e.work_location ? (e.work_location === "office" ? "Office" : "Home") : "-", styles: { fillColor: rowBg } },
        { content: "$" + rate.toFixed(2) + "/hr", styles: { fillColor: rowBg } },
        { content: "$" + amount.toFixed(2), styles: { fillColor: rowBg, halign: "right", fontStyle: "bold" } },
      ]);
      // Description row (spans all columns)
      tableBody.push([
        { content: e.description || "(no description)", colSpan: 7, styles: { fillColor: rowBg, fontSize: 7, textColor: [100, 100, 100], fontStyle: "italic", cellPadding: { top: 1, bottom: 4, left: 8, right: 8 } } },
      ]);
    });

    autoTable(doc, {
      startY: y,
      head: [["Date", "In", "Out", "Hours", "Location", "Rate", "Amount"]],
      body: tableBody,
      theme: "grid",
      headStyles: { fillColor: [21, 32, 46], textColor: [232, 240, 254], fontSize: 8, fontStyle: "bold", halign: "center" },
      bodyStyles: { fontSize: 8, textColor: [50, 50, 50], halign: "center" },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 22 },
        2: { cellWidth: 22 },
        3: { cellWidth: 18 },
        4: { cellWidth: 20 },
        5: { cellWidth: 22 },
        6: { cellWidth: 24 },
      },
      margin: { left: 16, right: 16 },
    });

    let finalY = doc.lastAutoTable.finalY + 12;

    // ─── Check if summary fits on current page, otherwise add new page ───
    if (finalY > doc.internal.pageSize.getHeight() - 90) {
      doc.addPage();
      finalY = 20;
    }

    // ─── SUMMARY BOX ───
    const boxX = 16, boxW = pageW - 32;
    const boxH = workerFilter === "all" ? 82 + Object.keys(summary.byWorker).length * 10 : 72;
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(boxX, finalY, boxW, boxH, 3, 3, "F");
    doc.setDrawColor(41, 171, 226);
    doc.setLineWidth(0.5);
    doc.line(boxX, finalY, boxX + boxW, finalY);

    let sy = finalY + 14;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(21, 32, 46);
    doc.text("SUMMARY", boxX + 12, sy);
    sy += 12;

    const col1 = boxX + 12, col2 = boxX + boxW - 12;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);

    // Worker breakdown (if showing all workers)
    if (workerFilter === "all" && Object.keys(summary.byWorker).length > 1) {
      Object.entries(summary.byWorker).forEach(([worker, data]) => {
        doc.text(`${worker}: ${fm.hrs(data.ms)} hrs`, col1, sy);
        doc.setFont("helvetica", "bold");
        doc.text(fm.money(data.pay), col2, sy, { align: "right" });
        doc.setFont("helvetica", "normal");
        sy += 10;
      });
      doc.setDrawColor(200, 200, 200);
      doc.line(col1, sy - 4, col2, sy - 4);
    }

    // Totals
    doc.text(`Total Hours:`, col1, sy);
    doc.setFont("helvetica", "bold");
    doc.text(fm.hrs(summary.totalMs) + " hrs", col2, sy, { align: "right" });
    sy += 10;

    doc.setFont("helvetica", "normal");
    doc.text("Subtotal:", col1, sy);
    doc.setFont("helvetica", "bold");
    doc.text(fm.money(summary.totalPay), col2, sy, { align: "right" });
    sy += 10;

    const getTax = summary.totalPay * 0.04712;
    doc.setFont("helvetica", "normal");
    doc.text("GET Tax (4.712%):", col1, sy);
    doc.text(fm.money(getTax), col2, sy, { align: "right" });
    sy += 12;

    // Total due - big and green
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 150, 76);
    doc.text("TOTAL DUE:", col1, sy);
    doc.text(fm.money(summary.totalPay + getTax), col2, sy, { align: "right" });

    // ─── FOOTER ───
    const footerY = doc.internal.pageSize.getHeight() - 12;
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "normal");
    doc.text("NYG LLC | Serviced at the Highest Level | This report was generated from the NYG Time Tracker system.", pageW / 2, footerY, { align: "center" });

    // ─── FILENAME ───
    const workerShort = workerFilter === "all" ? "All" : workerFilter.split(" ")[0];
    const dateStr = new Date().toISOString().split("T")[0];
    doc.save(`NYG-PayReport-${workerShort}-${periodFrom.replace(/[^a-zA-Z0-9]/g, "")}-to-${periodTo.replace(/[^a-zA-Z0-9]/g, "")}-${dateStr}.pdf`);
  };

  return (
    <div>
      {/* Filters */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.accent }}>Admin Panel</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={downloadReport} style={btnStyle(C.orange)}>Print Report</button>
            <button onClick={openManual} style={btnStyle(C.green, C.greenGlow)}>+ Add Entry</button>
            <button onClick={openRates} style={btnStyle(C.accent, C.glowSm)}>Rates</button>
            <button onClick={() => exportCSV(displayEntries, (e) => getRate(e.worker, e), proj?.name || "admin-export")} style={{ ...btnStyle("transparent"), border: `1px solid ${C.green}`, color: C.green }}>Export CSV</button>
          </div>
        </div>

        {/* Worker Filter */}
        <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          <div style={lblStyle}>Worker</div>
          {["all", ...WORKERS].map(w => (
            <button key={w} onClick={() => setWorkerFilter(w)} style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: workerFilter === w ? C.accent : "transparent",
              color: workerFilter === w ? "#fff" : C.dim,
              border: `1px solid ${workerFilter === w ? C.accent : C.border}`,
            }}>
              {w === "all" ? "All Workers" : w.split(" ")[0]}
            </button>
          ))}
        </div>

        {/* Date Range */}
        <DateRangeFilter onFilter={setDateRange} C={C} />
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }} className="stats-grid">
        <div style={cardStyle}>
          <div style={{ ...lblStyle, marginBottom: 6 }}>TOTAL HOURS</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: C.accent }}>{fm.hrs(summary.totalMs)}</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>{displayEntries.length} entries</div>
        </div>
        <div style={cardStyle}>
          <div style={{ ...lblStyle, marginBottom: 6 }}>TOTAL PAY</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: C.orange }}>{fm.money(summary.totalPay)}</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>before GET tax</div>
        </div>
        <div style={cardStyle}>
          <div style={{ ...lblStyle, marginBottom: 6 }}>WITH GET TAX</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: C.green }}>{fm.money(summary.totalPay * 1.04712)}</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>4.712% GET</div>
        </div>
      </div>

      {/* Worker Breakdown */}
      {Object.keys(summary.byWorker).length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Worker Breakdown</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {Object.entries(summary.byWorker).map(([worker, data]) => (
              <div key={worker} style={{ background: C.bg, borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 4 }}>{worker}</div>
                <div style={{ fontSize: 12, color: C.dim }}>
                  {fm.hrs(data.ms)} hrs | {fm.money(data.pay)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      {Object.keys(summary.byCategory).length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Category Breakdown</div>
          {Object.entries(summary.byCategory).sort((a, b) => b[1].ms - a[1].ms).map(([cat, data]) => (
            <div key={cat} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}22`, fontSize: 13 }}>
              <span style={{ color: C.white }}>{cat}</span>
              <span style={{ color: C.dim }}>{fm.hrs(data.ms)} hrs | {fm.money(data.pay)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Chloe Rate Info */}
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Chloe Rate Info</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
          <div>
            <div style={{ color: C.dim, marginBottom: 4 }}>Probation Status</div>
            <div style={{ color: probationRemaining > 0 ? C.orange : C.green, fontWeight: 700 }}>
              {probationRemaining > 0 ? `${probationRemaining} days remaining` : "Probation complete"}
            </div>
          </div>
          <div>
            <div style={{ color: C.dim, marginBottom: 4 }}>Probation End Date</div>
            <div style={{ color: C.white, fontWeight: 600 }}>{fm.date(probationEnd)}</div>
          </div>
          <div>
            <div style={{ color: C.dim, marginBottom: 4 }}>Current Office Rate</div>
            <div style={{ color: C.accent, fontWeight: 700 }}>{fm.money(getChloeRate("office"))}/hr</div>
          </div>
          <div>
            <div style={{ color: C.dim, marginBottom: 4 }}>Current Home Rate</div>
            <div style={{ color: C.accent, fontWeight: 700 }}>{fm.money(getChloeRate("home"))}/hr</div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 14 }}>
        <SearchBar entries={filtered} onFilter={setSearchFiltered} C={C} />
      </div>

      {/* Entries Table */}
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
        Entries ({displayEntries.length})
      </div>

      {displayEntries.length === 0 && (
        <div style={{ color: C.dim, textAlign: "center", padding: 40 }}>No entries found for this filter.</div>
      )}

      {displayEntries.slice().sort((a, b) => new Date(b.start_time) - new Date(a.start_time)).map(e => (
        <div key={e.id} style={{ ...cardStyle, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{e.description}</div>
            <div style={{ fontSize: 12, color: C.dim }}>{fm.date(e.start_time)} | {fm.time(e.start_time)} - {fm.time(e.end_time)}</div>
            <div style={{ fontSize: 12, color: C.dim, marginBottom: 4 }}>
              {e.worker} | {fm.money(getRate(e.worker, e))}/hr
              {e.work_location ? ` | ${e.work_location === "office" ? "Office" : "Home"}` : ""}
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: `${C.accent}22`, color: C.accent }}>{e.category}</span>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.accent }}>{fm.hrs(e.duration_ms)}h</div>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{fm.money(parseFloat(fm.hrs(e.duration_ms)) * getRate(e.worker, e))}</div>
            <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
              <button onClick={() => onEditEntry(e)} style={{ fontSize: 11, color: C.accent, background: "none", border: `1px solid ${C.accent}44`, borderRadius: 4, padding: "2px 10px", cursor: "pointer" }}>Edit</button>
              <button onClick={() => onDeleteEntry(e.id)} style={{ fontSize: 11, color: C.red, background: "none", border: `1px solid ${C.red}44`, borderRadius: 4, padding: "2px 10px", cursor: "pointer" }}>Delete</button>
            </div>
          </div>
        </div>
      ))}

      {/* Manual Entry Modal */}
      {manualOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={(e) => e.target === e.currentTarget && setManualOpen(false)}>
          <div style={{ ...cardStyle, maxWidth: 500, width: "100%", boxShadow: C.glow, margin: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.accent, marginBottom: 16 }}>Add Entry (Admin)</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <div style={lblStyle}>Worker</div>
                <select value={manualForm.worker} onChange={e => setManualForm({ ...manualForm, worker: e.target.value, location: e.target.value === "Chloe Mello" ? "office" : undefined })} style={selectStyle}>
                  {WORKERS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div>
                <div style={lblStyle}>Category</div>
                <select value={manualForm.cat} onChange={e => setManualForm({ ...manualForm, cat: e.target.value })} style={selectStyle}>
                  {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <div style={lblStyle}>Date</div>
                <input type="date" value={manualForm.date} onChange={e => setManualForm({ ...manualForm, date: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <div style={lblStyle}>Start</div>
                <input type="time" value={manualForm.st} onChange={e => setManualForm({ ...manualForm, st: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <div style={lblStyle}>End</div>
                <input type="time" value={manualForm.et} onChange={e => setManualForm({ ...manualForm, et: e.target.value })} style={inputStyle} />
              </div>
            </div>

            {manualForm.worker === "Chloe Mello" && (
              <div style={{ marginBottom: 12 }}>
                <div style={lblStyle}>Work Location</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {["office", "home"].map(loc => (
                    <button key={loc} onClick={() => setManualForm({ ...manualForm, location: loc })} style={{
                      padding: "12px 10px", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer",
                      border: manualForm.location === loc ? `2px solid ${C.accent}` : `2px solid ${C.border}`,
                      background: manualForm.location === loc ? `${C.accent}22` : C.input,
                      color: manualForm.location === loc ? C.accent : C.dim,
                    }}>
                      {loc === "office" ? "Office" : "Home"}
                      <br /><span style={{ fontSize: 11, fontWeight: 400 }}>{fm.money(getChloeRate(loc, manualForm.date))}/hr</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <div style={lblStyle}>Description (required)</div>
              <textarea value={manualForm.desc} onChange={e => setManualForm({ ...manualForm, desc: e.target.value })} placeholder="What was worked on?" rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "system-ui" }} />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={saveManual} disabled={!manualForm.desc?.trim()} style={{ ...btnStyle(C.green, C.greenGlow), flex: 1, opacity: manualForm.desc?.trim() ? 1 : 0.5 }}>Save Entry</button>
              <button onClick={() => setManualOpen(false)} style={btnStyle(C.card2)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Rates Modal */}
      {ratesOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={(e) => e.target === e.currentTarget && setRatesOpen(false)}>
          <div style={{ ...cardStyle, maxWidth: 400, width: "100%", boxShadow: C.glow, margin: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.accent, marginBottom: 16 }}>Project Rates</div>
            <div style={{ fontSize: 13, color: C.dim, marginBottom: 14 }}>{proj?.name}</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div>
                <div style={lblStyle}>Justin ($/hr)</div>
                <input type="number" value={rateForm.jRate || ""} onChange={e => setRateForm({ ...rateForm, jRate: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <div style={lblStyle}>Sam ($/hr)</div>
                <input type="number" value={rateForm.sRate || ""} onChange={e => setRateForm({ ...rateForm, sRate: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <div style={lblStyle}>Chloe ($/hr)</div>
                <input type="number" value={rateForm.cRate || ""} onChange={e => setRateForm({ ...rateForm, cRate: e.target.value })} style={inputStyle} />
              </div>
            </div>

            <div style={{ fontSize: 11, color: C.dim, marginBottom: 14 }}>
              Note: Chloe's actual rate is calculated per-entry based on probation status and location.
              The rate above is a base reference only.
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={saveRates} disabled={saving} style={{ ...btnStyle(C.accent, C.glowSm), flex: 1 }}>{saving ? "Saving..." : "Save Rates"}</button>
              <button onClick={() => setRatesOpen(false)} style={btnStyle(C.card2)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
