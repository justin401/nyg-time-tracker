import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// ============================================================
// 1. HeatMap - GitHub-style calendar heat map (last 90 days)
// ============================================================
export function HeatMap({ entries, C }) {
  const [tooltip, setTooltip] = useState(null);

  const { grid, months } = useMemo(() => {
    const now = new Date();
    const dayMs = 86400000;
    const days = 90;

    // Build a map of date -> total hours
    const hoursByDate = {};
    (entries || []).forEach(e => {
      const d = new Date(e.start_time);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      hoursByDate[key] = (hoursByDate[key] || 0) + (e.duration_ms || 0) / 3600000;
    });

    // Generate 90 days of cells
    const cells = [];
    const startDate = new Date(now.getTime() - (days - 1) * dayMs);
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate.getTime() + i * dayMs);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const hours = hoursByDate[key] || 0;
      cells.push({ date: d, key, hours, dayOfWeek: d.getDay() });
    }

    // Arrange into columns (weeks). Each column is 7 rows (Sun-Sat).
    const weeks = [];
    let currentWeek = new Array(7).fill(null);
    cells.forEach(cell => {
      if (cell.dayOfWeek === 0 && currentWeek.some(c => c !== null)) {
        weeks.push(currentWeek);
        currentWeek = new Array(7).fill(null);
      }
      currentWeek[cell.dayOfWeek] = cell;
    });
    if (currentWeek.some(c => c !== null)) weeks.push(currentWeek);

    // Month labels
    const monthLabels = [];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let lastMonth = -1;
    weeks.forEach((week, wi) => {
      const firstCell = week.find(c => c !== null);
      if (firstCell) {
        const m = firstCell.date.getMonth();
        if (m !== lastMonth) {
          monthLabels.push({ col: wi, label: monthNames[m] });
          lastMonth = m;
        }
      }
    });

    return { grid: weeks, months: monthLabels };
  }, [entries]);

  const getOpacity = (hours) => {
    if (hours === 0) return 0.08;
    if (hours < 1) return 0.2;
    if (hours < 2) return 0.35;
    if (hours < 4) return 0.6;
    return 0.9;
  };

  const cellSize = 14;
  const cellGap = 3;
  const leftPad = 0;
  const topPad = 18;

  return (
    <div style={{ position: 'relative', overflowX: 'auto' }}>
      <svg
        width={leftPad + grid.length * (cellSize + cellGap) + cellGap}
        height={topPad + 7 * (cellSize + cellGap) + cellGap}
        style={{ display: 'block' }}
      >
        {/* Month labels */}
        {months.map((m, i) => (
          <text
            key={i}
            x={leftPad + m.col * (cellSize + cellGap)}
            y={12}
            fill={C.dim}
            fontSize={10}
            fontFamily="inherit"
          >
            {m.label}
          </text>
        ))}

        {/* Day cells */}
        {grid.map((week, wi) =>
          week.map((cell, di) => {
            if (!cell) return null;
            const x = leftPad + wi * (cellSize + cellGap);
            const y = topPad + di * (cellSize + cellGap);
            return (
              <rect
                key={cell.key}
                x={x}
                y={y}
                width={cellSize}
                height={cellSize}
                rx={3}
                fill={C.accent}
                opacity={getOpacity(cell.hours)}
                style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
                onMouseEnter={(e) => {
                  const rect = e.target.getBoundingClientRect();
                  setTooltip({
                    x: rect.left + rect.width / 2,
                    y: rect.top - 8,
                    date: cell.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                    hours: cell.hours
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })
        )}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
            background: C.card2 || C.bg2,
            color: C.white,
            padding: '4px 8px',
            borderRadius: 6,
            fontSize: 11,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 999,
            border: `1px solid ${C.border}`,
            boxShadow: C.glowSm || 'none',
          }}
        >
          <div>{tooltip.date}</div>
          <div style={{ color: C.accent }}>{tooltip.hours.toFixed(1)}h logged</div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 2. TrendChart - Pure SVG line chart (no chart library)
// ============================================================
export function TrendChart({ entries, days = 30, C }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(500);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const { points, maxHours, dateLabels, yLabels } = useMemo(() => {
    const dayMs = 86400000;
    const now = new Date();
    const hoursByDate = {};

    (entries || []).forEach(e => {
      const d = new Date(e.start_time);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      hoursByDate[key] = (hoursByDate[key] || 0) + (e.duration_ms || 0) / 3600000;
    });

    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * dayMs);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      data.push({ date: d, hours: hoursByDate[key] || 0 });
    }

    const max = Math.max(1, ...data.map(d => d.hours));
    const roundedMax = Math.ceil(max);

    // Generate y-axis labels
    const yCount = Math.min(roundedMax, 5);
    const yStep = roundedMax / yCount;
    const yLbls = [];
    for (let i = 0; i <= yCount; i++) {
      yLbls.push(Math.round(i * yStep * 10) / 10);
    }

    // Generate date labels (show ~5-6)
    const step = Math.max(1, Math.floor(days / 5));
    const dLbls = [];
    for (let i = 0; i < data.length; i += step) {
      dLbls.push({ index: i, label: data[i].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) });
    }

    return { points: data, maxHours: roundedMax, dateLabels: dLbls, yLabels: yLbls };
  }, [entries, days]);

  const h = 180;
  const padLeft = 36;
  const padRight = 10;
  const padTop = 10;
  const padBottom = 24;
  const chartW = width - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  const getX = (i) => padLeft + (i / (points.length - 1 || 1)) * chartW;
  const getY = (hrs) => padTop + chartH - (hrs / (maxHours || 1)) * chartH;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${getX(i).toFixed(1)},${getY(p.hours).toFixed(1)}`).join(' ');
  const areaPath = linePath + ` L${getX(points.length - 1).toFixed(1)},${(padTop + chartH).toFixed(1)} L${padLeft},${(padTop + chartH).toFixed(1)} Z`;

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg width={width} height={h} style={{ display: 'block' }}>
        {/* Horizontal grid lines */}
        {yLabels.map((val, i) => {
          const y = getY(val);
          return (
            <g key={i}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke={C.border} strokeWidth={0.5} />
              <text x={padLeft - 6} y={y + 3} fill={C.dim} fontSize={9} textAnchor="end" fontFamily="inherit">
                {val}h
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill={C.accent} opacity={0.1} />

        {/* Line */}
        <path d={linePath} fill="none" stroke={C.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* Data points */}
        {points.map((p, i) => (
          <circle key={i} cx={getX(i)} cy={getY(p.hours)} r={p.hours > 0 ? 3 : 0} fill={C.accent} />
        ))}

        {/* X-axis labels */}
        {dateLabels.map(({ index, label }) => (
          <text key={index} x={getX(index)} y={h - 4} fill={C.dim} fontSize={9} textAnchor="middle" fontFamily="inherit">
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ============================================================
// 3. ComparisonCards - Current week vs previous week
// ============================================================
export function ComparisonCards({ entries, fm, C }) {
  const { hoursDiff, earningsDiff, currHours, prevHours, currEarnings, prevEarnings } = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const dayMs = 86400000;

    // Current week start (Monday)
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
    const lastMonday = new Date(thisMonday.getTime() - 7 * dayMs);

    let currH = 0, prevH = 0, currE = 0, prevE = 0;

    (entries || []).forEach(e => {
      const d = new Date(e.start_time);
      const hrs = (e.duration_ms || 0) / 3600000;
      const rate = e.rate || 0;

      if (d >= thisMonday) {
        currH += hrs;
        currE += hrs * rate;
      } else if (d >= lastMonday && d < thisMonday) {
        prevH += hrs;
        prevE += hrs * rate;
      }
    });

    return {
      hoursDiff: currH - prevH,
      earningsDiff: currE - prevE,
      currHours: currH,
      prevHours: prevH,
      currEarnings: currE,
      prevEarnings: prevE,
    };
  }, [entries]);

  const Arrow = ({ up }) => (
    <span style={{ color: up ? C.green : C.red, fontSize: 16, marginRight: 4 }}>
      {up ? '\u25B2' : '\u25BC'}
    </span>
  );

  const cardStyle = {
    flex: 1,
    background: C.card2 || C.bg2,
    borderRadius: 10,
    padding: '12px 16px',
    border: `1px solid ${C.border}`,
  };

  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={cardStyle}>
        <div style={{ color: C.dim, fontSize: 11, marginBottom: 6 }}>Hours vs last week</div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Arrow up={hoursDiff >= 0} />
          <span style={{ color: C.white, fontSize: 20, fontWeight: 600 }}>
            {fm.hrs(Math.abs(hoursDiff))}
          </span>
        </div>
        <div style={{ color: C.dim, fontSize: 11, marginTop: 4 }}>
          {fm.hrs(currHours)} this week / {fm.hrs(prevHours)} last week
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ color: C.dim, fontSize: 11, marginBottom: 6 }}>Earnings vs last week</div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Arrow up={earningsDiff >= 0} />
          <span style={{ color: C.white, fontSize: 20, fontWeight: 600 }}>
            {fm.money(Math.abs(earningsDiff))}
          </span>
        </div>
        <div style={{ color: C.dim, fontSize: 11, marginTop: 4 }}>
          {fm.money(currEarnings)} this week / {fm.money(prevEarnings)} last week
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 4. EarningsForecast - Weekly invoice projection
// ============================================================
export function EarningsForecast({ entries, getRate, fm, C }) {
  const { earned, projected, daysLeft, avgDaily } = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const dayMs = 86400000;

    // Monday of current week
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);

    // Days elapsed this week (including today)
    const elapsed = mondayOffset + 1;
    const remaining = 7 - elapsed;

    let weekEarnings = 0;
    let weekDaysWithWork = new Set();

    (entries || []).forEach(e => {
      const d = new Date(e.start_time);
      if (d >= thisMonday) {
        const hrs = (e.duration_ms || 0) / 3600000;
        const rate = e.rate || (getRate ? getRate(e) : 0);
        weekEarnings += hrs * rate;
        const dayKey = d.toDateString();
        weekDaysWithWork.add(dayKey);
      }
    });

    const workedDays = Math.max(1, weekDaysWithWork.size);
    const avg = weekEarnings / workedDays;
    const proj = weekEarnings + avg * remaining;

    return { earned: weekEarnings, projected: proj, daysLeft: remaining, avgDaily: avg };
  }, [entries, getRate]);

  return (
    <div style={{
      background: C.card2 || C.bg2,
      borderRadius: 10,
      padding: '14px 18px',
      border: `1px solid ${C.border}`,
    }}>
      <div style={{ color: C.dim, fontSize: 11, marginBottom: 8 }}>Weekly Invoice Projection</div>
      <div style={{ color: C.accent, fontSize: 26, fontWeight: 700 }}>
        ~{fm.money(projected)}
      </div>
      <div style={{ color: C.dim, fontSize: 11, marginTop: 6 }}>
        {fm.money(earned)} earned so far &middot; {daysLeft} day{daysLeft !== 1 ? 's' : ''} left &middot; ~{fm.money(avgDaily)}/day avg
      </div>
    </div>
  );
}

// ============================================================
// 5. LiveBadge - Realtime who's clocked in via Supabase
// ============================================================
export function LiveBadge({ supabase, C }) {
  const [clockedIn, setClockedIn] = useState([]);
  const intervalRef = useRef(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!supabase) return;

    // Initial fetch
    const fetchStatus = async () => {
      const { data } = await supabase
        .from('clock_status')
        .select('*')
        .eq('status', 'in');
      if (data) setClockedIn(data);
    };

    fetchStatus();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('clock_status_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clock_status' }, () => {
        fetchStatus();
      })
      .subscribe();

    // Tick every second for elapsed time updates
    intervalRef.current = setInterval(() => setTick(t => t + 1), 1000);

    return () => {
      channel.unsubscribe();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [supabase]);

  const formatElapsed = useCallback((startTime) => {
    const elapsed = Date.now() - new Date(startTime).getTime();
    const totalSec = Math.floor(elapsed / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }, []);

  const dotStyle = {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: C.green,
    boxShadow: C.greenGlow || `0 0 6px ${C.green}`,
    display: 'inline-block',
    marginRight: 8,
    animation: 'pulse 2s infinite',
  };

  if (clockedIn.length === 0) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        background: C.card2 || C.bg2,
        borderRadius: 8,
        border: `1px solid ${C.border}`,
        fontSize: 13,
        color: C.dim,
      }}>
        <span style={{ ...dotStyle, background: C.dim, boxShadow: 'none', opacity: 0.4 }} />
        No one on the clock
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {clockedIn.map(person => (
        <div
          key={person.id || person.user_id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            background: C.card2 || C.bg2,
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            fontSize: 13,
          }}
        >
          <span style={dotStyle} />
          <span style={{ color: C.white, fontWeight: 500 }}>{person.name || person.user_name || 'Unknown'}</span>
          <span style={{ color: C.accent, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
            {formatElapsed(person.clock_in_time || person.started_at)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// 6. EarningsTracker - Pay period progress bar
// ============================================================
export function EarningsTracker({ entries, isChloe, fm, C, getRate }) {
  const { earned, periodLabel } = useMemo(() => {
    const now = new Date();
    let periodStart, periodEnd, label;

    if (isChloe) {
      // Pay periods: 1st-15th or 16th-end of month
      const day = now.getDate();
      if (day <= 15) {
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth(), 15, 23, 59, 59);
        label = `${periodStart.toLocaleDateString('en-US', { month: 'short' })} 1 - 15`;
      } else {
        periodStart = new Date(now.getFullYear(), now.getMonth(), 16);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        label = `${periodStart.toLocaleDateString('en-US', { month: 'short' })} 16 - ${periodEnd.getDate()}`;
      }
    } else {
      // Admin: Mon-Sun week
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
      const sunday = new Date(periodStart.getTime() + 6 * 86400000);
      label = `${periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      periodEnd = new Date(sunday.getTime());
      periodEnd.setHours(23, 59, 59);
    }

    let total = 0;
    (entries || []).forEach(e => {
      const d = new Date(e.start_time);
      if (d >= periodStart && d <= periodEnd) {
        const hrs = (e.duration_ms || 0) / 3600000;
        const rate = e.rate || (getRate ? getRate(e) : 0);
        total += hrs * rate;
      }
    });

    return { earned: total, periodLabel: label };
  }, [entries, isChloe, getRate]);

  // No fixed target -- bar fills proportionally. Use a visual max of the next round number above earned.
  const visualMax = Math.max(100, Math.ceil(earned / 100) * 100 + 100);
  const pct = Math.min(100, (earned / visualMax) * 100);

  return (
    <div style={{
      background: C.card2 || C.bg2,
      borderRadius: 10,
      padding: '14px 18px',
      border: `1px solid ${C.border}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ color: C.dim, fontSize: 11 }}>{periodLabel}</span>
        <span style={{ color: C.white, fontSize: 18, fontWeight: 600 }}>{fm.money(earned)}</span>
      </div>
      <div style={{
        width: '100%',
        height: 10,
        borderRadius: 5,
        background: C.input || C.bg,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: 5,
          background: `linear-gradient(90deg, ${C.accent}, ${C.green})`,
          boxShadow: C.greenGlow || `0 0 8px ${C.accent}`,
          transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  );
}
