import { t } from '../i18n.js';
import { el } from './dom.js';
import { icon } from './icons.js';

export const PLACEHOLDER_PHOTO = '/images/seed/placeholder.svg';
export const DIFFICULTIES = ['easy', 'medium', 'hard'];
export const IDEA_CATEGORIES = ['decor', 'storage', 'garden', 'toys', 'accessories', 'household'];
export const MATERIAL_CATEGORIES = ['plastic', 'paper', 'glass', 'textile', 'metal', 'other'];
export const SORTS = ['difficulty_asc', 'difficulty_desc', 'time_asc', 'newest'];

/** 45 -> "45 хв", 90 -> "1 год 30 хв". */
export function formatTime(minutes) {
  const total = Number(minutes) || 0;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours === 0) return t('time.minutes', { m: mins });
  if (mins === 0) return t('time.hours', { h: hours });
  return t('time.hoursMinutes', { h: hours, m: mins });
}

/**
 * Difficulty shown as 1-3 leaves plus a text label, so the level never relies on colour alone.
 * @param {'easy'|'medium'|'hard'} difficulty
 */
export function difficultyBadge(difficulty, { size = 'sm' } = {}) {
  const level = DIFFICULTIES.indexOf(difficulty) + 1;
  const leafClass = size === 'lg' ? 'size-5' : 'size-4';
  const leaves = el('span', {
    class: 'inline-flex items-center -space-x-0.5',
    attrs: { 'aria-hidden': 'true' },
  });
  for (let i = 1; i <= 3; i += 1) {
    const filled = i <= level;
    const svg = icon('leaf', {
      class: `${leafClass} ${filled ? 'text-forest fill-sage-300' : 'text-sage-400 opacity-60'}`,
      strokeWidth: 2,
    });
    leaves.append(svg);
  }
  return el('span', { class: 'inline-flex items-center gap-1.5', dataset: { difficulty } }, [
    leaves,
    el('span', { class: 'font-semibold', text: t(`difficulty.${difficulty}`) }),
  ]);
}

export function timeBadge(minutes) {
  return el('span', { class: 'inline-flex items-center gap-1.5' }, [
    icon('clock', { class: 'size-4 text-forest' }),
    el('span', { class: 'font-semibold', text: formatTime(minutes) }),
  ]);
}

/**
 * Returns `url` only when it is a same-origin absolute path ('/uploads/...', '/images/...'),
 * otherwise null. Rejects schemes (javascript:, data:, http:), protocol-relative '//host' and
 * backslash tricks, so an unexpected API value never points an image at another origin.
 */
export function safePhotoUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return null;
  // Printable ASCII only (no whitespace/control characters); server and seed paths are ASCII.
  if (url.includes('\\') || /[^!-~]/.test(url)) return null;
  return url;
}

/** Set a photo with a placeholder fallback when the URL is missing/unsafe or fails to load. */
export function setPhoto(img, url) {
  if (!img.dataset.fallbackBound) {
    img.dataset.fallbackBound = 'true';
    img.addEventListener('error', () => {
      if (!img.src.endsWith(PLACEHOLDER_PHOTO)) img.src = PLACEHOLDER_PHOTO;
    });
  }
  img.src = safePhotoUrl(url) || PLACEHOLDER_PHOTO;
}
