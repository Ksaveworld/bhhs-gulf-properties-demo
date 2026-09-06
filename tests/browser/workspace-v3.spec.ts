import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1366, height: 768 } });
test.setTimeout(60000);
const property = (page: Page) => page.locator('.property-detail.ant-drawer-open .ant-drawer-content');
const client = (page: Page) => page.locator('.client-detail-drawer.ant-drawer-open .ant-drawer-content');
async function signIn(page: Page, salesId: string) {
  const login = page.getByRole('dialog', { name: 'Sales sign in', exact: true });
  await login.getByRole('textbox', { name: 'Username', exact: true }).fill('Synthetic V3 sales');
  await login.getByRole('textbox', { name: 'Sales ID', exact: true }).fill(salesId);
  await login.getByRole('button', { name: 'Continue as sales', exact: true }).click();
  await expect(login).toBeHidden();
}

test('property to client to another property keeps filters, tabs and browser back/forward order', async ({ page }) => {
  await page.goto('/#/properties');
  await page.getByRole('spinbutton', { name: 'Max. price', exact: true }).fill('3000000');
  const before = await page.locator('tr[data-testid^="listing-"]').evaluateAll(rows => rows.map(row => row.getAttribute('data-testid')));
  await page.getByTestId('listing-DEMO-L-001').getByRole('button', { name: /^Open / }).click();
  await property(page).getByRole('tab', { name: 'Potential clients', exact: true }).click();
  await property(page).locator('article[data-client-id="DEMO-C-001"]').getByRole('button', { name: 'View Client Details', exact: true }).click();
  await expect(property(page)).toHaveCount(0);
  await client(page).getByRole('combobox', { name: 'Independent client plan', exact: true }).selectOption('DEMO-R-001');
  await client(page).locator('article[data-listing-id="DEMO-L-002"]').getByRole('button', { name: 'View Property Details', exact: true }).click();
  await expect(property(page).getByRole('heading', { name: 'Harbour View', exact: true })).toBeVisible();
  expect(new URL(page.url()).hash).toMatch(/^#\/properties/);
  await page.goBack();
  await expect(client(page).getByRole('combobox', { name: 'Independent client plan', exact: true })).toHaveValue('DEMO-R-001');
  await page.goForward();
  await expect(property(page).getByRole('heading', { name: 'Harbour View', exact: true })).toBeVisible();
  await property(page).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(client(page).getByRole('combobox', { name: 'Independent client plan', exact: true })).toHaveValue('DEMO-R-001');
  await client(page).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(property(page).getByRole('tab', { name: 'Potential clients', exact: true })).toHaveAttribute('aria-selected', 'true');
  await property(page).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Max. price', exact: true })).toHaveValue('3000000');
  expect(await page.locator('tr[data-testid^="listing-"]').evaluateAll(rows => rows.map(row => row.getAttribute('data-testid')))).toEqual(before);
  await expect(page.locator('.ant-drawer-open')).toHaveCount(0);
});

test('guest sales review prompts identity then returns to the same property without automatically confirming it', async ({ page }) => {
  await page.goto('/#/properties');
  await page.getByRole('spinbutton', { name: 'Max. price', exact: true }).fill('2700000');
  await page.getByTestId('listing-DEMO-L-001').getByRole('button', { name: /^Open / }).click();
  const review = property(page).getByRole('checkbox', { name: 'Reviewed by local sales', exact: true });
  await review.click();
  await signIn(page, 'V3-REVIEW');
  await expect(property(page).getByRole('heading', { name: 'Marina Vista', exact: true })).toBeVisible();
  await expect(review).not.toBeChecked();
  await review.check();
  await expect(property(page).getByTestId('listing-confirmation')).toContainText('V3-REVIEW');
  await expect(property(page).getByText('Source Verification', { exact: true })).toBeVisible();
  await property(page).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Max. price', exact: true })).toHaveValue('2700000');
  await page.reload();
  await page.getByTestId('listing-DEMO-L-001').getByRole('button', { name: /^Open / }).click();
  await expect(review).toBeChecked();
});

test('directory create retains a guest review across sign-in and a failed save; new client survives reopening', async ({ page, context }) => {
  await page.goto('/#/clients');
  const location = page.getByRole('textbox', { name: 'Preferred Location', exact: true });
  await location.fill('Marina');
  await page.getByRole('button', { name: 'Add Private Client' }).click();
  const create = page.getByRole('dialog', { name: 'Create a Private Client', exact: true });
  await create.getByRole('textbox', { name: 'Sales conversation / notes', exact: true }).fill('Client name: Synthetic V3 Resume. A ready 2 bedroom apartment in Dubai Marina, budget AED 2.8m.');
  await create.getByRole('button', { name: 'Send request', exact: true }).click();
  await create.getByRole('button', { name: 'Continue', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirm private client', exact: true });
  await confirm.getByRole('button', { name: 'Sign in to create', exact: true }).click();
  await signIn(page, 'V3-CREATE');
  await expect(confirm).toContainText('Synthetic V3 Resume');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as Window & { restoreStorage?: () => void }).restoreStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('bhhs:local-requirements:')) throw new DOMException('Synthetic full storage', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await confirm.getByRole('button', { name: 'Confirm & Create', exact: true }).click();
  await expect(confirm).toContainText('Saving could not be confirmed');
  await expect(confirm).toContainText('Synthetic V3 Resume');
  await expect(confirm.getByRole('button', { name: 'Confirm & Create', exact: true })).toHaveAttribute('aria-busy', 'false');
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('bhhs:local-requirements:')))).toHaveLength(0);
  await page.evaluate(() => (window as Window & { restoreStorage?: () => void }).restoreStorage?.());
  await confirm.getByRole('button', { name: 'Confirm & Create', exact: true }).click();
  await expect(client(page)).toContainText('Synthetic V3 Resume');
  expect(new URL(page.url()).hash).toMatch(/^#\/clients/);
  const savedUrl = page.url();
  await client(page).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(location).toHaveValue('Marina');
  const reopened = await context.newPage();
  await reopened.goto(savedUrl);
  await expect(client(reopened)).toContainText('Synthetic V3 Resume');
  await reopened.close();
});

test('library sorting is centered and operative, and dates reject invalid values using English controls', async ({ page }) => {
  await page.goto('/#/properties');
  await expect(page.locator('.home-demo-badge')).toHaveText('Demo');
  await expect(page.getByText('Data & sources', { exact: true })).toHaveCount(0);
  await expect(page.locator('.evidence-banner')).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Report', exact: true })).toHaveCount(0);
  const sort = page.getByRole('button', { name: 'Sort asking price ascending', exact: true });
  await sort.click();
  await expect(page.locator('tr[data-testid^="listing-"]').first()).toHaveAttribute('data-testid', 'listing-DEMO-L-008');
  const box = await sort.locator('xpath=ancestor::span[contains(@class,"pv2-column-sort")]').evaluate(element => {
    const label = element.children[0].getBoundingClientRect();
    const controls = element.children[1].getBoundingClientRect();
    return { center: Math.abs((label.y + label.height / 2) - (controls.y + controls.height / 2)), gap: controls.x - label.right };
  });
  expect(box.center).toBeLessThanOrEqual(1); expect(box.gap).toBeLessThanOrEqual(6);
  await page.getByRole('button', { name: 'Sort asking price descending', exact: true }).click();
  await expect(page.locator('tr[data-testid^="listing-"]').first()).toHaveAttribute('data-testid', 'listing-DEMO-L-004');
  await page.getByRole('button', { name: /More filters$/ }).click();
  const date = page.getByRole('textbox', { name: 'Available by', exact: true });
  await expect(date).toHaveAttribute('placeholder', 'YYYY-MM-DD');
  await date.fill('2026-02-30');
  await expect(date).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('result-count')).toHaveText('0');
  await date.clear();
  await expect(page.getByTestId('result-count')).toHaveText('8');
});
