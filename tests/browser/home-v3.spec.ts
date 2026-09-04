import { expect, test, type Page } from '@playwright/test';
import { ensureSalesIdentity } from './helpers';

test.use({ viewport: { width: 1366, height: 768 }, locale: 'zh-CN', timezoneId: 'America/Los_Angeles' });
test.setTimeout(60000);
const workspace = (page: Page) => page.getByRole('region', { name: 'Sales task workspace', exact: true });
const review = (page: Page) => workspace(page).getByRole('region', { name: 'Review task details', exact: true });
const notes = 'Client name: Synthetic V3 Dates. A ready 2 bedroom apartment in Dubai Marina, budget up to AED 2.8m.';

async function prepareCreate(page: Page) {
  await workspace(page).getByRole('button', { name: 'Create a Private Client', exact: true }).click();
  await workspace(page).getByRole('textbox', { name: 'Sales conversation / notes', exact: true }).fill(notes);
  await workspace(page).getByRole('button', { name: 'Send request', exact: true }).click();
  await expect(review(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(workspace(page)).toBeVisible();
});

test.afterEach(async ({ page }, testInfo) => {
  await page.screenshot({ path: testInfo.outputPath('home-v3-end.png'), fullPage: true });
});

test('three task placeholders preserve independently typed notes and do not prefill a request', async ({ page }) => {
  const input = workspace(page).getByRole('textbox', { name: 'Sales conversation / notes', exact: true });
  const modes = ['Find a Property', 'Find a Client', 'Create a Private Client'];
  const placeholders: string[] = [];
  for (const mode of modes) {
    await workspace(page).getByRole('button', { name: mode, exact: true }).click();
    await expect(input).toHaveValue('');
    await expect(workspace(page).getByRole('button', { name: 'Send request', exact: true })).toBeDisabled();
    placeholders.push((await input.getAttribute('placeholder'))!);
    await input.fill(`Unsent notes for ${mode}`);
  }
  expect(placeholders.every(value => value.length > 30)).toBe(true);
  expect(new Set(placeholders).size).toBe(3);
  for (const [index, mode] of modes.entries()) {
    await workspace(page).getByRole('button', { name: mode, exact: true }).click();
    await expect(input).toHaveValue(`Unsent notes for ${mode}`);
    await input.clear();
    await expect(input).toHaveAttribute('placeholder', placeholders[index]);
  }
  await expect(workspace(page).getByTestId('home-task-example')).toHaveCount(0);
  await expect(workspace(page).getByText('Rule demo · Review the suggested details.', { exact: true })).toHaveCount(0);
});

test('English date fields keep invalid input visible, allow clearing and save exact dates in a Chinese browser', async ({ page }, testInfo) => {
  await ensureSalesIdentity(page);
  await prepareCreate(page);
  const purchase = review(page).getByRole('textbox', { name: 'Purchase By', exact: true });
  const moveIn = review(page).getByRole('textbox', { name: 'Available / Move-in By', exact: true });
  const proceed = review(page).getByRole('button', { name: 'Continue', exact: true });
  await expect(purchase).toHaveAttribute('type', 'text');
  await expect(purchase).toHaveAttribute('placeholder', 'YYYY-MM-DD');
  await expect(moveIn).toHaveAttribute('placeholder', 'YYYY-MM-DD');
  await purchase.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('english-date-review.png'), fullPage: true });
  await purchase.fill('2026-02-30');
  await purchase.press('Tab');
  await expect(purchase).toHaveValue('2026-02-30');
  await expect(purchase).toHaveAttribute('aria-invalid', 'true');
  await expect(review(page).getByText('Enter a valid date in YYYY-MM-DD format.', { exact: true })).toBeVisible();
  await expect(proceed).toBeDisabled();
  await purchase.fill('2028-02-29');
  await moveIn.fill('2028-03-01');
  await expect(proceed).toBeEnabled();
  await purchase.clear();
  await moveIn.clear();
  await expect(purchase).toHaveValue('');
  await expect(moveIn).toHaveValue('');
  await expect(proceed).toBeEnabled();
  await purchase.fill('2028-02-29');
  await moveIn.fill('2028-03-01');
  await proceed.click();
  const confirmation = page.getByRole('dialog', { name: 'Confirm private client', exact: true });
  await expect(confirmation).toContainText('2028-02-29');
  await expect(confirmation).toContainText('2028-03-01');
  await confirmation.getByRole('button', { name: 'Confirm & Create', exact: true }).click();
  const client = page.getByRole('dialog').filter({ has: page.getByRole('tab', { name: 'Recommended Properties', exact: true }) });
  await expect(client).toContainText('Synthetic V3 Dates');
  await page.reload();
  await expect(client).toContainText('2028-02-29');
  await expect(client).toContainText('2028-03-01');
  await expect(page.locator('input[type="date"], input[type="datetime-local"]')).toHaveCount(0);
});

test('English viewing time rejects rollover dates and preserves local time when saved and reopened', async ({ page }) => {
  await ensureSalesIdentity(page);
  await prepareCreate(page);
  await review(page).getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('dialog', { name: 'Confirm private client', exact: true }).getByRole('button', { name: 'Confirm & Create', exact: true }).click();
  const client = page.getByRole('dialog').filter({ has: page.getByRole('tab', { name: 'Viewing History', exact: true }) });
  await client.getByRole('tab', { name: 'Viewing History', exact: true }).click();
  await client.getByText('Add a Viewing Record', { exact: true }).click();
  const viewedAt = client.getByRole('textbox', { name: 'Viewed at', exact: true });
  await expect(viewedAt).toHaveAttribute('type', 'text');
  await expect(viewedAt).toHaveAttribute('placeholder', 'YYYY-MM-DDTHH:mm');
  await viewedAt.fill('2026-02-30T13:45');
  await client.getByRole('button', { name: 'Save Viewing Record', exact: true }).click();
  await expect(client).toContainText('Choose a valid viewing date and time.');
  await expect(viewedAt).toHaveValue('2026-02-30T13:45');
  await viewedAt.clear();
  await expect(viewedAt).toHaveValue('');
  await viewedAt.fill('2026-09-04T13:45');
  await client.getByRole('button', { name: 'Save Viewing Record', exact: true }).click();
  await expect(client.locator('time[datetime="2026-09-04T20:45:00.000Z"]')).toBeVisible();
  await page.reload();
  await client.getByRole('tab', { name: 'Viewing History', exact: true }).click();
  await expect(client.locator('time[datetime="2026-09-04T20:45:00.000Z"]')).toBeVisible();
});
