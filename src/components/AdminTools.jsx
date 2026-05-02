import { useState, useEffect, useRef, useCallback } from 'react';

// ─── 1. SearchBar ───────────────────────────────────────────────────────────

export function SearchBar({ entries, onFilter, C }) {
  const [query, setQuery] = useState('');
  const [count, setCount] = useState(entries.length);
  const timer = useRef(null);

  const applyFilter = useCallback((q) => {
    if (!q.trim()) {
      onFilter(entries);
      setCount(entries.length);
      return;
    }
    const lower = q.toLowerCase();
    const filtered = entries.filter((e) =>
      (e.description || '').toLowerCase().includes(lower) ||
      (e.worker || '').toLowerCase().includes(lower) ||
      (e.category || '').toLowerCase().includes(lower)
    );
    onFilter(filtered);
    setCount(filtered.length);
  }, [entries, onFilter]);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => applyFilter(query), 300);
    return () => clearTimeout(timer.current);
  }, [query, applyFilter]);

  useEffect(() => {
    applyFilter(query);
  }, [entries]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = () => {
    setQuery('');
    onFilter(entries);
    setCount(entries.length);
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', background: C.input,
        borderRadius: 10, border: `1px solid ${C.border}`, padding: '0 14px',
        height: 44, gap: 10,
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search entries..."
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: C.white, fontSize: 14, fontFamily: 'inherit',
          }}
        />
        {query && (
          <button onClick={clear} style={{
            background: 'transparent', border: 'none', color: C.dim,
            cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0,
          }}>
            &times;
          </button>
        )}
      </div>
      {query && (
        <div style={{ color: C.dim, fontSize: 12, marginTop: 6, paddingLeft: 4 }}>
          {count} result{count !== 1 ? 's' : ''} found
        </div>
      )}
    </div>
  );
}

// ─── 2. DateRangeFilter ─────────────────────────────────────────────────────

const PRESETS = [
  { label: 'Today', key: 'today' },
  { label: 'This Week', key: 'week' },
  { label: 'This Month', key: 'month' },
  { label: 'Last 30 Days', key: 'last30' },
  { label: 'All Time', key: 'all' },
];

function startOfWeek(d) {
  const s = new Date(d);
  s.setDate(s.getDate() - s.getDay());
  s.setHours(0, 0, 0, 0);
  return s;
}

function fmt(d) {
  return d.toISOString().split('T')[0];
}

export function DateRangeFilter({ onFilter, C }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [active, setActive] = useState('all');

  const apply = (f, t, key) => {
    setFrom(f);
    setTo(t);
    setActive(key);
    onFilter({ from: f || null, to: t || null });
  };

  const handlePreset = (key) => {
    const now = new Date();
    let f = '', t = fmt(now);
    if (key === 'today') {
      f = fmt(now);
    } else if (key === 'week') {
      f = fmt(startOfWeek(now));
    } else if (key === 'month') {
      const m = new Date(now.getFullYear(), now.getMonth(), 1);
      f = fmt(m);
    } else if (key === 'last30') {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      f = fmt(d);
    } else {
      f = '';
      t = '';
    }
    apply(f, t, key);
  };

  const dateInputStyle = {
    background: C.input, border: `1px solid ${C.border}`, borderRadius: 8,
    color: C.white, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit',
    outline: 'none', cursor: 'pointer',
  };

  const presetBtnStyle = (isActive) => ({
    background: isActive ? C.accent : 'transparent',
    color: isActive ? C.white : C.dim,
    border: `1px solid ${isActive ? C.accent : C.border}`,
    borderRadius: 6, padding: '6px 12px', fontSize: 12,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
    transition: 'all 0.15s ease',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="date" value={from}
          onChange={(e) => apply(e.target.value, to, '')}
          style={dateInputStyle}
        />
        <span style={{ color: C.dim, fontSize: 13 }}>to</span>
        <input
          type="date" value={to}
          onChange={(e) => apply(from, e.target.value, '')}
          style={dateInputStyle}
        />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => handlePreset(p.key)}
            style={presetBtnStyle(active === p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── 3. CSV Export ──────────────────────────────────────────────────────────

export function exportCSV(entries, getRate, projectName) {
  const header = ['Date', 'Worker', 'Start', 'End', 'Hours', 'Rate', 'Location', 'Category', 'Description', 'Amount'];
  const rows = entries.map((e) => {
    const start = new Date(e.start_time);
    const end = new Date(e.end_time);
    const hours = (end - start) / 3600000;
    const rate = getRate(e);
    const amount = (hours * rate).toFixed(2);
    return [
      start.toLocaleDateString(),
      e.worker || '',
      start.toLocaleTimeString(),
      end.toLocaleTimeString(),
      hours.toFixed(2),
      rate.toFixed(2),
      e.location || '',
      e.category || '',
      (e.description || '').replace(/"/g, '""'),
      amount,
    ];
  });

  const csvContent = [
    header.join(','),
    ...rows.map((r) => r.map((c) => `"${c}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `${(projectName || 'export').replace(/\s+/g, '-')}-export-${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── 4. AdminSettings ───────────────────────────────────────────────────────

export function AdminSettings({ C, supabase, projects, onUpdate }) {
  const [rates, setRates] = useState({});
  const [chloe, setChloe] = useState({
    probationStart: '', officeRateBefore: 18, homeRateBefore: 15,
    officeRateAfter: 20, homeRateAfter: 17,
  });
  const [categories, setCategories] = useState([]);
  const [newCat, setNewCat] = useState('');
  const [taxRate, setTaxRate] = useState(4.712);
  const [saving, setSaving] = useState('');

  useEffect(() => {
    loadSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSettings = async () => {
    const { data } = await supabase.from('settings').select('*');
    if (!data) return;
    const map = {};
    data.forEach((r) => { map[r.key] = r.value; });
    if (map.worker_rates) setRates(map.worker_rates);
    if (map.chloe_config) setChloe(map.chloe_config);
    if (map.categories) setCategories(map.categories);
    if (map.tax_rate) setTaxRate(map.tax_rate);
  };

  const save = async (key, value, label) => {
    setSaving(label);
    await supabase.from('settings').upsert({ key, value }, { onConflict: 'key' });
    if (onUpdate) onUpdate();
    setTimeout(() => setSaving(''), 1200);
  };

  const sectionStyle = {
    background: C.card, borderRadius: 14, padding: 20,
    border: `1px solid ${C.border}`, marginBottom: 16,
  };

  const labelStyle = { color: C.dim, fontSize: 12, marginBottom: 4, display: 'block' };

  const inputStyle = {
    background: C.input, border: `1px solid ${C.border}`, borderRadius: 8,
    color: C.white, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit',
    outline: 'none', width: 100,
  };

  const saveBtn = (label, onClick) => (
    <button
      onClick={onClick}
      style={{
        background: saving === label ? C.green : C.accent,
        color: C.white, border: 'none', borderRadius: 8,
        padding: '8px 18px', fontSize: 13, cursor: 'pointer',
        fontFamily: 'inherit', marginTop: 12,
        transition: 'background 0.2s ease',
      }}
    >
      {saving === label ? 'Saved!' : 'Save'}
    </button>
  );

  const updateRate = (project, worker, val) => {
    setRates((prev) => ({
      ...prev,
      [project]: { ...(prev[project] || {}), [worker]: parseFloat(val) || 0 },
    }));
  };

  const removeCat = (cat) => setCategories((prev) => prev.filter((c) => c !== cat));
  const addCat = () => {
    if (newCat.trim() && !categories.includes(newCat.trim())) {
      setCategories((prev) => [...prev, newCat.trim()]);
      setNewCat('');
    }
  };

  return (
    <div>
      <h3 style={{ color: C.white, fontSize: 18, marginBottom: 16 }}>Admin Settings</h3>

      {/* Worker Rates */}
      <div style={sectionStyle}>
        <h4 style={{ color: C.white, margin: '0 0 14px', fontSize: 15 }}>Worker Rates</h4>
        {(projects || []).map((p) => (
          <div key={p.id || p.name} style={{ marginBottom: 14 }}>
            <div style={{ color: C.accent, fontSize: 13, marginBottom: 8 }}>{p.name}</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {['Justin', 'Sam'].map((w) => (
                <div key={w}>
                  <label style={labelStyle}>{w} ($/hr)</label>
                  <input
                    type="number" step="0.01"
                    value={rates[p.name]?.[w] ?? ''}
                    onChange={(e) => updateRate(p.name, w, e.target.value)}
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        {saveBtn('rates', () => save('worker_rates', rates, 'rates'))}
      </div>

      {/* Chloe Config */}
      <div style={sectionStyle}>
        <h4 style={{ color: C.white, margin: '0 0 14px', fontSize: 15 }}>Chloe Config</h4>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Probation Start</label>
            <input
              type="date" value={chloe.probationStart}
              onChange={(e) => setChloe((p) => ({ ...p, probationStart: e.target.value }))}
              style={{ ...inputStyle, width: 160 }}
            />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 400 }}>
          {[
            ['officeRateBefore', 'Office (Before)'],
            ['homeRateBefore', 'Home (Before)'],
            ['officeRateAfter', 'Office (After)'],
            ['homeRateAfter', 'Home (After)'],
          ].map(([key, label]) => (
            <div key={key}>
              <label style={labelStyle}>{label} $/hr</label>
              <input
                type="number" step="0.01" value={chloe[key]}
                onChange={(e) => setChloe((p) => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))}
                style={inputStyle}
              />
            </div>
          ))}
        </div>
        {saveBtn('chloe', () => save('chloe_config', chloe, 'chloe'))}
      </div>

      {/* Categories */}
      <div style={sectionStyle}>
        <h4 style={{ color: C.white, margin: '0 0 14px', fontSize: 15 }}>Categories</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {categories.map((cat) => (
            <span key={cat} style={{
              background: C.bg2, color: C.white, borderRadius: 6,
              padding: '5px 10px', fontSize: 13, display: 'flex',
              alignItems: 'center', gap: 6,
            }}>
              {cat}
              <button onClick={() => removeCat(cat)} style={{
                background: 'transparent', border: 'none', color: C.red,
                cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0,
              }}>&times;</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCat()}
            placeholder="New category..."
            style={{ ...inputStyle, width: 180 }}
          />
          <button onClick={addCat} style={{
            background: C.accent, color: C.white, border: 'none',
            borderRadius: 8, padding: '8px 14px', fontSize: 13,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Add</button>
        </div>
        {saveBtn('cats', () => save('categories', categories, 'cats'))}
      </div>

      {/* Tax Rate */}
      <div style={sectionStyle}>
        <h4 style={{ color: C.white, margin: '0 0 14px', fontSize: 15 }}>Tax Rate (GET %)</h4>
        <input
          type="number" step="0.001" value={taxRate}
          onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
          style={inputStyle}
        />
        {saveBtn('tax', () => save('tax_rate', taxRate, 'tax'))}
      </div>
    </div>
  );
}

// ─── 5. BulkEditBar ─────────────────────────────────────────────────────────

export function BulkEditBar({ selectedIds, entries, onBulkUpdate, onClearSelection, C, CATS }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const count = selectedIds.length;

  if (count === 0) return null;

  const barStyle = {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    background: C.card2, borderTop: `2px solid ${C.accent}`,
    padding: '12px 20px', display: 'flex', alignItems: 'center',
    gap: 14, zIndex: 1000, boxShadow: `0 -4px 20px rgba(0,0,0,0.4)`,
    flexWrap: 'wrap',
  };

  const selectStyle = {
    background: C.input, border: `1px solid ${C.border}`, borderRadius: 8,
    color: C.white, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit',
    outline: 'none', cursor: 'pointer',
  };

  const btnStyle = (bg) => ({
    background: bg, color: C.white, border: 'none', borderRadius: 8,
    padding: '7px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
  });

  const handleCategoryChange = (e) => {
    if (e.target.value) {
      onBulkUpdate(selectedIds, { category: e.target.value });
    }
  };

  const handleWorkerChange = (e) => {
    if (e.target.value) {
      onBulkUpdate(selectedIds, { worker: e.target.value });
    }
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onBulkUpdate(selectedIds, { _delete: true });
    setConfirmDelete(false);
  };

  const workers = [...new Set(entries.map((e) => e.worker).filter(Boolean))];

  return (
    <div style={barStyle}>
      <span style={{ color: C.accent, fontSize: 14, fontWeight: 600, minWidth: 90 }}>
        {count} selected
      </span>

      <select onChange={handleCategoryChange} defaultValue="" style={selectStyle}>
        <option value="" disabled>Change category...</option>
        {(CATS || []).map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      <select onChange={handleWorkerChange} defaultValue="" style={selectStyle}>
        <option value="" disabled>Change worker...</option>
        {workers.map((w) => <option key={w} value={w}>{w}</option>)}
      </select>

      <button onClick={handleDelete} style={btnStyle(confirmDelete ? C.orange : C.red)}>
        {confirmDelete ? 'Confirm Delete?' : 'Delete Selected'}
      </button>

      <button onClick={() => { onClearSelection(); setConfirmDelete(false); }} style={btnStyle('transparent')}>
        Clear
      </button>
    </div>
  );
}

// ─── 6. Duplicate Detector ──────────────────────────────────────────────────

export function detectDuplicates(entries) {
  const results = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if ((a.worker || '').toLowerCase() !== (b.worker || '').toLowerCase()) continue;

      const aStart = new Date(a.start_time).getTime();
      const aEnd = new Date(a.end_time).getTime();
      const bStart = new Date(b.start_time).getTime();
      const bEnd = new Date(b.end_time).getTime();

      const overlapStart = Math.max(aStart, bStart);
      const overlapEnd = Math.min(aEnd, bEnd);

      if (overlapStart < overlapEnd) {
        results.push({
          entry1: a,
          entry2: b,
          overlapMinutes: Math.round((overlapEnd - overlapStart) / 60000),
        });
      }
    }
  }
  return results;
}

// ─── 7. BudgetTracker ───────────────────────────────────────────────────────

export function BudgetTracker({ project, entries, getRate, fm, C }) {
  if (!project?.budget) return null;

  const spent = entries.reduce((sum, e) => {
    const hours = (new Date(e.end_time) - new Date(e.start_time)) / 3600000;
    return sum + hours * getRate(e);
  }, 0);

  const budget = project.budget;
  const pct = (spent / budget) * 100;
  const barColor = pct > 100 ? C.red : pct >= 80 ? C.orange : C.green;
  const formatMoney = fm || ((v) => `$${v.toFixed(2)}`);

  return (
    <div style={{
      background: C.card, borderRadius: 12, padding: 16,
      border: `1px solid ${C.border}`,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 10,
      }}>
        <span style={{ color: C.white, fontSize: 14, fontWeight: 600 }}>Budget</span>
        <span style={{ color: C.dim, fontSize: 12 }}>
          {formatMoney(spent)} spent of {formatMoney(budget)} budget ({pct.toFixed(1)}%)
        </span>
      </div>
      <div style={{
        background: C.bg2, borderRadius: 6, height: 10, overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.min(pct, 100)}%`, height: '100%',
          background: barColor, borderRadius: 6,
          transition: 'width 0.4s ease, background 0.3s ease',
        }} />
      </div>
      {pct > 100 && (
        <div style={{ color: C.red, fontSize: 12, marginTop: 6 }}>
          Over budget by {formatMoney(spent - budget)}
        </div>
      )}
    </div>
  );
}

// ─── 8. DarkModeToggle ──────────────────────────────────────────────────────

export function DarkModeToggle({ isDark, onToggle, C }) {
  return (
    <button
      onClick={onToggle}
      style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 20, padding: '6px 12px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 8,
        transition: 'all 0.2s ease',
      }}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
      <span style={{ color: C.dim, fontSize: 12 }}>
        {isDark ? 'Light' : 'Dark'}
      </span>
    </button>
  );
}
