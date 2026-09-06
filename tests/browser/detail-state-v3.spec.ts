import { expect, test, type Page } from '@playwright/test';
import { ensureSalesIdentity } from './helpers';

test.use({ viewport: { width: 1366, height: 768 } });
test.setTimeout(60000);

const client = (page: Page) => page.locator('.client-detail-drawer.ant-drawer-open .ant-drawer-content');
const property = (page: Page) => page.locator('.property-detail.ant-drawer-open .ant-drawer-content');
const directory = (page: Page) => page.getByRole('region', { name: 'Client directory', exact: true });

async function prepare(page: Page) {
  await page.goto('/');
  await ensureSalesIdentity(page);
}

async function viewClientFromProperty(page: Page) {
  await property(page).getByRole('tab', { name: 'Potential clients', exact: true }).click();
  await property(page).locator('article[data-client-id="DEMO-C-001"]').getByRole('button', { name: 'View Client Details', exact: true }).click();
  await expect(client(page)).toBeVisible();
}

async function viewPropertyFromClient(page: Page) {
  await client(page).getByRole('tab', { name: 'Recommended Properties', exact: true }).click();
  await client(page).getByRole('combobox', { name: 'Independent client plan', exact: true }).selectOption('DEMO-R-001');
  await client(page).locator('.client-detail-property[data-listing-id="DEMO-L-001"]').getByRole('button', { name: 'View Property Details', exact: true }).click();
  await expect(property(page)).toBeVisible();
}

async function viewingForm(page: Page) {
  await client(page).getByRole('tab', { name: 'Viewing History', exact: true }).click();
  const entry = client(page).locator('.client-detail-viewing-entry');
  if (await entry.getAttribute('open') === null) await entry.locator('summary').click();
  await entry.getByRole('combobox', { name: 'Viewed property', exact: true }).selectOption('DEMO-L-001');
  return entry;
}

test('saving a viewing in a nested instance refreshes its parent without discarding the parent draft', async ({ page }) => {
  await prepare(page);
  await page.goto('/#/clients');
  await directory(page).locator('article[data-client-id="DEMO-C-001"]').getByRole('button', { name: 'View Client Details' }).click();
  const outerForm = await viewingForm(page);
  await outerForm.getByLabel('Viewed at', { exact: true }).fill('2026-09-02T09:30');
  await outerForm.getByRole('textbox', { name: 'Viewing feedback', exact: true }).fill('Synthetic outer draft retained.');
  await viewPropertyFromClient(page);
  await viewClientFromProperty(page);
  const innerForm = await viewingForm(page);
  await innerForm.getByLabel('Viewed at', { exact: true }).fill('2026-09-03T10:30');
  await innerForm.getByRole('textbox', { name: 'Viewing feedback', exact: true }).fill('Synthetic inner viewing saved.');
  await innerForm.getByRole('button', { name: 'Save Viewing Record', exact: true }).click();
  await expect(client(page).getByTestId('client-viewing-count')).toHaveText('1 recorded viewings');
  await client(page).getByRole('button', { name: 'Close', exact: true }).click();
  await property(page).getByRole('button', { name: 'Close', exact: true }).click();
  await client(page).getByRole('tab', { name: 'Viewing History', exact: true }).click();
  await expect(client(page).getByTestId('client-viewing-count')).toHaveText('1 recorded viewings');
  await expect(client(page).getByRole('textbox', { name: 'Viewing feedback', exact: true })).toHaveValue('Synthetic outer draft retained.');
  await expect(client(page).getByLabel('Viewed at', { exact: true })).toHaveValue('2026-09-02T09:30');
  await client(page).getByRole('button', { name: 'Save Viewing Record', exact: true }).click();
  await expect(client(page).getByTestId('viewing-save-status')).toContainText('Saved to this browser');
  await expect(client(page).getByTestId('viewing-save-error')).toHaveCount(0);
  await expect(client(page).getByTestId('client-viewing-count')).toHaveText('2 recorded viewings');
  await expect(client(page).getByRole('list', { name: 'Client viewing timeline', exact: true })).toContainText('Synthetic inner viewing saved.');
  await expect(client(page).getByRole('list', { name: 'Client viewing timeline', exact: true })).toContainText('Synthetic outer draft retained.');
});

test('confirming the same property in a nested instance refreshes the parent confirmation', async ({ page }) => {
  await prepare(page);
  await page.goto('/#/properties');
  await page.getByTestId('listing-DEMO-L-001').getByRole('button', { name: /^Open / }).click();
  await expect(property(page).getByRole('checkbox', { name: 'Reviewed by local sales', exact: true })).not.toBeChecked();
  await viewClientFromProperty(page);
  await viewPropertyFromClient(page);
  await property(page).getByRole('checkbox', { name: 'Reviewed by local sales', exact: true }).check();
  await expect(property(page).getByTestId('listing-confirmation')).toContainText('LEGACY-REGRESSION-SALES');
  await property(page).getByRole('button', { name: 'Close', exact: true }).click();
  await client(page).getByRole('button', { name: 'Close', exact: true }).click();
  await property(page).getByRole('tab', { name: 'Overview', exact: true }).click();
  await expect(property(page).getByRole('checkbox', { name: 'Reviewed by local sales', exact: true })).toBeChecked();
  await expect(property(page).getByTestId('listing-confirmation')).toContainText('LEGACY-REGRESSION-SALES');
  await property(page).getByRole('checkbox', { name: 'Reviewed by local sales', exact: true }).uncheck();
  await page.reload();
  await expect(property(page).getByRole('checkbox', { name: 'Reviewed by local sales', exact: true })).not.toBeChecked();
});
