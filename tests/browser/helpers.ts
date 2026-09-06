import { expect, type Page } from '@playwright/test';

/** Use the visible sign-in flow; retain a restored identity on reloads and new tabs. */
export async function ensureSalesIdentity(page: Page) {
  const identity = page.getByTestId('current-sales-identity');
  const signIn = page.getByRole('banner').getByRole('button', { name: /\bSign in$/ });
  await expect(identity.or(signIn)).toBeVisible();
  if (await identity.isVisible()) return;
  await signIn.click();
  const dialog = page.getByRole('dialog', { name: 'Sales sign in', exact: true });
  await dialog.getByRole('textbox', { name: 'Username', exact: true }).fill('Synthetic regression sales');
  await dialog.getByRole('textbox', { name: 'Sales ID', exact: true }).fill('LEGACY-REGRESSION-SALES');
  await dialog.getByRole('button', { name: 'Continue as sales', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(identity).toContainText('LEGACY-REGRESSION-SALES');
}

export async function openPropertyLibrary(page: Page, expectedCount = '8') {
  const existingDocument = page.url() !== 'about:blank';
  await page.goto('/#/properties');
  // A changed hash alone does not reload a newly routed fixture or another data version.
  if (existingDocument) await page.reload();
  await ensureSalesIdentity(page);
  // Signing in intentionally returns to Home. An existing identity is never overwritten.
  if (!new URL(page.url()).hash.startsWith('#/properties')) await page.goto('/#/properties');
  await expect(page.getByTestId('result-count')).toHaveText(expectedCount);
  await expect(page.getByTestId('local-storage-notice')).not.toContainText('Loading browser copies');
}

export async function newRequirement(page: Page) {
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name: /\bHome$/ }).click();
  const editor = page.getByRole('region', { name: 'Client requirements', exact: true });
  await expect(editor).toBeVisible();
  return editor;
}
