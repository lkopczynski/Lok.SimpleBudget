import en from './locales/en.js';
import de from './locales/de.js';
import fr from './locales/fr.js';

const messages = { en, de, fr };
const KEY_LANGUAGE = 'simplebudget.language';

export function detectLocale(device = globalThis.navigator) {
  const preferred = device?.languages?.[0] || device?.language;
  if (typeof preferred !== 'string') return { language: 'en', locale: 'en' };
  try {
    const [locale] = Intl.getCanonicalLocales(preferred.replaceAll('_', '-'));
    const language = locale.split('-')[0];
    if (Object.hasOwn(messages, language)) return { language, locale };
  } catch {}
  return { language: 'en', locale: 'en' };
}

export function resolveLocale(override, device = globalThis.navigator) {
  const detected = detectLocale(device);
  if (!Object.hasOwn(messages, override)) return detected;
  return { language: override, locale: detected.language === override ? detected.locale : override };
}

function loadLanguageOverride() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY_LANGUAGE));
    return Object.hasOwn(messages, saved) ? saved : '';
  } catch { return ''; }
}

export let languageOverride = loadLanguageOverride();
export let { language, locale } = resolveLocale(languageOverride);

export function setLanguageOverride(value) {
  const override = Object.hasOwn(messages, value) ? value : '';
  if (override) localStorage.setItem(KEY_LANGUAGE, JSON.stringify(override));
  else localStorage.removeItem(KEY_LANGUAGE);
  languageOverride = override;
  ({ language, locale } = resolveLocale(override));
}

export function t(key, values = {}) {
  const message = messages[language][key] ?? en[key] ?? key;
  return message.replace(/\{(\w+)\}/g, (placeholder, name) => String(values[name] ?? placeholder));
}

export function translate(root) {
  for (const element of root.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of root.querySelectorAll('[data-i18n-placeholder]')) {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  }
}

export function translateValidation(field) {
  field.setCustomValidity('');
  const validity = field.validity;
  const number = (value) => new Intl.NumberFormat(locale).format(Number(value));
  let message = '';
  if (validity.valueMissing) message = t('requiredField');
  else if (validity.badInput || validity.typeMismatch || validity.patternMismatch) message = t('invalidValue');
  else if (validity.rangeUnderflow) message = t('minimumValue', { min: number(field.min) });
  else if (validity.rangeOverflow) message = t('maximumValue', { max: number(field.max) });
  else if (validity.stepMismatch) message = t('stepValue', { step: number(field.step) });
  else if (validity.tooLong) message = t('maximumLength', { max: field.maxLength });
  field.setCustomValidity(message);
}

export function clearValidation(form) {
  for (const field of form.elements) field.setCustomValidity?.('');
}