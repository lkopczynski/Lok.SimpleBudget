'use strict';

const KEY_SETTINGS = 'simplebudget.settings';
const KEY_EXPENSES = 'simplebudget.expenses';
const CURRENCIES = ['CHF', 'EUR', 'USD', 'GBP', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF'];
const DAY_MS = 86400000;

const $ = (id) => document.getElementById(id);
const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const store = (key, value) => localStorage.setItem(key, JSON.stringify(value));

let settings = load(KEY_SETTINGS, null);
let expenses = load(KEY_EXPENSES, []);
let editingId = null;

// Amounts are stored as integer cents to avoid float drift.
const toCents = (value) => Math.round(parseFloat(value) * 100);
const money = (cents) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: settings.currency }).format(cents / 100);
const fmtDate = (d, opts) => new Intl.DateTimeFormat(undefined, opts).format(d);
const toLocalInput = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/* ---------- Period logic ---------- */

const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

function monthlyResetDate(y, m) {
  const dim = daysInMonth(y, m);
  const day = settings.monthMode === 'first' ? 1
    : settings.monthMode === 'last' ? dim
    : Math.min(settings.monthDay, dim);
  return new Date(y, m, day);
}

function currentPeriod(now = new Date()) {
  if (settings.period === 'weekly') {
    const back = (now.getDay() - settings.weekday + 7) % 7;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    return { start, end };
  }
  let start = monthlyResetDate(now.getFullYear(), now.getMonth());
  if (start > now) start = monthlyResetDate(now.getFullYear(), now.getMonth() - 1);
  const end = monthlyResetDate(start.getFullYear(), start.getMonth() + 1);
  return { start, end };
}

function weekdayName(i) {
  // 2023-01-01 was a Sunday (index 0).
  return fmtDate(new Date(2023, 0, 1 + i), { weekday: 'long' });
}

/* ---------- Render ---------- */

function render() {
  if (!settings) return;
  const now = new Date();
  const { start, end } = currentPeriod(now);
  const inPeriod = expenses
    .filter((e) => e.time >= start.getTime() && e.time < end.getTime())
    .sort((a, b) => b.time - a.time);
  const spent = inPeriod.reduce((sum, e) => sum + e.amount, 0);
  const left = settings.amount - spent;

  $('left').textContent = money(left);
  $('left').classList.toggle('negative', left < 0);
  const pct = settings.amount > 0 ? Math.min(100, (spent / settings.amount) * 100) : (spent > 0 ? 100 : 0);
  $('bar-fill').style.width = `${pct}%`;
  $('bar-fill').classList.toggle('over', left < 0);
  $('spent-line').textContent = `${money(spent)} spent of ${money(settings.amount)}`;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((end - today) / DAY_MS);
  const nextStr = fmtDate(end, { weekday: 'short', day: 'numeric', month: 'short' });
  $('reset-line').textContent = `Resets ${nextStr} · ${days}d`;

  $('exp-cur').textContent = settings.currency;

  const list = $('list');
  list.replaceChildren(...inPeriod.map((e) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.classList.toggle('active', e.id === editingId);
    const desc = document.createElement('span');
    desc.className = 'desc';
    desc.textContent = e.description || '—';
    const amt = document.createElement('span');
    amt.className = 'amt';
    amt.textContent = money(e.amount);
    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = fmtDate(new Date(e.time), { dateStyle: 'medium', timeStyle: 'short' });
    btn.append(desc, amt, when);
    btn.addEventListener('click', () => startEdit(e.id));
    li.append(btn);
    return li;
  }));
  $('empty').hidden = inPeriod.length > 0;
}

/* ---------- Expense sheet ---------- */

const sheet = $('expense-sheet');

function resetForm() {
  editingId = null;
  $('expense-form').reset();
  sheet.classList.remove('editing');
  $('form-title').textContent = 'NEW EXPENSE';
  $('exp-submit').textContent = 'ADD';
  $('exp-delete').hidden = true;
  $('exp-date').value = toLocalInput(new Date());
}

function openAdd() {
  resetForm();
  sheet.showModal();
  $('exp-amount').focus();
}

function startEdit(id) {
  const e = expenses.find((x) => x.id === id);
  if (!e) return;
  editingId = id;
  $('exp-amount').value = (e.amount / 100).toFixed(2);
  $('exp-desc').value = e.description;
  $('exp-date').value = toLocalInput(new Date(e.time));
  sheet.classList.add('editing');
  $('form-title').textContent = 'EDIT EXPENSE';
  $('exp-submit').textContent = 'SAVE';
  $('exp-delete').hidden = false;
  render();
  sheet.showModal();
}

$('expense-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const amount = toCents($('exp-amount').value);
  const time = new Date($('exp-date').value).getTime();
  if (!(amount > 0) || Number.isNaN(time)) return;
  const data = { amount, time, description: $('exp-desc').value.trim() };

  if (editingId) {
    expenses = expenses.map((e) => (e.id === editingId ? { ...e, ...data } : e));
  } else {
    expenses.push({ id: crypto.randomUUID?.() ?? String(Date.now() + Math.random()), ...data });
  }
  store(KEY_EXPENSES, expenses);
  sheet.close();
});

$('exp-delete').addEventListener('click', () => {
  if (!editingId || !confirm('Delete this expense?')) return;
  expenses = expenses.filter((e) => e.id !== editingId);
  store(KEY_EXPENSES, expenses);
  sheet.close();
});

$('exp-cancel').addEventListener('click', () => sheet.close());
$('add-btn').addEventListener('click', openAdd);
// Covers save, delete, cancel, Esc and backdrop tap.
sheet.addEventListener('close', () => { resetForm(); render(); });
sheet.addEventListener('click', (ev) => { if (ev.target === sheet) sheet.close(); });

/* ---------- Settings ---------- */

const dlg = $('settings');

$('set-currency').append(...CURRENCIES.map((c) => new Option(c, c)));
// Monday-first ordering, values stay JS getDay() indices.
$('set-weekday').append(...[1, 2, 3, 4, 5, 6, 0].map((i) => new Option(weekdayName(i), String(i))));

function syncSettingsVisibility() {
  const weekly = $('set-period').value === 'weekly';
  $('row-month-mode').hidden = weekly;
  $('row-month-day').hidden = weekly || $('set-month-mode').value !== 'specific';
  $('row-weekday').hidden = !weekly;
  $('set-month-day').required = !$('row-month-day').hidden;
}
$('set-period').addEventListener('change', syncSettingsVisibility);
$('set-month-mode').addEventListener('change', syncSettingsVisibility);

function openSettings() {
  const s = settings ?? { amount: 0, currency: 'CHF', period: 'monthly', monthMode: 'first', monthDay: 1, weekday: 1 };
  $('set-amount').value = settings ? (s.amount / 100).toFixed(2) : '';
  $('set-currency').value = s.currency;
  $('set-period').value = s.period;
  $('set-month-mode').value = s.monthMode;
  $('set-month-day').value = s.monthDay;
  $('set-weekday').value = String(s.weekday);
  $('settings-cancel').hidden = !settings;
  $('export-btn').hidden = !settings;
  syncSettingsVisibility();
  dlg.showModal();
}

$('settings-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const monthDay = Math.min(31, Math.max(1, parseInt($('set-month-day').value, 10) || 1));
  settings = {
    amount: toCents($('set-amount').value) || 0,
    currency: $('set-currency').value,
    period: $('set-period').value,
    monthMode: $('set-month-mode').value,
    monthDay,
    weekday: parseInt($('set-weekday').value, 10),
  };
  store(KEY_SETTINGS, settings);
  dlg.close();
  render();
});

$('settings-cancel').addEventListener('click', () => dlg.close());
// Budget must be set on first run, so block Esc-closing until then.
dlg.addEventListener('cancel', (ev) => { if (!settings) ev.preventDefault(); });
$('settings-btn').addEventListener('click', openSettings);

/* ---------- Export / import ---------- */

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

function parseBackup(data) {
  const s = data?.settings;
  const validSettings = s
    && isInt(s.amount, 0, Number.MAX_SAFE_INTEGER)
    && CURRENCIES.includes(s.currency)
    && ['monthly', 'weekly'].includes(s.period)
    && ['first', 'last', 'specific'].includes(s.monthMode)
    && isInt(s.monthDay, 1, 31)
    && isInt(s.weekday, 0, 6);
  const validExpenses = Array.isArray(data?.expenses) && data.expenses.every((e) =>
    e && typeof e.id === 'string' && isInt(e.amount, 1, Number.MAX_SAFE_INTEGER)
    && Number.isFinite(e.time) && typeof e.description === 'string');
  if (!validSettings || !validExpenses) throw new Error('Invalid backup file.');
  return {
    settings: {
      amount: s.amount, currency: s.currency, period: s.period,
      monthMode: s.monthMode, monthDay: s.monthDay, weekday: s.weekday,
    },
    expenses: data.expenses.map(({ id, amount, time, description }) => ({ id, amount, time, description })),
  };
}

$('export-btn').addEventListener('click', async () => {
  const json = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), settings, expenses }, null, 2);
  const name = `budget-${toLocalInput(new Date()).slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  // Share sheet is the reliable way to save files from an installed iOS PWA.
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch { /* user cancelled */ }
    return;
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('import-btn').addEventListener('click', () => $('import-file').click());

$('import-file').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  let backup;
  try {
    backup = parseBackup(JSON.parse(await file.text()));
  } catch {
    alert('Could not read this file. Is it a budget export?');
    return;
  }
  if (!confirm(`Replace all current data with ${backup.expenses.length} expense(s) from this file?`)) return;
  settings = backup.settings;
  expenses = backup.expenses;
  store(KEY_SETTINGS, settings);
  store(KEY_EXPENSES, expenses);
  dlg.close();
  render();
});

/* ---------- Boot ---------- */

resetForm();
if (settings) render(); else openSettings();

document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
setInterval(render, 60000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
