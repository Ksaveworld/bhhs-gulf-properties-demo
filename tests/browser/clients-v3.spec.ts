import { expect, test, type Page } from '@playwright/test';
import { ensureSalesIdentity } from './helpers';

test.use({ viewport: { width: 1366, height: 768 } });
test.setTimeout(60000);

const directory = (page: Page) => page.getByRole('region', { name: 'Client directory', exact: true });
const client = (page: Page) => page.locator('.client-detail-drawer.ant-drawer-open .ant-drawer-content');
const property = (page: Page) => page.locator('.property-detail.ant-drawer-open .ant-drawer-content');

async function openClient(page: Page) {
  await page.goto('/');
  await ensureSalesIdentity(page);
  await page.goto('/#/clients');
  await expect(directory(page)).toBeVisible();
  await directory(page).getByRole('textbox', { name: 'Preferred Location', exact: true }).fill('Marina');
  await directory(page).locator('[data-client-id="DEMO-C-001"]').getByRole('button', { name: 'View Client Details' }).click();
  await expect(client(page)).toBeVisible();
}

async function openViewingForm(page: Page) {
  await client(page).getByRole('tab', { name: 'Viewing History', exact: true }).click();
  const form = client(page).locator('.client-detail-viewing-entry');
  await form.locator('summary').click();
  await form.getByRole('combobox', { name: 'Viewed property', exact: true }).selectOption('DEMO-L-001');
  return form;
}

test('guest can start a private client on the current directory page without losing its filters', async ({ page }) => {
  await page.goto('/#/clients');
  await expect(directory(page)).toBeVisible();
  await directory(page).getByRole('textbox', { name: 'Preferred Location', exact: true }).fill('Marina');
  const before = await directory(page).locator('article[data-client-id]').evaluateAll(rows => rows.map(row => row.getAttribute('data-client-id')));
  const add = directory(page).getByRole('button', { name: 'Add Private Client' });
  await expect(add).toBeEnabled();
  await add.click();
  const create = page.getByRole('dialog', { name: 'Create a Private Client', exact: true });
  await expect(create).toBeVisible();
  expect(new URL(page.url()).hash).toMatch(/^#\/clients/);
  await expect(create.getByTestId('selected-home-task')).toHaveText('Create a Private Client');
  await create.getByRole('textbox', { name: 'Sales conversation / notes', exact: true }).fill('Client name: Synthetic client V3. Two bedroom apartment in Dubai Marina, budget AED 2800000.');
  await create.getByRole('button', { name: 'Send request', exact: true }).click();
  await expect(create.getByRole('region', { name: 'Review task details', exact: true })).toBeVisible();
  await create.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(create).toBeHidden();
  await expect(directory(page).getByRole('textbox', { name: 'Preferred Location', exact: true })).toHaveValue('Marina');
  expect(await directory(page).locator('article[data-client-id]').evaluateAll(rows => rows.map(row => row.getAttribute('data-client-id')))).toEqual(before);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('bhhs:local-requirements:')))).toHaveLength(0);
});

test('nested client and property details return one level at a time and preserve the original plan and tab', async ({ page }, testInfo) => {
  await openClient(page);
  await client(page).getByRole('combobox', { name: 'Independent client plan', exact: true }).selectOption('DEMO-R-001');
  const form = await openViewingForm(page);
  await form.getByLabel('Viewed at', { exact: true }).fill('2026-09-02T09:30');
  await form.getByRole('textbox', { name: 'Viewing feedback', exact: true }).fill('Synthetic V3 navigation check.');
  await form.getByRole('button', { name: 'Save Viewing Record', exact: true }).click();
  await expect(client(page).getByTestId('viewing-save-status')).toContainText('Saved to this browser');
  await client(page).locator('[data-viewing-id]').getByRole('button', { name: /Marina Vista/ }).click();
  await expect(property(page)).toBeVisible();
  expect(new URL(page.url()).hash).toMatch(/^#\/clients/);
  await property(page).getByRole('tab', { name: 'Potential clients', exact: true }).click();
  await property(page).locator('article[data-client-id="DEMO-C-001"]').getByRole('button', { name: 'View Client Details', exact: true }).click();
  await expect(client(page)).toBeVisible();
  expect(new URL(page.url()).hash).toMatch(/^#\/clients/);
  await expect.poll(() => client(page).evaluate(element => Math.round(element.getBoundingClientRect().right))).toBe(1366);
  await page.screenshot({ path: testInfo.outputPath('nested-client-detail.png'), fullPage: true, animations: 'disabled' });
  await client(page).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(property(page).getByRole('tab', { name: 'Potential clients', exact: true })).toHaveAttribute('aria-selected', 'true');
  await property(page).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(client(page).getByRole('tab', { name: 'Viewing History', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(client(page).getByRole('list', { name: 'Client viewing timeline', exact: true })).toContainText('Synthetic V3 navigation check.');
  await expect.poll(() => client(page).evaluate(element => Math.round(element.getBoundingClientRect().right))).toBe(1366);
  await page.screenshot({ path: testInfo.outputPath('returned-client-viewing-history.png'), fullPage: true, animations: 'disabled' });
  await client(page).getByRole('tab', { name: 'Recommended Properties', exact: true }).click();
  await expect(client(page).getByRole('combobox', { name: 'Independent client plan', exact: true })).toHaveValue('DEMO-R-001');
  await client(page).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(directory(page).getByRole('textbox', { name: 'Preferred Location', exact: true })).toHaveValue('Marina');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1366);
});

test('viewing date input stays English and rejects invalid calendar values before saving', async ({ page }) => {
  await openClient(page);
  const form = await openViewingForm(page);
  const input = form.getByLabel('Viewed at', { exact: true });
  await expect(input).toHaveAttribute('type', 'text');
  await expect(input).toHaveAttribute('placeholder', 'YYYY-MM-DDTHH:mm');
  await expect(input).toHaveAttribute('lang', 'en');
  await input.fill('2026-02-30T09:30');
  await form.getByRole('button', { name: 'Save Viewing Record', exact: true }).click();
  await expect(client(page).getByTestId('viewing-save-error')).toContainText('Choose a valid viewing date and time.');
  await expect(client(page).getByTestId('client-viewing-count')).toHaveText('0 recorded viewings');
  await expect(client(page).getByTestId('viewing-save-status')).toHaveCount(0);
  await expect(input).toHaveValue('2026-02-30T09:30');
  await input.fill('2026-02-28T09:30');
  await form.getByRole('button', { name: 'Save Viewing Record', exact: true }).click();
  await expect(client(page).getByTestId('viewing-save-status')).toContainText('Saved to this browser');
  await expect(client(page).getByTestId('client-viewing-count')).toHaveText('1 recorded viewings');
  const times = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('bhhs:viewing-records:')).flatMap(([, value]) => JSON.parse(value).records.map((row: { viewed_at: string }) => row.viewed_at)));
  expect(times).toEqual([await page.evaluate(() => new Date('2026-02-28T09:30').toISOString())]);
});
