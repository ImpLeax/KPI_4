import { ApiError, deleteIdea, getIdea } from '../api.js';
import { getLang, t, tp } from '../i18n.js';
import { $, clear, el, show } from '../ui/dom.js';
import { difficultyBadge, setPhoto, timeBadge } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { bootPage } from '../ui/layout.js';

const refs = {};
let ideaId = null;
let currentIdea = null;

function parseId() {
  const raw = new URLSearchParams(window.location.search).get('id');
  return raw && /^[1-9]\d*$/.test(raw) ? raw : null;
}

function setView(view) {
  show(refs.loading, view === 'loading');
  show(refs.notFound, view === 'not-found');
  show(refs.error, view === 'error');
  show(refs.idea, view === 'idea');
  if (view === 'not-found') document.title = t('meta.notFoundTitle');
}

function materialItem(material) {
  return el(
    'li',
    {
      class: 'flex items-start gap-3 rounded-2xl bg-paper px-4 py-3',
      dataset: { materialId: String(material.id) },
    },
    [
      icon(material.isRequired ? 'check' : 'plus', {
        class: `mt-0.5 size-5 flex-none ${material.isRequired ? 'text-forest' : 'text-clay'}`,
        strokeWidth: 2.25,
      }),
      el(
        'span',
        { class: 'flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3' },
        [
          el('span', { class: 'font-semibold [overflow-wrap:anywhere]', text: material.name }),
          material.quantity
            ? el('span', {
                class: 'text-sm text-ink-muted [overflow-wrap:anywhere]',
                text: material.quantity,
              })
            : null,
        ],
      ),
    ],
  );
}

function renderIdea(idea) {
  currentIdea = idea;
  document.title = t('meta.ideaTitle', { title: idea.title });

  refs.category.textContent = t(`category.${idea.category}`);
  refs.title.textContent = idea.title;
  refs.description.textContent = idea.description || '';
  show(refs.description, Boolean(idea.description));
  refs.difficulty.replaceChildren(difficultyBadge(idea.difficulty, { size: 'lg' }));
  refs.time.replaceChildren(timeBadge(idea.estimatedTime));
  refs.photo.alt = idea.title;
  setPhoto(refs.photo, idea.photoUrl);
  refs.edit.href = `/idea-form.html?id=${encodeURIComponent(idea.id)}`;

  const required = idea.materials.filter((m) => m.isRequired);
  const optional = idea.materials.filter((m) => !m.isRequired);
  refs.required.replaceChildren(...required.map(materialItem));
  refs.optional.replaceChildren(...optional.map(materialItem));
  show(refs.optionalBlock, optional.length > 0);

  refs.tools.replaceChildren(
    ...idea.tools.map((tool) =>
      el('li', {
        class: 'rounded-full bg-paper px-3.5 py-1.5 text-sm font-semibold',
        text: tool.name,
      }),
    ),
  );
  show(refs.tools, idea.tools.length > 0);
  show(refs.noTools, idea.tools.length === 0);

  const steps = [...idea.steps].sort((a, b) => a.number - b.number);
  refs.stepsCount.textContent = tp('idea.stepsCount', steps.length);
  clear(refs.steps);
  for (const step of steps) {
    refs.steps.append(
      el(
        'li',
        {
          class:
            'flex gap-4 rounded-[1.5rem] border border-line bg-paper p-5 shadow-soft sm:gap-5 sm:p-6',
          dataset: { testid: 'step' },
        },
        [
          el('span', {
            class: 'step-number',
            attrs: { 'aria-hidden': 'true' },
            text: String(step.number),
          }),
          el('p', {
            class: 'min-w-0 self-center text-[1.0625rem] leading-relaxed [overflow-wrap:anywhere]',
            text: step.text,
          }),
        ],
      ),
    );
  }

  setView('idea');
}

async function loadIdea() {
  if (!ideaId) {
    setView('not-found');
    return;
  }
  if (!currentIdea) setView('loading');
  try {
    renderIdea(await getIdea(ideaId, getLang()));
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      setView('not-found');
      return;
    }
    refs.errorText.textContent =
      error?.code === 'NETWORK_ERROR' ? t('errors.NETWORK_ERROR') : t('errors.generic');
    setView('error');
  }
}

/* ---------- Delete ---------- */

function openDeleteDialog() {
  if (!currentIdea) return;
  refs.deleteText.textContent = t('idea.deleteText', { title: currentIdea.title });
  show(refs.deleteError, false);
  refs.deleteConfirm.disabled = false;
  refs.deleteConfirm.textContent = t('idea.deleteConfirm');
  refs.dialog.showModal();
}

async function confirmDelete() {
  refs.deleteConfirm.disabled = true;
  refs.deleteConfirm.textContent = t('idea.deleting');
  show(refs.deleteError, false);
  try {
    await deleteIdea(ideaId);
    window.location.assign('/');
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      window.location.assign('/');
      return;
    }
    refs.deleteError.textContent =
      error instanceof ApiError && t(`errors.${error.code}`) !== `errors.${error.code}`
        ? t(`errors.${error.code}`)
        : t('idea.deleteError');
    show(refs.deleteError, true);
    refs.deleteConfirm.disabled = false;
    refs.deleteConfirm.textContent = t('idea.deleteConfirm');
  }
}

async function init() {
  await bootPage('idea');
  Object.assign(refs, {
    loading: $('#idea-loading'),
    notFound: $('#idea-not-found'),
    error: $('#idea-error'),
    errorText: $('#idea-error-text'),
    retry: $('#idea-retry'),
    idea: $('#idea'),
    category: $('#idea-category'),
    title: $('#idea-title'),
    description: $('#idea-description'),
    difficulty: $('#idea-difficulty'),
    time: $('#idea-time'),
    photo: $('#idea-photo'),
    edit: $('#idea-edit'),
    deleteButton: $('#idea-delete'),
    required: $('#materials-required'),
    optional: $('#materials-optional'),
    optionalBlock: $('#materials-optional-block'),
    tools: $('#idea-tools'),
    noTools: $('#idea-no-tools'),
    steps: $('#idea-steps'),
    stepsCount: $('#steps-count'),
    dialog: $('#delete-dialog'),
    deleteText: $('#delete-text'),
    deleteError: $('#delete-error'),
    deleteConfirm: $('#delete-confirm'),
  });

  ideaId = parseId();
  refs.retry.addEventListener('click', loadIdea);
  refs.deleteButton.addEventListener('click', openDeleteDialog);
  refs.deleteConfirm.addEventListener('click', confirmDelete);
  document.addEventListener('langchange', loadIdea);
  await loadIdea();
}

init();
