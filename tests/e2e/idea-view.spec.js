import { expect, test } from '@playwright/test';

test('opens a master class from the catalog with numbered steps, materials and tools', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Кораблики з газети' }).click();

  await expect(page).toHaveURL(/\/idea\.html\?id=19$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Кораблики з газети' })).toBeVisible();
  await expect(page.getByTestId('idea-difficulty')).toContainText('Легко');
  await expect(page.getByTestId('idea-time')).toHaveText('10 хв');
  await expect(page.getByTestId('materials-required')).toContainText('Газета');
  await expect(page.getByTestId('idea-tools')).toContainText('Ножиці');

  const steps = page.getByTestId('step-list').getByTestId('step');
  await expect(steps).toHaveCount(5);
  for (let i = 0; i < 5; i += 1) {
    await expect(steps.nth(i).locator('.step-number')).toHaveText(String(i + 1));
  }
  await expect(steps.first()).toContainText('Виріжте з газетного аркуша');
});

test('shows optional materials separately from required ones', async ({ page }) => {
  await page.goto('/idea.html?id=1');
  await expect(page.getByTestId('materials-required').getByRole('listitem')).toHaveCount(3);
  await expect(page.getByTestId('materials-optional')).toContainText('Акрилова фарба');
});

test('shows the not-found state for a missing idea', async ({ page }) => {
  await page.goto('/idea.html?id=9999');
  await expect(page.getByTestId('not-found')).toBeVisible();
  await expect(page.getByTestId('idea-detail')).toBeHidden();
});
