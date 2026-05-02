import { useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const GET_RATE = 0.04712;

// ── PaymentStatusBadge ──────────────────────────────────────────────────────
// Cycles: unpaid -> partial -> paid -> unpaid
export function PaymentStatusBadge({ status, onClick, C }) {
  const CYCLE = ["unpaid", "partial", "paid"];

  const config = {
    paid:    { label: "Paid",    color: C.green,  glow: C.greenGlow },
    unpaid:  { label: "Unpaid",  color: C.red,    glow: C.redGlow },
    partial: { label: "Partial", color: C.orange, glow: "0 0 15px rgba(255,183,77,0.3)" },
  };

  const key = (status || "unpaid").toLowerCase();
  const cfg = config[key] || config.unpaid;

  const handleClick = () => {
    if (!onClick) return;
    const idx = CYCLE.indexOf(key);
    const next = CYCLE[(idx + 1) % CYCLE.length];
    onClick(next);
  };

  return (
    <span
      onClick={handleClick}
      title="Click to change status"
      style={{
        display: "inline-block",
        padding: "4px 12px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        background: `${cfg.color}22`,
        color: cfg.color,
        border: `1px solid ${cfg.color}55`,
        boxShadow: cfg.glow,
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        transition: "all 0.2s",
      }}
    >
      {cfg.label}
    </span>
  );
}

// ── InvoiceHistory ──────────────────────────────────────────────────────────
// Props: { invoices, onStatusChange, fm, C }
// invoices: [{ id, weekOf, generatedAt, amount, status, pdfUrl }]
export function InvoiceHistory({ invoices = [], onStatusChange, fm, C }) {
  const outstanding = invoices
    .filter(inv => (inv.status || "unpaid").toLowerCase() !== "paid")
    .reduce((sum, inv) => {
      const key = (inv.status || "unpaid").toLowerCase();
      // Partial counts full amount as outstanding (conservative)
      return sum + (inv.amount || 0);
    }, 0);

  const thStyle = {
    padding: "10px 14px",
    fontSize: 11,
    fontWeight: 700,
    color: C.dim,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    borderBottom: `1px solid ${C.border}`,
    textAlign: "left",
    whiteSpace: "nowrap",
  };

  const tdStyle = {
    padding: "12px 14px",
    fontSize: 13,
    color: C.white,
    borderBottom: `1px solid ${C.border}22`,
    verticalAlign: "middle",
  };

  return (
    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
      {/* Outstanding balance banner */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 20px",
          background: C.card2,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: C.dim, textTransform: "uppercase", letterSpacing: 0.8 }}>
          Invoice History
        </span>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 2 }}>Outstanding Balance</div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: outstanding > 0 ? C.red : C.green,
              textShadow: outstanding > 0 ? C.redGlow : C.greenGlow,
            }}
          >
            {fm.money(outstanding)}
          </div>
        </div>
      </div>

      {invoices.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: C.dim, fontSize: 14 }}>
          No invoices yet.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
            <thead>
              <tr>
                <th style={thStyle}>Week Of</th>
                <th style={thStyle}>Generated</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {[...invoices]
                .sort((a, b) => new Date(b.weekOf) - new Date(a.weekOf))
                .map(inv => (
                  <tr
                    key={inv.id}
                    style={{ transition: "background 0.15s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = `${C.card2}`)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600 }}>{fm.date(inv.weekOf)}</span>
                    </td>
                    <td style={{ ...tdStyle, color: C.dim, fontSize: 12 }}>
                      {fm.date(inv.generatedAt)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {fm.money(inv.amount)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <PaymentStatusBadge
                        status={inv.status}
                        C={C}
                        onClick={onStatusChange ? (next) => onStatusChange(inv.id, next) : null}
                      />
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      {inv.pdfUrl ? (
                        <a
                          href={inv.pdfUrl}
                          download
                          style={{
                            display: "inline-block",
                            padding: "5px 14px",
                            background: `${C.accent}22`,
                            color: C.accent,
                            border: `1px solid ${C.accent}44`,
                            borderRadius: 7,
                            fontSize: 11,
                            fontWeight: 700,
                            textDecoration: "none",
                            letterSpacing: 0.3,
                            transition: "all 0.2s",
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = `${C.accent}44`;
                            e.currentTarget.style.boxShadow = C.glowSm;
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = `${C.accent}22`;
                            e.currentTarget.style.boxShadow = "none";
                          }}
                        >
                          PDF
                        </a>
                      ) : (
                        <span style={{ fontSize: 11, color: C.dim }}>N/A</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── RateHistory ─────────────────────────────────────────────────────────────
// Props: { changes, fm, C }
// changes: [{ date, worker, oldRate, newRate, reason }]
export function RateHistory({ changes = [], fm, C }) {
  const sorted = [...changes].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
      <div
        style={{
          padding: "14px 20px",
          background: C.card2,
          borderBottom: `1px solid ${C.border}`,
          fontSize: 13,
          fontWeight: 600,
          color: C.dim,
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        Rate History
      </div>

      {sorted.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: C.dim, fontSize: 14 }}>
          No rate changes recorded.
        </div>
      ) : (
        <div style={{ padding: "8px 0" }}>
          {sorted.map((change, idx) => {
            const isFirst = idx === 0;
            const nextChange = sorted[idx + 1];
            const effectiveThrough = nextChange
              ? `through ${fm.date(new Date(nextChange.date).getTime() - 86400000)}`
              : "present";

            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  gap: 16,
                  padding: "14px 20px",
                  borderBottom: idx < sorted.length - 1 ? `1px solid ${C.border}22` : "none",
                  alignItems: "flex-start",
                }}
              >
                {/* Timeline dot */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 20 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: isFirst ? C.accent : C.dim,
                      boxShadow: isFirst ? C.glowSm : "none",
                      marginTop: 4,
                      flexShrink: 0,
                    }}
                  />
                  {idx < sorted.length - 1 && (
                    <div style={{ width: 1, flex: 1, background: `${C.border}`, minHeight: 20, marginTop: 4 }} />
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: C.white }}>{change.worker}</span>
                    <span style={{ fontSize: 11, color: C.dim }}>{fm.date(change.date)}</span>
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: 12,
                        color: C.dim,
                        textDecoration: "line-through",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      ${change.oldRate}/hr
                    </span>
                    <span style={{ fontSize: 13, color: C.dim }}>→</span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: change.newRate > change.oldRate ? C.green : C.red,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      ${change.newRate}/hr
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: C.dim,
                        background: `${C.border}55`,
                        padding: "2px 8px",
                        borderRadius: 10,
                      }}
                    >
                      {fm.date(change.date)} &mdash; {effectiveThrough}
                    </span>
                  </div>

                  {change.reason && (
                    <div style={{ marginTop: 5, fontSize: 12, color: C.dim, fontStyle: "italic" }}>
                      {change.reason}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── generateMultiProjectPDF ─────────────────────────────────────────────────
// Named export. Generates a single PDF with per-project sections and a grand total.
// projects: array of project objects (must have .name, .j_rate, .s_rate)
// entriesByProject: { [projectId]: [entry, ...] }
// fm: formatter object (same as TimeTracker fm)
// getRate: (worker, entry) => number  -- the per-entry rate function from the app
export function generateMultiProjectPDF(projects, entriesByProject, fm, getRate) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();

  let grandSubtotal = 0;
  let isFirstPage = true;

  for (const proj of projects) {
    const entries = (entriesByProject[proj.id] || []).sort(
      (a, b) => new Date(a.start_time) - new Date(b.start_time)
    );
    if (entries.length === 0) continue;

    if (!isFirstPage) {
      doc.addPage();
    }
    isFirstPage = false;

    // ── Header bar ──
    doc.setFillColor(11, 18, 25);
    doc.rect(0, 0, pageW, 40, "F");
    doc.setTextColor(232, 240, 254);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("NYG LLC", 20, 22);
    doc.setFontSize(8);
    doc.setTextColor(41, 171, 226);
    doc.text("SERVICED AT THE HIGHEST LEVEL", 20, 30);

    // Invoice meta (top right)
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("MULTI-PROJECT INVOICE", pageW - 20, 16, { align: "right" });
    doc.setFontSize(9);
    doc.text(`Generated: ${fm.date(new Date())}`, pageW - 20, 29, { align: "right" });

    // ── Project name heading ──
    doc.setTextColor(41, 171, 226);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(proj.name, 20, 52);

    // ── Entry table ──
    const tableData = entries.map(e => [
      fm.date(e.start_time),
      e.worker.split(" ")[0],
      fm.hrs(e.duration_ms),
      fm.money(getRate(e.worker, e)) + "/hr",
      e.work_location ? (e.work_location === "office" ? "Office" : "Home") : "-",
      e.category || "-",
      (e.description || "").length > 40
        ? e.description.substring(0, 37) + "..."
        : e.description || "-",
    ]);

    autoTable(doc, {
      startY: 58,
      head: [["Date", "Worker", "Hours", "Rate", "Location", "Category", "Description"]],
      body: tableData,
      theme: "grid",
      headStyles: {
        fillColor: [21, 32, 46],
        textColor: [232, 240, 254],
        fontSize: 8,
        fontStyle: "bold",
      },
      bodyStyles: { fontSize: 8, textColor: [60, 60, 60] },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 18 },
        2: { cellWidth: 14, halign: "right" },
        3: { cellWidth: 20 },
        4: { cellWidth: 18 },
        5: { cellWidth: 24 },
        6: { cellWidth: "auto" },
      },
      margin: { left: 20, right: 20 },
    });

    const finalY = doc.lastAutoTable.finalY + 10;

    // ── Per-project subtotal box ──
    // Calculate worker amounts for this project
    const workerAmounts = {};
    const workerMs = {};

    for (const e of entries) {
      const worker = e.worker;
      const rate = getRate(worker, e);
      const hrs = Math.ceil(e.duration_ms / 60000) / 60;
      const amount = hrs * rate;
      workerAmounts[worker] = (workerAmounts[worker] || 0) + amount;
      workerMs[worker] = (workerMs[worker] || 0) + e.duration_ms;
    }

    const projSubtotal = Object.values(workerAmounts).reduce((s, a) => s + a, 0);
    const projGet = projSubtotal * GET_RATE;
    const projTotal = projSubtotal + projGet;
    grandSubtotal += projSubtotal;

    const workers = Object.keys(workerAmounts).sort();
    const boxHeight = 24 + workers.length * 8 + 22;

    doc.setFillColor(245, 247, 250);
    doc.roundedRect(20, finalY, pageW - 40, boxHeight, 3, 3, "F");

    const col1 = 30, col2 = pageW - 30;
    let y = finalY + 12;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);

    for (const worker of workers) {
      const hrs = (Math.ceil(workerMs[worker] / 60000) / 60).toFixed(2);
      doc.text(`${worker.split(" ")[0]} ${worker.split(" ").slice(-1)[0]}: ${hrs} hrs`, col1, y);
      doc.text(fm.money(workerAmounts[worker]), col2, y, { align: "right" });
      y += 8;
    }

    doc.setDrawColor(200, 200, 200);
    doc.line(col1, y - 3, col2, y - 3);
    doc.text("Project Subtotal:", col1, y);
    doc.text(fm.money(projSubtotal), col2, y, { align: "right" });
    y += 8;
    doc.text("GET (4.712%):", col1, y);
    doc.text(fm.money(projGet), col2, y, { align: "right" });
    y += 10;

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 150, 76);
    doc.text("PROJECT TOTAL:", col1, y);
    doc.text(fm.money(projTotal), col2, y, { align: "right" });

    // ── Page footer ──
    const footerY = doc.internal.pageSize.getHeight() - 15;
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "normal");
    doc.text("NYG LLC | Serviced at the Highest Level", pageW / 2, footerY, { align: "center" });
  }

  // ── Grand Total page ──
  doc.addPage();

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
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("INVOICE SUMMARY", pageW - 20, 16, { align: "right" });
  doc.setFontSize(9);
  doc.text(`Generated: ${fm.date(new Date())}`, pageW - 20, 29, { align: "right" });

  // Section heading
  doc.setTextColor(41, 171, 226);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Grand Total Summary", 20, 52);

  // Per-project summary table
  const summaryRows = projects
    .filter(p => entriesByProject[p.id]?.length > 0)
    .map(proj => {
      const entries = entriesByProject[proj.id] || [];
      const projSubtotal = entries.reduce((sum, e) => {
        const rate = getRate(e.worker, e);
        return sum + (Math.ceil(e.duration_ms / 60000) / 60) * rate;
      }, 0);
      const projTotal = projSubtotal * (1 + GET_RATE);
      return [proj.name, fm.money(projSubtotal), fm.money(projSubtotal * GET_RATE), fm.money(projTotal)];
    });

  autoTable(doc, {
    startY: 58,
    head: [["Project", "Subtotal", "GET (4.712%)", "Total"]],
    body: summaryRows,
    theme: "grid",
    headStyles: {
      fillColor: [21, 32, 46],
      textColor: [232, 240, 254],
      fontSize: 9,
      fontStyle: "bold",
    },
    bodyStyles: { fontSize: 9, textColor: [60, 60, 60] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 35, halign: "right" },
      2: { cellWidth: 35, halign: "right" },
      3: { cellWidth: 35, halign: "right" },
    },
    margin: { left: 20, right: 20 },
  });

  const summaryFinalY = doc.lastAutoTable.finalY + 16;
  const grandGet = grandSubtotal * GET_RATE;
  const grandTotal = grandSubtotal + grandGet;

  // Grand total box
  doc.setFillColor(21, 32, 46);
  doc.roundedRect(20, summaryFinalY, pageW - 40, 56, 4, 4, "F");

  const col1 = 30, col2 = pageW - 30;
  let y = summaryFinalY + 14;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 200, 220);
  doc.text("Combined Subtotal:", col1, y);
  doc.text(fm.money(grandSubtotal), col2, y, { align: "right" });
  y += 10;
  doc.text("GET (4.712%):", col1, y);
  doc.text(fm.money(grandGet), col2, y, { align: "right" });
  y += 4;

  doc.setDrawColor(41, 171, 226);
  doc.setLineWidth(0.5);
  doc.line(col1, y, col2, y);
  y += 10;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 230, 118);
  doc.text("GRAND TOTAL DUE:", col1, y);
  doc.text(fm.money(grandTotal), col2, y, { align: "right" });

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 15;
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.setFont("helvetica", "normal");
  doc.text("NYG LLC | Serviced at the Highest Level", pageW / 2, footerY, { align: "center" });

  doc.save(`NYG-MultiProject-Invoice-${new Date().toISOString().slice(0, 10)}.pdf`);
}
