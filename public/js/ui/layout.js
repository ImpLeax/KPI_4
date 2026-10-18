import { applyTranslations, getLang, initI18n, setLang, SUPPORTED_LANGS } from '../i18n.js';
import { el } from './dom.js';
import { hydrateIcons, icon } from './icons.js';

function brand() {
  return el('a', { class: 'group flex items-center gap-3 rounded-2xl', attrs: { href: '/' } }, [
    el(
      'span',
      {
        class:
          'flex size-11 items-center justify-center rounded-full bg-forest text-cream shadow-soft',
      },
      [icon('recycle', { class: 'size-6', strokeWidth: 1.75 })],
    ),
    el('span', { class: 'flex flex-col leading-tight' }, [
      el('span', {
        class: 'font-display text-xl font-bold text-ink',
        dataset: { i18n: 'brand.name' },
      }),
      el('span', {
        class: 'hidden text-sm text-ink-muted sm:block',
        dataset: { i18n: 'brand.tagline' },
      }),
    ]),
  ]);
}

function langSwitch() {
  const group = el('div', {
    class: 'flex items-center rounded-full border border-sage-300 bg-paper p-1',
    attrs: { role: 'group' },
    dataset: { i18nAriaLabel: 'lang.switchLabel', testid: 'lang-switch' },
  });
  const buttons = SUPPORTED_LANGS.map((lang) =>
    el('button', {
      class:
        'min-h-9 min-w-11 rounded-full px-3 text-sm font-bold text-forest-dark transition-colors aria-pressed:bg-forest aria-pressed:text-white hover:bg-sage-100 aria-pressed:hover:bg-forest',
      attrs: { type: 'button', 'aria-pressed': String(lang === getLang()), lang },
      dataset: { lang, i18n: `lang.${lang}Short`, i18nAriaLabel: `lang.${lang}Full` },
      on: {
        click: async () => {
          try {
            await setLang(lang);
          } catch {
            // The locale file could not be loaded; keep the current language.
          }
          buttons.forEach((button) =>
            button.setAttribute('aria-pressed', String(button.dataset.lang === getLang())),
          );
        },
      },
    }),
  );
  group.append(...buttons);
  return group;
}

function navLink(href, key, active, extraClass) {
  return el('a', {
    class: extraClass,
    attrs: { href, 'aria-current': active ? 'page' : null },
    dataset: { i18n: key },
  });
}

export function renderHeader(activePage) {
  const host = document.getElementById('site-header');
  if (!host) return;
  const catalogLink = navLink(
    '/',
    'nav.catalog',
    activePage === 'catalog',
    'inline-flex min-h-11 items-center rounded-full px-4 font-bold text-ink hover:bg-sage-200 aria-[current=page]:bg-sage-200',
  );
  const addLink = el('a', { class: 'btn btn-primary', attrs: { href: '/idea-form.html' } }, [
    icon('plus', { class: 'size-5', strokeWidth: 2.25 }),
    el('span', { dataset: { i18n: 'nav.addIdea' } }),
  ]);
  if (activePage === 'add') addLink.setAttribute('aria-current', 'page');

  const header = el('header', { class: 'relative z-20' }, [
    el(
      'div',
      {
        class:
          'container-page flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4 sm:py-5',
      },
      [
        brand(),
        el(
          'nav',
          { class: 'order-3 w-full sm:order-2 sm:w-auto', dataset: { i18nAriaLabel: 'nav.label' } },
          [
            el('ul', { class: 'flex items-center gap-2 sm:gap-3' }, [
              el('li', {}, [catalogLink]),
              el('li', {}, [addLink]),
            ]),
          ],
        ),
        el('div', { class: 'order-2 sm:order-3' }, [langSwitch()]),
      ],
    ),
  ]);
  host.replaceWith(header);
}

export function renderFooter() {
  const host = document.getElementById('site-footer');
  if (!host) return;
  const footer = el('footer', { class: 'relative mt-20 bg-sage-200 text-ink' }, [
    el(
      'div',
      {
        class:
          'container-page flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between',
      },
      [
        el('div', { class: 'flex items-center gap-3' }, [
          el(
            'span',
            { class: 'flex size-10 items-center justify-center rounded-full bg-forest text-cream' },
            [icon('recycle', { class: 'size-5' })],
          ),
          el('div', { class: 'leading-snug' }, [
            el('p', { class: 'font-display text-lg font-bold', dataset: { i18n: 'brand.name' } }),
            el('p', { class: 'text-sm text-ink-muted', dataset: { i18n: 'footer.note' } }),
          ]),
        ]),
        el('nav', { dataset: { i18nAriaLabel: 'footer.navLabel' } }, [
          el('ul', { class: 'flex flex-wrap gap-x-6 gap-y-2 font-semibold' }, [
            el('li', {}, [
              el('a', {
                class: 'underline-offset-4 hover:underline',
                attrs: { href: '/' },
                dataset: { i18n: 'nav.catalog' },
              }),
            ]),
            el('li', {}, [
              el('a', {
                class: 'underline-offset-4 hover:underline',
                attrs: { href: '/idea-form.html' },
                dataset: { i18n: 'nav.addIdea' },
              }),
            ]),
            el('li', {}, [
              el('a', {
                class: 'underline-offset-4 hover:underline',
                attrs: { href: '/api/docs' },
                dataset: { i18n: 'footer.api' },
              }),
            ]),
          ]),
        ]),
      ],
    ),
  ]);
  host.replaceWith(footer);
}

/** Common bootstrap for every page: translations, shared header/footer, static icons. */
export async function bootPage(activePage) {
  await initI18n();
  renderHeader(activePage);
  renderFooter();
  hydrateIcons();
  applyTranslations();
}
