import { expect, test } from '@playwright/test';

test('switches the interface and content language and remembers the choice', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
  await expect(page.getByRole('link', { name: 'Кораблики з газети' })).toBeVisible();

  const langSwitch = page.getByTestId('lang-switch');
  await langSwitch.getByRole('button', { name: 'English' }).click();

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(langSwitch.getByRole('button', { name: 'English' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByRole('heading', { level: 1, name: 'Make something new from what you already have' }),
  ).toBeVisible();
  // Content from the API is reloaded in English.
  await expect(page.getByRole('link', { name: 'Newspaper origami boats' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('upcycling.lang'))).toBe('en');

  // The choice survives navigation to another page.
  await page.getByRole('link', { name: 'Newspaper origami boats' }).click();
  await expect(page.getByTestId('idea-title')).toHaveText('Newspaper origami boats');
  await expect(page.getByTestId('idea-time')).toHaveText('10 min');

  await page.getByTestId('lang-switch').getByRole('button', { name: 'Українська' }).click();
  await expect(page.getByTestId('idea-title')).toHaveText('Кораблики з газети');
  expect(await page.evaluate(() => localStorage.getItem('upcycling.lang'))).toBe('uk');
});

test('shows the English empty-state text', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('upcycling.lang', 'en'));
  await page.goto('/?materials=10');
  await expect(page.getByTestId('empty-state')).toContainText('Nothing matches your request');
});
