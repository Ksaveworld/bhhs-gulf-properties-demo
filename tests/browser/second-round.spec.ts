import { test, expect, type Page } from '@playwright/test';

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Read this client', exact: true }).click();
  await page.getByRole('button', { name: 'Skip animation', exact: true }).click();
}
async function choices(page: Page, choice = 'Keep CRM') {
  for (const name of ['Budget conflict', 'Property type conflict']) await page.getByRole('group', { name }).getByRole('button', { name: choice, exact: true }).click();
}
test('every intake decision can go back, clearing downstream choices without refreshing', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Back from identity confirmation', exact: true }).click();
  await expect(page.getByLabel('Client analysis conversation')).toHaveCount(0);
  await page.getByRole('button', { name: 'Read this client', exact: true }).click();
  await page.getByRole('button', { name: 'Skip animation', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm same client', exact: true }).click();
  await choices(page);
  await page.getByRole('button', { name: 'Add it now', exact: true }).click();
  await page.getByLabel('Payment method', { exact: true }).selectOption('Mortgage');
  await page.getByRole('button', { name: 'Back from missing information', exact: true }).click();
  await expect(page.getByLabel('Payment method', { exact: true })).toHaveCount(0);
  await expect(page.locator('.proto-conflict button[aria-pressed="true"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back from extracted details', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm same client', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Budget conflict' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirm same client', exact: true }).click();
  await choices(page);
  await page.getByRole('button', { name: 'Confirm later in the call', exact: true }).click();
  await page.getByRole('button', { name: 'Back from missing information', exact: true }).click();
  await choices(page, 'Adopt new information');
  await page.getByRole('button', { name: 'Confirm later in the call', exact: true }).click();
  await page.getByRole('button', { name: 'View client assessment' }).click();
  await expect(page.getByLabel('Core client needs')).toContainText('AED 18–22m');
  await expect(page.getByLabel('Core client needs')).toContainText('Villa · 5+ bedrooms');
  await page.getByRole('button', { name: 'Back to Home', exact: true }).click();
  await expect(page.getByLabel('Client analysis conversation')).toContainText('Confirmed as the same client');
});

for (const width of [1440, 1920]) test(`home and assessment are centered at ${width}px, with one client-list heading`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1080 }); await page.goto('/');
  const home = page.locator('.proto-home'); await expect(home).toBeVisible();
  const geometry = await home.evaluate(el => { const b = el.getBoundingClientRect(); const p = document.querySelector('.workspace-main')!.getBoundingClientRect(); return { width: b.width, center: (b.left + b.right) / 2, parentCenter: (p.left + p.right) / 2 }; });
  expect(geometry.width).toBeLessThanOrEqual(960);
  expect(Math.abs(geometry.center - geometry.parentCenter)).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`) });
  await page.locator('.proto-rowlink').filter({ hasText: 'Khalid' }).click();
  const detail = await page.locator('.proto-sheet').evaluate(el => { const b = el.getBoundingClientRect(); const l = document.querySelector('.proto-detail-layout')!.getBoundingClientRect(); const s = document.querySelector('.proto-sources')!.getBoundingClientRect(); return { width: b.width, center: (b.left + b.right) / 2, parentCenter: (s.right + l.right) / 2 }; });
  expect(detail.width).toBeLessThanOrEqual(960);
  expect(Math.abs(detail.center - detail.parentCenter)).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath(`detail-${width}.png`) });
  await page.getByRole('navigation').getByRole('button', { name: 'Clients & needs', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Clients (and|&) (needs|Needs)/ })).toHaveCount(1);
  await page.getByRole('navigation').getByRole('button', { name: 'Property library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Property library', exact: true })).toBeVisible();
});
