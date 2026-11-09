'use strict';

import { language, locale, languageOverride, setLanguageOverride, t, translate, translateValidation, clearValidation } from './i18n.js';

const KEY_SETTINGS = 'simplebudget.settings';
const KEY_EXPENSES = 'simplebudget.expenses';
const CURRENCIES = ['CHF', 'EUR', 'USD', 'GBP', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF'];
const DAY_MS = 86400000;

const $ = (id) => document.getElementById(id);
const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const store = (key, value) => localStorage.setItem(key, JSON.stringify(value));

document.documentElement.lang = language;
document.title = t('budget');
translate(document);

try {
  const views = await Promise.all(['budget', 'expense', 'setup', 'settings', 'budget-fields'].map(async (name) => {
    const response = await fetch(`views/${name}.html`);
    if (!response.ok) throw new Error(`Could not load ${name} view.`);
    const template = document.createElement('template');
    template.innerHTML = await response.text();
    return template.content;
  }));
  $('app').replaceChildren(...views);
} catch (error) {
  $('app').textContent = t('loadError');
  throw error;
}

let settings = load(KEY_SETTINGS, null);
let expenses = load(KEY_EXPENSES, []);
let editingId = null;
let activeRoute = '';
let applyingRoute = false;

// Amounts are stored as integer cents to avoid float drift.
const toCents = (value) => Math.round(parseFloat(value) * 100);
const money = (cents) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: settings.currency }).format(cents / 100);
const fmtDate = (d, opts) => new Intl.DateTimeFormat(locale, opts).format(d);
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

function applyLanguage() {
  document.documentElement.lang = language;
  document.title = t('budget');
  translate(document);
  for (const option of document.querySelectorAll('select[name="weekday"] option')) {
    option.textContent = weekdayName(Number(option.value));
  }
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
  $('spent-line').textContent = t('spentLine', { spent: money(spent), budget: money(settings.amount) });

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((end - today) / DAY_MS);
  $('per-day').textContent = t('perDay', { amount: money(left / days) });
  const resetDays = t(days === 1 ? 'resetDay' : 'resetDays', { days });
  const resetDate = fmtDate(end, { month: 'short', day: 'numeric' });
  $('reset-line').textContent = t('resetLine', { days: resetDays, date: resetDate });

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

/* ---------- Expense editor ---------- */

const editor = $('expense-screen');
const expenseFormValues = () => JSON.stringify([
  $('exp-amount').value, $('exp-desc').value, $('exp-date').value,
]);
let initialExpenseValues = null;

function canDiscardExpense() {
  return editor.hidden || expenseFormValues() === initialExpenseValues
    || confirm(t('discardExpense'));
}

function resetForm() {
  editingId = null;
  $('expense-form').reset();
  clearValidation($('expense-form'));
  editor.classList.remove('editing');
  $('form-title').textContent = t('newExpense');
  $('exp-submit').textContent = t('add');
  $('exp-delete').hidden = true;
  $('exp-date').value = toLocalInput(new Date());
}

function openExpense() {
  initialExpenseValues = expenseFormValues();
  showScreen('expense-screen', editingId ? `#/expenses/${encodeURIComponent(editingId)}` : '#/expenses/new');
  if (!editingId) $('exp-amount').focus({ preventScroll: true });
}

function showScreen(id, route) {
  document.activeElement?.blur();
  for (const screenId of ['budget-screen', 'expense-screen', 'setup-screen', 'settings']) {
    $(screenId).hidden = screenId !== id;
  }
  $('add-btn').hidden = id !== 'budget-screen';
  if (!applyingRoute && location.hash !== route) {
    history.pushState({ returnToBudget: activeRoute === '#/budget' }, '', route);
  }
  activeRoute = route;
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function showBudget() {
  showScreen('budget-screen', '#/budget');
  resetForm();
  render();
}

function closeScreen() {
  const returnToBudget = history.state?.returnToBudget;
  applyingRoute = true;
  showBudget();
  applyingRoute = false;
  if (returnToBudget) history.back(); else history.replaceState(null, '', '#/budget');
}

function applyRoute() {
  applyingRoute = true;
  try {
    if (!settings) {
      openSetup();
    } else if (location.hash === '#/settings') {
      openSettings();
    } else if (location.hash === '#/expenses/new') {
      openAdd();
    } else {
      const match = /^#\/expenses\/([^/]+)$/.exec(location.hash);
      let expenseId;
      try { expenseId = match ? decodeURIComponent(match[1]) : null; } catch { expenseId = null; }
      if (expenses.some((expense) => expense.id === expenseId)) startEdit(expenseId);
      else showBudget();
    }
  } finally {
    applyingRoute = false;
  }
  if (location.hash !== activeRoute) history.replaceState(history.state, '', activeRoute);
}

function openAdd() {
  resetForm();
  openExpense();
}

function startEdit(id) {
  const e = expenses.find((x) => x.id === id);
  if (!e) { openAdd(); return; }
  editingId = id;
  $('exp-amount').value = (e.amount / 100).toFixed(2);
  $('exp-desc').value = e.description;
  $('exp-date').value = toLocalInput(new Date(e.time));
  editor.classList.add('editing');
  $('form-title').textContent = t('editExpense');
  $('exp-submit').textContent = t('save');
  $('exp-delete').hidden = false;
  render();
  openExpense();
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
  closeScreen();
});

$('exp-delete').addEventListener('click', () => {
  if (!editingId || !confirm(t('confirmDelete'))) return;
  expenses = expenses.filter((e) => e.id !== editingId);
  store(KEY_EXPENSES, expenses);
  closeScreen();
});

$('exp-cancel').addEventListener('click', () => {
  if (canDiscardExpense()) closeScreen();
});
$('add-btn').addEventListener('click', openAdd);
window.addEventListener('popstate', () => {
  if (location.hash === activeRoute) return;
  if (!canDiscardExpense() || !canDiscardSettings()) {
    history.pushState({ returnToBudget: location.hash === '#/budget' }, '', activeRoute);
    return;
  }
  applyRoute();
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
});

/* ---------- Settings ---------- */

const settingsScreen = $('settings');
const setupForm = $('setup-form');
const settingsForm = $('settings-form');
const settingsFormValues = () => JSON.stringify([...new FormData(settingsForm)]);
let initialSettingsValues = null;

function canDiscardSettings() {
  return settingsScreen.hidden || settingsFormValues() === initialSettingsValues
    || confirm(t('discardSettings'));
}

function syncBudgetVisibility(form) {
  const fields = form.elements;
  const weekly = fields.namedItem('period').value === 'weekly';
  form.querySelector('[data-row="month-mode"]').hidden = weekly;
  const monthDayRow = form.querySelector('[data-row="month-day"]');
  monthDayRow.hidden = weekly || fields.namedItem('month-mode').value !== 'specific';
  form.querySelector('[data-row="weekday"]').hidden = !weekly;
  fields.namedItem('month-day').required = !monthDayRow.hidden;
}

function fillBudgetForm(form, budget) {
  clearValidation(form);
  const fields = form.elements;
  fields.namedItem('amount').value = budget.amount === null ? '' : (budget.amount / 100).toFixed(2);
  fields.namedItem('currency').value = budget.currency;
  fields.namedItem('period').value = budget.period;
  fields.namedItem('month-mode').value = budget.monthMode;
  fields.namedItem('month-day').value = budget.monthDay;
  fields.namedItem('weekday').value = String(budget.weekday);
  syncBudgetVisibility(form);
}

function saveBudgetForm(form) {
  const fields = form.elements;
  const monthDay = Math.min(31, Math.max(1, parseInt(fields.namedItem('month-day').value, 10) || 1));
  settings = {
    amount: toCents(fields.namedItem('amount').value) || 0,
    currency: fields.namedItem('currency').value,
    period: fields.namedItem('period').value,
    monthMode: fields.namedItem('month-mode').value,
    monthDay,
    weekday: parseInt(fields.namedItem('weekday').value, 10),
  };
  store(KEY_SETTINGS, settings);
  if (form === settingsForm) {
    setLanguageOverride($('set-language').value);
    applyLanguage();
  }
  closeScreen();
}

for (const [form, prefix] of [[setupForm, 'setup'], [settingsForm, 'set']]) {
  form.querySelector('.budget-fields').append($('budget-fields-template').content.cloneNode(true));
  for (const field of form.querySelectorAll('[name]')) field.id = `${prefix}-${field.name}`;
  form.elements.namedItem('currency').append(...CURRENCIES.map((currency) => new Option(currency, currency)));
  form.elements.namedItem('weekday').append(...[1, 2, 3, 4, 5, 6, 0].map((day) => new Option(weekdayName(day), String(day))));
  form.elements.namedItem('period').addEventListener('change', () => syncBudgetVisibility(form));
  form.elements.namedItem('month-mode').addEventListener('change', () => syncBudgetVisibility(form));
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    saveBudgetForm(form);
  });
}

function openSetup() {
  fillBudgetForm(setupForm, { amount: null, currency: 'CHF', period: 'monthly', monthMode: 'first', monthDay: 1, weekday: 1 });
  showScreen('setup-screen', '#/setup');
}

function openSettings() {
  fillBudgetForm(settingsForm, settings);
  $('set-language').value = languageOverride;
  initialSettingsValues = settingsFormValues();
  showScreen('settings', '#/settings');
}

$('settings-cancel').addEventListener('click', () => {
  if (canDiscardSettings()) closeScreen();
});
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
  if (!validSettings || !validExpenses) throw new Error(t('invalidBackup'));
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
$('setup-import-btn').addEventListener('click', () => $('import-file').click());

$('import-file').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  let backup;
  try {
    backup = parseBackup(JSON.parse(await file.text()));
  } catch {
    alert(t('importError'));
    return;
  }
  if (!confirm(t('replaceData', { count: backup.expenses.length }))) return;
  settings = backup.settings;
  expenses = backup.expenses;
  store(KEY_SETTINGS, settings);
  store(KEY_EXPENSES, expenses);
  closeScreen();
});

/* ---------- Boot ---------- */

applyLanguage();
document.addEventListener('invalid', (ev) => translateValidation(ev.target), true);
document.addEventListener('input', (ev) => ev.target.setCustomValidity?.(''));
document.addEventListener('change', (ev) => ev.target.setCustomValidity?.(''));
resetForm();
history.scrollRestoration = 'manual';
render();
applyRoute();

document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
setInterval(render, 60000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
