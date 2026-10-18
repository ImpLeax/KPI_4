import { getLocale } from './api.js';

export const SUPPORTED_LANGS = ['uk', 'en'];
export const DEFAULT_LANG = 'uk';
const STORAGE_KEY = 'upcycling.lang';

let currentLang = DEFAULT_LANG;
let dictionary = {};
const cache = new Map();

function readStoredLang() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return SUPPORTED_LANGS.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

function storeLang(lang) {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts only for this page.
  }
}

async function loadDictionary(lang) {
  if (!cache.has(lang)) cache.set(lang, await getLocale(lang));
  return cache.get(lang);
}

function lookup(key) {
  return key
    .split('.')
    .reduce(
      (node, part) => (node && typeof node === 'object' ? node[part] : undefined),
      dictionary,
    );
}

function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in params ? String(params[name]) : match,
  );
}

/** Translate a key; returns the key itself when missing so gaps are visible during testing. */
export function t(key, params) {
  const value = lookup(key);
  if (typeof value !== 'string') return key;
  return interpolate(value, params);
}

/** Plural-aware translation: the key must point to an object with Intl plural categories. */
export function tp(key, count, params = {}) {
  const forms = lookup(key);
  if (!forms || typeof forms !== 'object') return key;
  const category = new Intl.PluralRules(currentLang).select(count);
  const template = forms[category] ?? forms.other ?? key;
  return interpolate(template, { count, ...params });
}

export function getLang() {
  return currentLang;
}

/** Apply `data-i18n*` attributes inside `root`. */
export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder));
  });
  root.querySelectorAll('[data-i18n-aria-label]').forEach((node) => {
    node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((node) => {
    node.setAttribute('title', t(node.dataset.i18nTitle));
  });
  root.querySelectorAll('[data-i18n-alt]').forEach((node) => {
    node.setAttribute('alt', t(node.dataset.i18nAlt));
  });
}

export async function initI18n() {
  currentLang = readStoredLang() || DEFAULT_LANG;
  try {
    dictionary = await loadDictionary(currentLang);
  } catch {
    currentLang = DEFAULT_LANG;
    dictionary = await loadDictionary(DEFAULT_LANG);
  }
  document.documentElement.lang = currentLang;
  applyTranslations();
}

/** Switch language, re-translate static markup and notify pages via a `langchange` event. */
export async function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang) || lang === currentLang) return;
  dictionary = await loadDictionary(lang);
  currentLang = lang;
  storeLang(lang);
  document.documentElement.lang = lang;
  applyTranslations();
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}
