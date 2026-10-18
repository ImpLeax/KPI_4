import { getIdeas, getMaterials } from '../api.js';
import { getLang, t, tp } from '../i18n.js';
import { renderIdeaCard, renderSkeletonCard } from '../ui/card.js';
import { $, $all, clear, debounce, el, show } from '../ui/dom.js';
import {
  DIFFICULTIES,
  IDEA_CATEGORIES,
  MATERIAL_CATEGORIES,
  SORTS,
  safePhotoUrl,
  setPhoto,
} from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { bootPage } from '../ui/layout.js';

const DEFAULT_SORT = 'difficulty_asc';
const SEARCH_DEBOUNCE_MS = 300;

const state = {
  materials: new Set(),
  difficulty: new Set(),
  category: '',
  q: '',
  sort: DEFAULT_SORT,
};

let materialsList = [];
let ideasController = null;
let materialsExpanded = false;

const refs = {};

/* ---------- URL <-> state ---------- */

function readStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const ids = (params.get('materials') || '')
    .split(',')
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  state.materials = new Set(ids);
  state.difficulty = new Set(
    (params.get('difficulty') || '').split(',').filter((d) => DIFFICULTIES.includes(d)),
  );
  const category = params.get('category') || '';
  state.category = IDEA_CATEGORIES.includes(category) ? category : '';
  state.q = (params.get('q') || '').slice(0, 100);
  const sort = params.get('sort') || DEFAULT_SORT;
  state.sort = SORTS.includes(sort) ? sort : DEFAULT_SORT;
}

function writeStateToUrl() {
  const params = new URLSearchParams();
  if (state.materials.size)
    params.set('materials', [...state.materials].sort((a, b) => a - b).join(','));
  if (state.difficulty.size)
    params.set('difficulty', DIFFICULTIES.filter((d) => state.difficulty.has(d)).join(','));
  if (state.category) params.set('category', state.category);
  if (state.q.trim()) params.set('q', state.q.trim());
  if (state.sort !== DEFAULT_SORT) params.set('sort', state.sort);
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', url);
}

function apiParams() {
  return {
    lang: getLang(),
    materials: state.materials.size ? [...state.materials].sort((a, b) => a - b) : undefined,
    difficulty: state.difficulty.size
      ? DIFFICULTIES.filter((d) => state.difficulty.has(d))
      : undefined,
    category: state.category || undefined,
    q: state.q.trim() || undefined,
    sort: state.sort,
  };
}

/* ---------- Controls ---------- */

function syncControls() {
  refs.search.value = state.q;
  refs.category.value = state.category;
  refs.sort.value = state.sort;
  $all('[data-difficulty]', refs.filters).forEach((button) => {
    button.setAttribute('aria-pressed', String(state.difficulty.has(button.dataset.difficulty)));
  });
  $all('input[name="materials"]', refs.materialsGroups).forEach((input) => {
    input.checked = state.materials.has(Number(input.value));
  });
  updateMaterialsSummary();
}

function updateMaterialsSummary() {
  const count = state.materials.size;
  refs.materialsCount.textContent = tp('filters.selectedCount', count);
  show(refs.materialsCount, count > 0);
  show(refs.materialsClear, count > 0);
  refs.materialsToggleLabel.textContent = `${t(materialsExpanded ? 'filters.hideMaterials' : 'filters.showMaterials')}${
    count ? ` (${count})` : ''
  }`;
}

function setMaterialsExpanded(expanded) {
  materialsExpanded = expanded;
  refs.materialsToggle.setAttribute('aria-expanded', String(expanded));
  refs.materialsGroups.classList.toggle('max-lg:hidden', !expanded);
  refs.materialsToggle.querySelector('svg')?.classList.toggle('rotate-180', expanded);
  updateMaterialsSummary();
}

function renderMaterials() {
  clear(refs.materialsGroups);
  for (const category of MATERIAL_CATEGORIES) {
    const items = materialsList.filter((m) => m.category === category);
    if (!items.length) continue;
    const headingId = `matcat-${category}`;
    const chips = items.map((material) =>
      el('label', { class: 'chip', dataset: { testid: 'material-option' } }, [
        el('input', {
          attrs: {
            type: 'checkbox',
            name: 'materials',
            value: material.id,
            checked: state.materials.has(material.id),
          },
        }),
        icon('check', { class: 'chip-check size-4', strokeWidth: 2.5 }),
        el('span', { text: material.name }),
      ]),
    );
    refs.materialsGroups.append(
      el('div', { attrs: { role: 'group', 'aria-labelledby': headingId } }, [
        el('p', {
          class: 'mb-2 text-sm font-bold text-ink-muted',
          attrs: { id: headingId },
          text: t(`materialCategory.${category}`),
        }),
        el('div', { class: 'flex flex-wrap gap-2' }, chips),
      ]),
    );
  }
}

async function loadMaterials() {
  try {
    materialsList = await getMaterials(getLang());
    show(refs.materialsError, false);
    // Drop ids from a shared URL that no longer exist, so the API does not reject the request.
    const known = new Set(materialsList.map((m) => m.id));
    state.materials = new Set([...state.materials].filter((id) => known.has(id)));
  } catch {
    materialsList = [];
    show(refs.materialsError, true);
  }
  renderMaterials();
  updateMaterialsSummary();
}

/* ---------- Results ---------- */

function showLoading() {
  refs.grid.setAttribute('aria-busy', 'true');
  show(refs.error, false);
  if (!refs.grid.children.length || refs.grid.dataset.state !== 'results') {
    show(refs.empty, false);
    show(refs.grid, true);
    refs.grid.replaceChildren(...Array.from({ length: 6 }, renderSkeletonCard));
    refs.grid.dataset.state = 'loading';
    refs.status.textContent = t('results.loading');
  } else {
    refs.grid.classList.add('opacity-60');
  }
}

function renderResults({ items, total }) {
  refs.grid.classList.remove('opacity-60');
  refs.grid.setAttribute('aria-busy', 'false');
  show(refs.error, false);
  show(refs.modeHint, state.materials.size > 0 && items.length > 0);
  refs.status.textContent = tp('results.count', total ?? items.length);

  if (!items.length) {
    clear(refs.grid);
    refs.grid.dataset.state = 'empty';
    show(refs.grid, false);
    show(refs.empty, true);
    return;
  }
  show(refs.empty, false);
  show(refs.grid, true);
  refs.grid.dataset.state = 'results';
  refs.grid.replaceChildren(...items.map(renderIdeaCard));
}

function renderError(error) {
  refs.grid.classList.remove('opacity-60');
  refs.grid.setAttribute('aria-busy', 'false');
  clear(refs.grid);
  refs.grid.dataset.state = 'error';
  show(refs.grid, false);
  show(refs.empty, false);
  show(refs.modeHint, false);
  refs.status.textContent = '';
  const key = `errors.${error?.code}`;
  refs.errorText.textContent = error?.code === 'NETWORK_ERROR' ? t(key) : t('results.errorText');
  show(refs.error, true);
}

async function loadIdeas() {
  ideasController?.abort();
  const controller = new AbortController();
  ideasController = controller;
  showLoading();
  try {
    const data = await getIdeas(apiParams(), { signal: controller.signal });
    if (controller.signal.aborted) return;
    renderResults(data);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    renderError(error);
  }
}

function onFiltersChanged() {
  writeStateToUrl();
  updateMaterialsSummary();
  loadIdeas();
}

/* ---------- Hero ---------- */

function canLoadImage(url) {
  return new Promise((resolve) => {
    const probe = new Image();
    probe.addEventListener('load', () => resolve(true));
    probe.addEventListener('error', () => resolve(false));
    probe.src = url;
  });
}

/** Hero shows the oldest catalog photo that actually loads (seed ideas come first). */
async function pickHeroPhoto(items) {
  const candidates = items
    .map((idea) => safePhotoUrl(idea.photoUrl))
    .filter(Boolean)
    .slice(0, 8);
  for (const url of candidates) {
    if (await canLoadImage(url)) return url;
  }
  return null;
}

async function loadHero() {
  try {
    const { items, total } = await getIdeas({ lang: getLang(), sort: 'newest' });
    if (!refs.heroPhoto.getAttribute('src')) {
      setPhoto(refs.heroPhoto, await pickHeroPhoto([...items].reverse()));
    }
    refs.heroCount.textContent = String(total);
    refs.heroCountLabel.textContent = tp('hero.countLabel', total);
    show(refs.heroBadge, true);
  } catch {
    if (!refs.heroPhoto.getAttribute('src')) setPhoto(refs.heroPhoto, null);
    show(refs.heroBadge, false);
  }
}

/* ---------- Wiring ---------- */

function bindEvents() {
  const onSearch = debounce(() => {
    const value = refs.search.value.slice(0, 100);
    if (value.trim() === state.q.trim()) return;
    state.q = value;
    onFiltersChanged();
  }, SEARCH_DEBOUNCE_MS);
  refs.search.addEventListener('input', onSearch);
  refs.search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') event.preventDefault();
  });

  refs.materialsGroups.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.name !== 'materials') return;
    const id = Number(input.value);
    if (input.checked) state.materials.add(id);
    else state.materials.delete(id);
    onFiltersChanged();
  });

  refs.materialsClear.addEventListener('click', () => {
    state.materials.clear();
    syncControls();
    onFiltersChanged();
    // The clear button hides itself, so keep focus inside the materials list.
    refs.materialsGroups.querySelector('input')?.focus();
  });

  refs.materialsToggle.addEventListener('click', () => setMaterialsExpanded(!materialsExpanded));

  $all('[data-difficulty]', refs.filters).forEach((button) => {
    button.addEventListener('click', () => {
      const level = button.dataset.difficulty;
      if (state.difficulty.has(level)) state.difficulty.delete(level);
      else state.difficulty.add(level);
      button.setAttribute('aria-pressed', String(state.difficulty.has(level)));
      onFiltersChanged();
    });
  });

  refs.category.addEventListener('change', () => {
    state.category = refs.category.value;
    onFiltersChanged();
  });

  refs.sort.addEventListener('change', () => {
    state.sort = refs.sort.value;
    onFiltersChanged();
  });

  const resetAll = () => {
    state.materials.clear();
    state.difficulty.clear();
    state.category = '';
    state.q = '';
    state.sort = DEFAULT_SORT;
    syncControls();
    onFiltersChanged();
  };
  refs.reset.addEventListener('click', resetAll);
  refs.emptyReset.addEventListener('click', () => {
    resetAll();
    refs.search.focus();
  });
  refs.retry.addEventListener('click', () => loadIdeas());

  document.addEventListener('langchange', async () => {
    updateMaterialsSummary();
    await loadMaterials();
    syncControls();
    loadIdeas();
    loadHero();
  });
}

async function init() {
  await bootPage('catalog');

  Object.assign(refs, {
    filters: $('#filters'),
    search: $('#search'),
    category: $('#category'),
    sort: $('#sort'),
    materialsGroups: $('#materials-groups'),
    materialsCount: $('#materials-count'),
    materialsClear: $('#materials-clear'),
    materialsError: $('#materials-error'),
    materialsToggle: $('#materials-toggle'),
    materialsToggleLabel: $('#materials-toggle-label'),
    reset: $('#filters-reset'),
    grid: $('#results-grid'),
    status: $('#results-status'),
    modeHint: $('#mode-hint'),
    empty: $('#empty-state'),
    emptyReset: $('#empty-reset'),
    error: $('#error-state'),
    errorText: $('#error-text'),
    retry: $('#retry'),
    heroPhoto: $('#hero-photo'),
    heroBadge: $('#hero-badge'),
    heroCount: $('#hero-count'),
    heroCountLabel: $('#hero-count-label'),
  });

  readStateFromUrl();
  // Shared links with selected materials open the panel on phones so the selection is visible.
  setMaterialsExpanded(state.materials.size > 0);
  syncControls();
  bindEvents();
  showLoading();
  loadHero();
  await loadMaterials();
  syncControls();
  writeStateToUrl();
  loadIdeas();
}

init();
