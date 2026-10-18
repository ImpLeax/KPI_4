import { expect, test } from '@playwright/test';

const HARD_IDEAS = ['7', '10', '12', '13', '14', '22', '24'];

/** Below 1024px the materials list is collapsed behind a toggle; open it when needed. */
async function openMaterials(page) {
  const toggle = page.getByTestId('materials-toggle');
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
}

const cards = (page) => page.getByTestId('results-grid').getByTestId('idea-card');
const materialChip = (page, name) =>
  page.getByTestId('material-option').filter({ has: page.getByText(name, { exact: true }) });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(cards(page)).toHaveCount(25);
});

test('filters by materials and shows a full match first, then a partial match', async ({
  page,
}) => {
  await openMaterials(page);
  // Scenario S3 + twine: jar + paint -> idea 17 partial; adding twine makes it full.
  await materialChip(page, 'Скляна банка').click();
  await materialChip(page, 'Акрилова фарба').click();

  await expect(page).toHaveURL(/[?&]materials=8%2C22(&|$)/);
  await expect(cards(page)).toHaveCount(1);
  const card = cards(page).first();
  await expect(card).toHaveAttribute('data-idea-id', '17');
  await expect(card.getByTestId('match-badge')).toHaveAttribute('data-match', 'partial');
  await expect(card.getByTestId('missing-materials')).toContainText('Джутовий шпагат');

  await materialChip(page, 'Джутовий шпагат').click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first().getByTestId('match-badge')).toHaveAttribute(
    'data-match',
    'full',
  );
});

test('shows the empty state when no idea matches the selected materials', async ({ page }) => {
  await openMaterials(page);
  await materialChip(page, 'Стара лампочка розжарювання').click();

  const empty = page.getByTestId('empty-state');
  await expect(empty).toBeVisible();
  await expect(empty).toContainText('За вашим запитом нічого не знайдено');
  await expect(cards(page)).toHaveCount(0);

  // Resetting the filters brings the whole catalog back.
  await empty.getByRole('button', { name: 'Скинути фільтри' }).click();
  await expect(empty).toBeHidden();
  await expect(cards(page)).toHaveCount(25);
});

test('filters the catalog by difficulty', async ({ page }) => {
  const hard = page.getByTestId('difficulty-filter').getByRole('button', { name: 'Складно' });
  await hard.click();
  await expect(hard).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/difficulty=hard/);
  await expect(cards(page)).toHaveCount(HARD_IDEAS.length);
  const ids = await cards(page).evaluateAll((nodes) => nodes.map((n) => n.dataset.ideaId));
  expect(ids).toEqual(HARD_IDEAS);
  await expect(page.getByTestId('results-status')).toHaveText('Знайдено 7 ідей');
});

test('restores selected materials from a shared URL', async ({ page }) => {
  await page.goto('/?materials=6');
  // The materials panel opens automatically on narrow screens when the URL has materials.
  await expect(page.getByRole('checkbox', { name: 'Газета', exact: true })).toBeChecked();
  await expect(materialChip(page, 'Газета')).toBeVisible();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toHaveAttribute('data-idea-id', '19');
});
