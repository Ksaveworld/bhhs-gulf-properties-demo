import { expect, test, type Page } from '@playwright/test';
import { ensureSalesIdentity } from './helpers';

test.use({ viewport: { width: 1366, height: 768 } });
test.setTimeout(60000);
const home = (page: Page) => page.getByRole('region', { name: 'Sales task workspace', exact: true });
const review = (page: Page) => home(page).getByRole('region', { name: 'Review task details', exact: true });
const notes = 'A ready 2 bedroom apartment in Dubai Marina, budget up to AED 2.8m. Must have parking.';
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  pageErrors.set(page, []);
  page.on('pageerror', error => pageErrors.get(page)!.push(error.message));
  await page.goto('/');
  await expect(home(page)).toBeVisible();
});

test.afterEach(async ({ page }, testInfo) => {
  expect.soft(pageErrors.get(page)).toEqual([]);
  const widths = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect.soft(widths.document).toBeLessThanOrEqual(widths.viewport);
  await page.screenshot({ path: testInfo.outputPath('home-v2-end.png'), fullPage: true });
});

async function prepare(page: Page, text: string) {
  await home(page).getByRole('textbox', { name: 'Sales conversation / notes', exact: true }).fill(text);
  await home(page).getByRole('button', { name: 'Send request', exact: true }).click();
  await expect(review(page)).toBeVisible();
}
async function goHome(page: Page) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /\bHome$/ }).click();
  await expect(home(page)).toBeVisible();
}
async function visibleListingIds(page: Page) {
  return page.locator('.property-table tbody tr[data-testid]').evaluateAll(rows => rows.map(row => row.getAttribute('data-testid')));
}

test('three task tags and examples switch; removed extraction buttons and unit selectors stay absent', async ({ page }) => {
  const examples: string[] = [];
  for (const name of ['Find a Property', 'Find a Client', 'Create a Private Client']) {
    await home(page).getByRole('button', { name, exact: true }).click();
    await expect(home(page).getByTestId('selected-home-task')).toHaveText(name);
    examples.push((await home(page).getByRole('textbox', { name: 'Sales conversation / notes', exact: true }).getAttribute('placeholder'))!);
  }
  expect(new Set(examples).size).toBe(3);
  await prepare(page, 'Client name: Synthetic Alex. Dubai Marina');
  await expect(home(page).getByRole('button', { name: /Extract Requirement|Use Demo Conversation|Enter Manually/i })).toHaveCount(0);
  await expect(review(page).getByRole('combobox', { name: /Currency|Area Unit|Area Basis/i })).toHaveCount(0);
  await expect(home(page).getByTestId('home-missing-count')).toContainText('3 required fields');
  await expect(review(page).getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  expect(await review(page).locator('.home-field.incomplete').count()).toBe(3);
});

test('reviewed English and Chinese inputs apply equal property filters, and a changed budget changes candidates', async ({ page }) => {
  await prepare(page, notes);
  await review(page).getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByTestId('result-count')).toBeVisible();
  const original = await visibleListingIds(page);
  expect(original.length).toBeGreaterThan(0);
  await goHome(page);
  await prepare(page, 'Dubai Marina的现房两居公寓，预算上限280万迪拉姆。必须有停车位。');
  await review(page).getByRole('button', { name: 'Continue', exact: true }).click();
  await expect.poll(() => visibleListingIds(page)).toEqual(original);
  await goHome(page);
  await prepare(page, notes);
  await review(page).getByRole('spinbutton', { name: 'Budget Range maximum', exact: true }).fill('1000000');
  await expect(home(page).getByTestId('home-review-questions')).toContainText('maximum budget differs from the original notes');
  await review(page).getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByTestId('result-count')).toHaveText('0');
});

test('find-client accepts one condition and lands in a filtered directory without another confirmation', async ({ page }) => {
  await home(page).getByRole('button', { name: 'Find a Client', exact: true }).click();
  await prepare(page, 'Find company clients');
  await expect(home(page).getByTestId('home-missing-count')).toContainText('1 required field');
  await expect(review(page).getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await review(page).getByRole('textbox', { name: 'Client Name', exact: true }).fill('definitely-no-synthetic-client');
  await review(page).getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Client directory', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Client directory', exact: true }).getByRole('textbox', { name: 'Client Name', exact: true })).toHaveValue('definitely-no-synthetic-client');
  await expect(page.getByRole('dialog', { name: 'Confirm private client', exact: true })).toHaveCount(0);
});

test('Add Private Client opens creation, requires confirmation, Back edits, and restores the client after reload', async ({ page }) => {
  await ensureSalesIdentity(page);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /Clients & needs/ }).click();
  await page.getByRole('button', { name: /Add Private Client$/ }).click();
  await expect(home(page)).toBeVisible();
  await prepare(page, `Client name: Synthetic Home V2. ${notes} Size 900 to 1400 sq ft.`);
  await expect(home(page).getByTestId('home-review-questions')).toContainText('Area basis needs confirmation');
  await review(page).getByRole('button', { name: 'Continue', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Confirm private client', exact: true });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('900 — 1400');
  await confirmation.getByRole('button', { name: 'Back / Edit', exact: true }).click();
  await review(page).getByRole('textbox', { name: 'Client Name / Alias', exact: true }).fill('Synthetic Home V2 Updated');
  await review(page).getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(confirmation).toContainText('Synthetic Home V2 Updated');
  await confirmation.getByRole('button', { name: 'Confirm & Create', exact: true }).click();
  await expect(confirmation).toBeHidden();
  const drawer = page.getByRole('dialog').filter({ has: page.getByRole('tab', { name: 'Recommended Properties', exact: true }) });
  await expect(drawer).toContainText('Synthetic Home V2 Updated');
  await expect(drawer.getByRole('tab', { name: 'Recommended Properties', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(drawer.getByRole('tab')).toHaveCount(2);
  await page.reload();
  await expect(page.getByText('Synthetic Home V2 Updated', { exact: true }).first()).toBeVisible();
});

test('a failed local save keeps the confirmation draft and never reports success', async ({ page }) => {
  await ensureSalesIdentity(page);
  await home(page).getByRole('button', { name: 'Create a Private Client', exact: true }).click();
  await prepare(page, `Client name: Synthetic Failed Home Save. ${notes}`);
  await review(page).getByRole('button', { name: 'Continue', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Confirm private client', exact: true });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('bhhs:local-requirements:')) throw new DOMException('Synthetic browser quota failure', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await confirmation.getByRole('button', { name: 'Confirm & Create', exact: true }).click();
  await expect(confirmation).toContainText('Saving could not be confirmed');
  await expect(confirmation).toContainText('Synthetic Failed Home Save');
  await expect(confirmation.getByRole('button', { name: 'Back / Edit', exact: true })).toBeEnabled();
  const saved = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('bhhs:local-requirements:')).map(([, value]) => value).join(''));
  expect(saved).not.toContain('Synthetic Failed Home Save');
});

test('foreign-currency notes require a new AED budget rather than interpreting the same number as AED', async ({ page }) => {
  await prepare(page, 'Dubai Marina 2 bedroom apartment, budget USD 700k.');
  await expect(review(page).getByRole('spinbutton', { name: 'Budget Range maximum', exact: true })).toHaveValue('');
  await expect(home(page).getByTestId('home-review-questions')).toContainText('not in AED');
  await expect(review(page).getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
});

test('an explicit maximum-only size uses its stated basis; omitted basis remains a clarification', async ({ page }) => {
  await prepare(page, `${notes} Size no more than 1400 sq ft built_up area.`);
  await expect(home(page).getByTestId('home-review-questions')).not.toContainText('Area basis needs confirmation');
  await review(page).getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByTestId('result-count')).not.toHaveText('0');
  await goHome(page);
  await prepare(page, `${notes} Size no more than 1400 sq ft.`);
  await expect(home(page).getByTestId('home-review-questions')).toContainText('Area basis needs confirmation');
  await review(page).getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByTestId('result-count')).toHaveText('0');
});
