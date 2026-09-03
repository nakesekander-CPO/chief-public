import { expect, test } from '@playwright/test';

test('personal workspace starts empty and preserves governed capture', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name.includes('mobile');
  const navigate = async (name: string | RegExp) => {
    if (mobile) await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('button', { name }).click();
  };

  await page.goto('/');
  const bootstrap = await page.request.get('/api/state');
  const { csrfToken } = await bootstrap.json() as { csrfToken: string };
  await page.request.delete('/api/state', { headers: { 'x-chief-csrf': csrfToken, 'x-chief-confirm-reset': 'RESET PERSONAL DATA' } });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.today-label')?.textContent?.includes('Saved'));
  await expect(page.getByRole('heading', { name: 'Your workspace is ready for real evidence.' })).toBeVisible();
  await expect(page.getByText('Fictional data')).toHaveCount(0);
  await expect(page.getByText('Isolated workspace')).toBeVisible();

  await page.getByRole('button', { name: /Open connections/ }).click();
  await expect(page.getByRole('heading', { name: 'Google' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Awaiting Google credentials' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Microsoft 365' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Awaiting Microsoft 365 credentials' })).toBeDisabled();
  await expect(page.getByText('Setup needed')).toBeVisible();

  await page.getByRole('textbox', { name: 'New workspace' }).fill('Office 365 Work');
  await page.getByRole('button', { name: 'Create isolated workspace' }).click();
  await expect(page.getByText('Office 365 Work created with an independent data boundary.')).toBeVisible();
  await expect(page.getByLabel('Workspace')).toHaveValue(/ws-/);

  if (mobile) await page.getByRole('button', { name: 'Quick capture' }).click();
  else await page.getByRole('button', { name: /Capture/ }).first().click();
  await page.getByRole('textbox', { name: 'Quick capture' }).fill('Protect Thursday afternoon for the strategy review.');
  await page.getByRole('button', { name: 'Save and classify' }).click();
  await expect(page.getByText('Owner review required')).toBeVisible();
  await page.getByRole('button', { name: 'Approve classification' }).click();
  await expect(page.getByText('Capture approved as governed memory.')).toBeVisible();

  await navigate('Memory');
  await expect(page.getByText('Protect Thursday afternoon for the strategy review.')).toBeVisible();
  await expect(page.locator('.source-table .status.good', { hasText: 'APPROVED' })).toBeVisible();

  if (mobile) await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByLabel('Workspace').selectOption('private');
  await expect(page.getByRole('heading', { name: 'Your workspace is ready for real evidence.' })).toBeVisible();
  await expect(page.getByText('Protect Thursday afternoon for the strategy review.')).toHaveCount(0);
});
