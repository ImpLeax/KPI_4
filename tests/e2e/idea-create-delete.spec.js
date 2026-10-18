import { expect, test } from '@playwright/test';
import { tinyPng } from '../helpers/images.js';

test('creates an idea with a photo, shows it, then deletes it', async ({ page }, testInfo) => {
  const title = `E2E bottle lantern (${testInfo.project.name})`;

  await page.goto('/idea-form.html');
  const form = page.getByTestId('idea-form');
  await expect(form).toBeVisible();

  await form.getByRole('textbox', { name: 'Назва', exact: true }).fill(title);
  await page.getByTestId('field-category').selectOption('decor');
  await page.getByTestId('field-time').fill('25');
  await page.getByTestId('field-difficulty').getByText('Легко').click();
  await page.getByTestId('field-description').fill('Created by the Playwright smoke test.');

  await page.getByRole('checkbox', { name: 'Пластикова пляшка (від 1,5 л)', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Акрилова фарба', exact: true }).check();
  // Mark the paint as optional.
  await page.getByRole('switch', { name: "Акрилова фарба — обов'язковий" }).uncheck();
  await page.getByTestId('tool-option').filter({ hasText: 'Ножиці' }).click();

  await page.getByLabel('Крок 1', { exact: true }).fill('Cut the bottle in half');
  await page.getByTestId('add-step').click();
  await page.getByLabel('Крок 2', { exact: true }).fill('Paint the outside');

  await page.getByTestId('field-photo-input').setInputFiles({
    name: 'lantern.png',
    mimeType: 'image/png',
    buffer: tinyPng(),
  });

  await page.getByTestId('form-submit').click();
  await page.waitForURL(/\/idea\.html\?id=\d+$/);
  const id = new URL(page.url()).searchParams.get('id');

  await expect(page.getByTestId('idea-title')).toHaveText(title);
  const steps = page.getByTestId('step-list').getByTestId('step');
  await expect(steps).toHaveCount(2);
  await expect(steps.nth(0)).toContainText('Cut the bottle in half');
  await expect(steps.nth(1)).toContainText('Paint the outside');
  await expect(page.getByTestId('materials-optional')).toContainText('Акрилова фарба');

  const created = await (await page.request.get(`/api/ideas/${id}`)).json();
  expect(created.photoUrl).toMatch(/^\/uploads\/.+\.png$/);
  expect((await page.request.get(created.photoUrl)).status()).toBe(200);

  await page.getByTestId('idea-delete').click();
  const dialog = page.getByTestId('delete-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('delete-confirm').click();
  await page.waitForURL((url) => url.pathname === '/');

  expect((await page.request.get(`/api/ideas/${id}`)).status()).toBe(404);
  // The uploaded photo is removed together with the idea.
  expect((await page.request.get(created.photoUrl)).status()).toBe(404);
});

test('shows client-side validation errors for an empty form', async ({ page }) => {
  await page.goto('/idea-form.html');
  await expect(page.getByTestId('idea-form')).toBeVisible();
  await page.getByTestId('form-submit').click();

  const summary = page.getByTestId('error-summary');
  await expect(summary).toBeVisible();
  await expect(summary.getByRole('listitem')).toHaveCount(7);
  await expect(page).toHaveURL(/\/idea-form\.html$/);
});
