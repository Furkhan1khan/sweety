import { useCallback, useEffect, useMemo, useState } from 'react';

const SLOTS = ['Morning (fasting)', 'After breakfast', 'After lunch', 'After dinner'];

function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function prettyDate(date, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return new Intl.DateTimeFormat('en-GB', options).format(new Date(`${date}T12:00:00`));
}

function formatAverage(value) {
  return typeof value === 'number' ? value.toFixed(1) : '—';
}

async function request(path, { token, ...options } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        'X-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error('Cannot reach the server. Please check your connection.');
  }
  if (response.status === 204) return null;
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Server is unavailable. Please ensure the database is running.');
  }
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

function Brand() {
  return <div className="brand"><span className="brand-mark"><span /></span><span>Sweety</span></div>;
}

function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await request(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      onLogin(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-brand"><Brand /><span className="privacy-pill"><i /> Your private health journal</span></div>
      <div className="auth-layout">
        <section className="auth-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> A LITTLE MORE CLARITY, EVERY DAY</div>
          <h1>Your health,<br /><em>in your hands.</em></h1>
          <p>A gentle place to keep your glucose readings together. Small notes today, a clearer picture over time.</p>
          <div className="auth-note"><span className="note-icon">✳</span><div><strong>One step at a time</strong><small>Build a routine that works for you.</small></div></div>
          <div className="plant-decoration" aria-hidden="true"><span /><span /><span /><span /><b /></div>
        </section>
        <section className="auth-card">
          <div className="card-kicker">WELCOME TO SWEETY</div>
          <h2>{mode === 'login' ? 'Good to see you' : 'Let’s get started'}</h2>
          <p className="auth-subtitle">{mode === 'login' ? 'Sign in to your personal glucose journal.' : 'Create your personal glucose journal.'}</p>
          <div className="auth-tabs" role="tablist" aria-label="Account options">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Log in</button>
            <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Create account</button>
          </div>
          <form onSubmit={submit} className="auth-form">
            {mode === 'register' && <label>Your name<input autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="How should we call you?" required /></label>}
            <label>Email address<input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" required /></label>
            <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : undefined} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'} required /></label>
            {error && <div className="inline-error" role="alert">{error}</div>}
            <button className="primary-button auth-submit" disabled={busy}>{busy ? 'Just a moment…' : mode === 'login' ? 'Log in to Sweety' : 'Create my account'} <span>↗</span></button>
          </form>
          <div className="auth-foot"><span className="lock-icon">⌑</span> Your readings are visible only to you.</div>
        </section>
      </div>
      <footer className="auth-footer"><span>MADE FOR THE EVERYDAY</span><span>Take a breath. You’re doing great.</span></footer>
    </main>
  );
}

function StatCard({ label, icon, value, unit, tint, hint }) {
  return <article className={`stat-card ${tint}`}><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><div className="stat-value">{value}<small>{unit}</small></div><div className="stat-hint">{hint}</div></article>;
}

function ReportMetric({ title, range, report, icon, tone }) {
  return <article className={`report-card ${tone}`}>
    <div className="report-heading"><div><div className="report-title">{title}</div><div className="report-range">{range}</div></div><span className="report-icon">{icon}</span></div>
    <div className="report-main"><span>{formatAverage(report?.average)}</span><small>mg/dl <i>average</i></small></div>
    <div className="report-separator" />
    {report?.count === 0 ? <div className="report-empty"><span>0 READINGS</span><p>No readings for this period yet.</p></div> : report ? <div className="report-details"><div><span>Highest</span><strong>{report.high} <small>mg/dl</small></strong></div><div><span>Lowest</span><strong>{report.low} <small>mg/dl</small></strong></div><div><span>Readings</span><strong>{report.count}</strong></div></div> : <div className="report-empty"><p>Loading report…</p></div>}
  </article>;
}

function Dashboard({ session, onLogout }) {
  const [selectedDate, setSelectedDate] = useState(localToday());
  const [readings, setReadings] = useState([]);
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ date: localToday(), slot: SLOTS[0], value: '' });
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    setReadings([]);
    setReports(null);
    try {
      const [daily, reportData] = await Promise.all([
        request(`/readings?date=${selectedDate}`, { token: session.token }),
        request(`/reports?date=${selectedDate}`, { token: session.token }),
      ]);
      setReadings(daily);
      setReports(reportData);
    } catch (err) {
      if (/session|log in/i.test(err.message)) onLogout();
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, session.token, onLogout]);

  useEffect(() => { loadData(); }, [loadData]);

  const slotCounts = useMemo(() => new Set(readings.map((reading) => reading.slot)), [readings]);

  useEffect(() => {
    if (editingId || form.value || form.date !== selectedDate) return;
    const nextSlot = SLOTS.find((slot) => !slotCounts.has(slot));
    if (nextSlot && nextSlot !== form.slot) setForm((current) => ({ ...current, slot: nextSlot }));
  }, [editingId, form.date, form.slot, form.value, selectedDate, slotCounts]);

  function startEdit(reading) {
    setEditingId(reading.id);
    setForm({ date: reading.date, slot: reading.slot, value: reading.value });
    setError('');
    setNotice('');
    document.getElementById('reading-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ date: selectedDate, slot: SLOTS.find((slot) => !slotCounts.has(slot)) || SLOTS[0], value: '' });
  }

  async function saveReading(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await request(editingId ? `/readings/${editingId}` : '/readings', {
        token: session.token,
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify({ ...form, value: Number(form.value) }),
      });
      const isEdit = Boolean(editingId);
      setSelectedDate(form.date);
      setEditingId(null);
      setNotice(isEdit ? 'Your reading has been updated.' : 'Your reading has been saved.');
      setForm({ date: form.date, slot: SLOTS[0], value: '' });
      if (form.date === selectedDate) await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteReading(reading) {
    if (!window.confirm(`Delete the ${reading.slot.toLowerCase()} reading of ${reading.value} mg/dl?`)) return;
    setError('');
    try {
      await request(`/readings/${reading.id}`, { token: session.token, method: 'DELETE' });
      setNotice('Reading deleted.');
      if (editingId === reading.id) cancelEdit();
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  const daily = reports?.daily;
  const previousRange = reports?.previousMonth?.startDate && `${prettyDate(reports.previousMonth.startDate, { day: 'numeric', month: 'short' })} – ${prettyDate(reports.previousMonth.endDate, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const monthRange = reports?.monthToDate?.startDate && `${prettyDate(reports.monthToDate.startDate, { day: 'numeric', month: 'short' })} – ${prettyDate(reports.monthToDate.endDate, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return <main className="dashboard-shell">
    <header className="topbar"><Brand /><div className="topbar-right"><span className="today-chip"><i /> YOUR PERSONAL JOURNAL</span><span className="topbar-divider" /><span className="avatar">{session.user.name.trim().charAt(0).toUpperCase()}</span><div className="user-label"><strong>{session.user.name}</strong><span>My account</span></div><button className="logout-button" onClick={onLogout} aria-label="Log out" title="Log out">↗</button></div></header>
    <div className="dashboard-content">
      <section className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line" /> YOUR DAILY CHECK-IN</div><h1>Hello, {session.user.name.split(' ')[0]} <span className="wave">✳</span></h1><p>A little check-in goes a long way. Here’s your glucose story.</p></div><label className="date-picker"><span>VIEWING DATE</span><div className="date-input-wrap"><span className="calendar-icon">▦</span><input type="date" max={localToday()} value={selectedDate} onChange={(e) => { setSelectedDate(e.target.value || localToday()); setEditingId(null); setError(''); setNotice(''); setForm({ date: e.target.value || localToday(), slot: SLOTS[0], value: '' }); }} /></div></label></section>
      {error && <div className="banner-error" role="alert"><span>!</span>{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      {notice && <div className="banner-success" role="status"><span>✓</span>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}
      <section className="summary-section">
        <div className="section-heading"><div><span className="section-kicker">THE BIG PICTURE</span><h2>Your day at a glance</h2></div><span className="as-of">{prettyDate(selectedDate)}</span></div>
        <div className="stats-grid">
          <StatCard label="Daily average" icon="◌" value={loading ? '…' : formatAverage(daily?.average)} unit={daily?.average !== null && daily?.average !== undefined ? 'mg/dl' : ''} tint="mint" hint="Across today’s readings" />
          <StatCard label="Highest reading" icon="↗" value={loading ? '…' : daily?.high ?? '—'} unit={daily?.high ? 'mg/dl' : ''} tint="peach" hint="Your peak for the day" />
          <StatCard label="Lowest reading" icon="↘" value={loading ? '…' : daily?.low ?? '—'} unit={daily?.low ? 'mg/dl' : ''} tint="lavender" hint="Your lowest for the day" />
          <StatCard label="Readings logged" icon="▤" value={loading ? '…' : daily?.count ?? 0} unit="/ 4" tint="sand" hint="A few notes make a trend" />
        </div>
      </section>
      <section className="reports-section">
        <div className="section-heading report-section-title"><div><span className="section-kicker">A WIDER VIEW</span><h2>Patterns, over time</h2></div><span className="section-note">Numbers are just one part of your story.</span></div>
        <div className="reports-grid">
          <ReportMetric title="Month to date" range={monthRange || '1st of this month → selected date'} report={reports?.monthToDate} icon="◷" tone="report-mint" />
          <ReportMetric title="Previous month" range={previousRange || 'The month before this one'} report={reports?.previousMonth} icon="⌁" tone="report-peach" />
        </div>
      </section>
      <section className="journal-section">
        <div className="section-heading journal-heading"><div><span className="section-kicker">YOUR JOURNAL</span><h2>Readings for {prettyDate(selectedDate, { day: 'numeric', month: 'long' })}</h2></div><span className="slot-progress">{readings.length} of 4 <i>slots filled</i></span></div>
        <div className="journal-layout">
          <article className="reading-list-card">
            <div className="list-card-heading"><div><span className="card-kicker">DAILY LOG</span><h3>Today’s readings</h3></div><span className="list-date">{prettyDate(selectedDate, { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>
            {loading ? <div className="empty-state"><span className="empty-orbit">◌</span><strong>Gathering your readings…</strong></div> : readings.length === 0 ? <div className="empty-state"><span className="empty-orbit">◌</span><strong>No readings just yet</strong><p>Your first check-in will show up here.</p></div> : <div className="reading-list">{readings.map((reading) => { const slotIndex = SLOTS.indexOf(reading.slot); return <div className="reading-row" key={reading.id}><div className={`slot-symbol slot-${slotIndex}`}>{['☼', '◒', '☀', '☾'][slotIndex]}</div><div className="reading-name"><strong>{reading.slot}</strong><span>{prettyDate(reading.date, { weekday: 'short' })} check-in</span></div><div className="reading-value">{reading.value}<small> mg/dl</small></div><div className="row-actions"><button onClick={() => startEdit(reading)} aria-label={`Edit ${reading.slot}`} title="Edit reading">✎</button><button className="delete-action" onClick={() => deleteReading(reading)} aria-label={`Delete ${reading.slot}`} title="Delete reading">×</button></div></div>; })}</div>}
            {readings.length > 0 && readings.length < 4 && <div className="gentle-note"><span>✳</span> You’re building a helpful picture, one check-in at a time.</div>}
          </article>
          <article className="form-card" id="reading-form">
            <div className="form-card-heading"><div><span className="card-kicker">{editingId ? 'MAKE A CHANGE' : 'ADD TO YOUR JOURNAL'}</span><h3>{editingId ? 'Edit reading' : 'New reading'}</h3></div><span className="form-spark">✳</span></div>
            <form onSubmit={saveReading} className="reading-form">
              <label>Date <input type="date" max={localToday()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></label>
              <label>Time slot <select value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value })}>{SLOTS.map((slot) => <option key={slot} value={slot}>{slot}</option>)}</select></label>
              <label>Glucose value <div className="value-input"><input type="number" min="40" max="600" step="1" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="e.g. 110" required /><span>mg/dl</span></div></label>
              <p className="form-helper">A whole number between 40 and 600.</p>
              {error && <div className="form-error" role="alert">{error}</div>}
              <div className="form-actions"><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Save reading'} <span>↗</span></button>{editingId && <button type="button" className="cancel-button" onClick={cancelEdit}>Cancel</button>}</div>
            </form>
            <div className="slots-hint"><span className="hint-icon">⌁</span><span><strong>Up to four check-ins a day</strong><small>One for each time of day. You can edit them anytime.</small></span></div>
          </article>
        </div>
      </section>
      <footer className="dashboard-footer"><span>✳ &nbsp; Take care, one reading at a time.</span><span>For your records only · Not medical advice</span></footer>
    </div>
  </main>;
}

export default function App() {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sweety-session')); } catch { return null; }
  });

  function login(result) {
    localStorage.setItem('sweety-session', JSON.stringify(result));
    setSession(result);
  }

  const logout = useCallback(() => {
    localStorage.removeItem('sweety-session');
    setSession(null);
  }, []);

  return session ? <Dashboard session={session} onLogout={logout} /> : <AuthScreen onLogin={login} />;
}
