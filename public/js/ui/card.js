import { t } from '../i18n.js';
import { el } from './dom.js';
import { difficultyBadge, setPhoto, timeBadge } from './format.js';
import { icon } from './icons.js';

function matchBadge(idea) {
  if (idea.matchType === 'full') {
    return el(
      'p',
      {
        class: 'tag bg-sage-200 text-forest-dark',
        dataset: { testid: 'match-badge', match: 'full' },
      },
      [icon('check', { class: 'size-4', strokeWidth: 2.5 }), el('span', { text: t('match.full') })],
    );
  }
  if (idea.matchType === 'partial') {
    const missing = (idea.missingMaterials || []).map((m) => m.name).join(', ');
    return el('div', { class: 'flex flex-col items-start gap-1.5' }, [
      el(
        'p',
        {
          class: 'tag bg-clay-soft text-clay-dark',
          dataset: { testid: 'match-badge', match: 'partial' },
        },
        [
          icon('alert', { class: 'size-4', strokeWidth: 2.25 }),
          el('span', { text: t('match.partial') }),
        ],
      ),
      el('p', {
        class: 'text-sm text-ink-muted',
        text: t('match.missing', { materials: missing }),
        dataset: { testid: 'missing-materials' },
      }),
    ]);
  }
  return null;
}

/** Catalog card. The title link stretches over the whole card, so the card is one tab stop. */
export function renderIdeaCard(idea) {
  const img = el('img', {
    class: 'aspect-[4/3] w-full rounded-[1.25rem] bg-sage-100 object-cover',
    attrs: { alt: '', loading: 'lazy', decoding: 'async', width: 640, height: 480 },
  });
  setPhoto(img, idea.photoUrl);
  const badge = matchBadge(idea);

  return el(
    'article',
    { class: 'card group', dataset: { testid: 'idea-card', ideaId: String(idea.id) } },
    [
      el('div', { class: 'p-3 pb-0' }, [img]),
      el('div', { class: 'flex flex-1 flex-col gap-3 p-5 pt-4' }, [
        el('p', {
          class: 'text-sm font-semibold text-ink-muted',
          text: t(`category.${idea.category}`),
        }),
        el('h3', { class: 'text-xl leading-snug text-ink' }, [
          el('a', {
            class:
              'stretched-link decoration-clay decoration-2 underline-offset-4 group-hover:underline',
            attrs: { href: `/idea.html?id=${encodeURIComponent(idea.id)}` },
            text: idea.title,
          }),
        ]),
        el('div', { class: 'flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink' }, [
          difficultyBadge(idea.difficulty),
          timeBadge(idea.estimatedTime),
        ]),
        badge ? el('div', { class: 'mt-auto pt-1' }, [badge]) : null,
      ]),
    ],
  );
}

export function renderSkeletonCard() {
  return el('div', { class: 'card overflow-hidden', attrs: { 'aria-hidden': 'true' } }, [
    el('div', { class: 'p-3 pb-0' }, [
      el('div', { class: 'skeleton aspect-[4/3] w-full rounded-[1.25rem]' }),
    ]),
    el('div', { class: 'flex flex-col gap-3 p-5 pt-4' }, [
      el('div', { class: 'skeleton h-4 w-24 rounded-full' }),
      el('div', { class: 'skeleton h-6 w-4/5 rounded-full' }),
      el('div', { class: 'skeleton h-4 w-2/3 rounded-full' }),
    ]),
  ]);
}
