import en from './locales/en.js';
import de from './locales/de.js';
import fr from './locales/fr.js';

const messages = { en, de, fr };

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

export const { language, locale } = detectLocale();

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