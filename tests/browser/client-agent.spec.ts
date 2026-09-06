import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 } });
async function home(page: Page) { await page.goto('/'); await expect(page.getByRole('button', { name: 'Read this client', exact: true })).toBeVisible(); }
async function start(page: Page) { await home(page); await page.getByRole('button', { name: 'Call recordings', exact: true }).click(); await page.getByRole('button', { name: 'Read this client', exact: true }).click(); }
async function choose(page: Page, budget = 'Adopt new information', home = 'Adopt new information') { await page.getByRole('group', { name: 'Budget conflict' }).getByRole('button', { name: budget }).click(); await page.getByRole('group', { name: 'Property type conflict' }).getByRole('button', { name: home }).click(); }
async function openKhalid(page: Page) { await home(page); await page.locator('.proto-rowlink').filter({ hasText: 'Khalid' }).click(); await expect(page.locator('.proto-sheet h1')).toHaveText('Khalid Al Mansouri'); }
async function callSummary(page: Page) { await page.getByRole('button', { name: 'Call Khalid', exact: true }).click(); await expect(page.getByLabel('Call timer')).toHaveText('00:00'); await page.getByRole('button', { name: 'End call', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: 'Transcribing' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Save to CRM', exact: true })).toBeVisible(); }

test('reading streams counts; skip never bypasses identity or per-field conflict decisions; conversation survives navigation', async ({ page }) => {
  await start(page);
  await expect(page.locator('.proto-read-tasks .done')).toHaveCount(0);
  await expect(page.locator('.proto-read-tasks .done')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Confirm same client' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Skip animation' }).click();
  await expect(page.locator('.proto-read-tasks .done')).toHaveCount(5);
  await expect(page.locator('.proto-identity')).toContainText('Phone ending 418');
  await expect(page.getByRole('group', { name: 'Budget conflict' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirm same client' }).click();
  await page.getByRole('group', { name: 'Budget conflict' }).getByRole('button', { name: 'Adopt new information' }).click();
  await expect(page.getByRole('button', { name: 'Confirm later in the call' })).toHaveCount(0);
  await page.getByRole('group', { name: 'Property type conflict' }).getByRole('button', { name: 'Keep CRM' }).click();
  await page.getByRole('button', { name: 'Confirm later in the call' }).click();
  await page.getByRole('button', { name: 'View client assessment' }).click();
  await expect(page.getByLabel('Core client needs')).toContainText('Apartment · 4 bedrooms');
  await expect(page.getByTestId('payment-risk')).toBeAttached();
  await expect(page.getByTestId('payment-next')).toHaveText(/cash or mortgage/);
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByLabel('Client analysis conversation')).toContainText('Confirmed as the same client');
  await expect(page.getByRole('button', { name: 'View client assessment' })).toBeVisible();
});

test('new identity stays separate; retained budget and immediate payment reach the assessment', async ({ page }) => {
  await start(page); await page.getByRole('button', { name: 'Skip animation' }).click();
  await page.getByRole('button', { name: 'Not the same — create client' }).click();
  await page.getByLabel('New client name').fill('QA separate client'); await page.getByLabel('New client phone').fill('123456');
  await page.getByRole('button', { name: 'Create and continue' }).click();
  await choose(page, 'Keep CRM');
  await page.getByRole('button', { name: 'Add it now' }).click(); await page.getByLabel('Payment method', { exact: true }).selectOption('Mortgage'); await page.getByRole('button', { name: 'Confirm payment', exact: true }).click();
  await page.getByRole('button', { name: 'View client assessment' }).click();
  await expect(page.locator('.proto-sheet h1')).toHaveText('QA separate client');
  await expect(page.getByLabel('Core client needs')).toContainText('Up to AED 16m');
  await expect(page.getByTestId('payment-risk')).toHaveCount(0);
  await expect(page.locator('.proto-price')).toContainText('retained 16m ceiling');
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('.proto-rowlink').filter({ hasText: 'Khalid' }).click();
  await expect(page.getByLabel('Core client needs')).toContainText('AED 18–22m');
});

test('full page source links, property-specific price strategy and editing work', async ({ page }, testInfo) => {
  await openKhalid(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const needs = page.getByLabel('Core client needs');
  await needs.getByRole('button', { name: /Expected price range/ }).click();
  await expect(page.locator('.proto-source.lit')).toContainText('Our budget is 18 to 22');
  await page.locator('.proto-price-risk').click();
  await expect(page.locator('.proto-source.lit')).toContainText('Brother handles price');
  await page.getByRole('img', { name: /Price axis/ }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('price-axis.png') });
  await page.getByLabel('Price strategy property').selectOption('frond-k');
  await expect(page.locator('.proto-price')).toContainText('Asking AED 17.8m');
  await expect(page.locator('.proto-price')).not.toContainText('Open at AED 20.2m');
  await page.getByLabel('Price strategy property').selectOption('sector-e');
  await expect(page.locator('.proto-price')).toContainText('Asking AED 23m');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Edit Expected price range', { exact: true }).fill('AED 19–21m');
  await page.getByLabel('Edit Never said out loud').fill('Open kitchen is essential.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(needs).toContainText('AED 19–21m');
  await page.getByRole('button', { name: /Never said out loud/ }).click();
  await expect(page.locator('.proto-source.lit')).toContainText('Open kitchen is essential');
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('.proto-rowlink').filter({ hasText: 'Khalid' }).click();
  await expect(needs).toContainText('AED 19–21m');
});

test('hangup generates editable summary automatically; discard does not mutate; CRM save updates four areas and booking uses saved edits', async ({ page }) => {
  const writes: string[] = []; page.on('request', r => { if (!['GET', 'HEAD'].includes(r.method())) writes.push(r.url()); });
  await openKhalid(page); await callSummary(page);
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page.locator('.proto-source')).toHaveCount(9); await expect(page.getByTestId('payment-risk')).toHaveCount(1);
  await callSummary(page);
  await page.getByLabel('Communication points').fill('Mortgage is now confirmed. Discussed a different viewing.');
  await page.getByLabel('Call Payment', { exact: true }).fill('Mortgage, approval pending');
  await page.getByLabel('Call Budget ceiling').fill('AED 21m'); await page.getByLabel('Call Viewing time').fill('Sunday 10:30'); await page.getByLabel('Call viewing property', { exact: true }).selectOption('frond-k');
  await page.getByLabel('Call Attendees').fill('Client and wife'); await page.getByLabel('Commitments').fill('Send the floor plan on Friday.');
  await page.getByRole('button', { name: 'Save to CRM', exact: true }).click();
  await expect(page.locator('.proto-source').first()).toContainText('Outbound call');
  await expect(page.locator('.proto-source').first()).toContainText('Mortgage, approval pending');
  await expect(page.getByTestId('payment-risk')).toHaveCount(0); await expect(page.getByTestId('payment-next')).toHaveCount(0);
  await expect(page.locator('.proto-next')).toContainText('Send the floor plan on Friday.');
  await expect(page.getByRole('button', { name: /How he’s paying/ })).toContainText('from this call');
  await expect(page.getByLabel('Core client needs')).toContainText('Up to AED 21m');
  await page.getByRole('button', { name: 'Book viewing', exact: true }).click();
  await expect(page.getByLabel('Viewing time', { exact: true })).toHaveValue('Sunday 10:30');
  await expect(page.getByLabel('Viewing property', { exact: true })).toHaveValue('frond-k');
  await expect(page.getByLabel('Viewing attendees')).toHaveValue('Client and wife');
  await page.getByRole('button', { name: 'Modify', exact: true }).click(); await page.getByLabel('Viewing time', { exact: true }).fill('Monday 11:00'); await page.getByLabel('Viewing property', { exact: true }).selectOption('frond-n');
  await expect(page.getByLabel('Viewing address')).toHaveValue('Palm Jumeirah, Frond N');
  await page.getByRole('radio', { name: 'WhatsApp' }).check(); await page.getByRole('button', { name: 'Confirm and send' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Demo invitation sent via WhatsApp' })).toContainText('Monday 11:00');
  expect(writes).toEqual([]);
});

test('clearing payment in call summary keeps payment risk; booking before a call requires a time', async ({ page }) => {
  await openKhalid(page); await page.getByRole('button', { name: 'Book viewing', exact: true }).click();
  await expect(page.getByLabel('Viewing time', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Confirm and send' })).toBeDisabled();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await callSummary(page); await page.getByLabel('Call Payment', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Save to CRM', exact: true }).click();
  await expect(page.getByTestId('payment-risk')).toHaveCount(1); await expect(page.getByTestId('payment-next')).toHaveCount(1);
});

test('new client entry and existing client list retain independent records and property library remains reachable', async ({ page }) => {
  await home(page); const nav = page.getByRole('navigation');
  await expect(nav.getByRole('button')).toHaveText(['Home', 'Clients & needs', 'Property library']);
  await expect(nav).not.toContainText('Demo');
  await page.getByRole('button', { name: '+ New client', exact: true }).click();
  await page.getByLabel('New client name').fill('QA blank client'); await page.getByLabel('New client phone').fill('999');
  await page.getByRole('button', { name: 'Create client', exact: true }).click();
  await expect(page.locator('.proto-sheet h1')).toHaveText('QA blank client');
  await expect(page.getByLabel('Core client needs')).toContainText('To confirm');
  await expect(page.locator('.proto-sheet')).not.toContainText('R. Haddad');
  await nav.getByRole('button', { name: 'Clients & needs', exact: true }).click();
  await page.getByLabel('Client Name', { exact: true }).fill('client A');
  await page.getByRole('button', { name: 'View Client Details' }).first().click();
  await expect(page.locator('.proto-detail-page')).toBeVisible();
  await expect(page.locator('.proto-sheet')).not.toContainText('R. Haddad');
  await page.getByText('Client records and viewing history', { exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Viewing History', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'Property library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Property library', exact: true })).toBeVisible();
  await expect(page.locator('.proto-detail-page')).toHaveCount(0);
});

test('narrow screen has usable navigation, forms and a horizontally contained price axis', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 }); await home(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('home-mobile.png') });
  await page.locator('.proto-rowlink').filter({ hasText: 'Khalid' }).click();
  await page.getByRole('img', { name: /Price axis/ }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await page.locator('.proto-detail-page').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('price-mobile.png') });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Edit Expected price range')).toBeVisible();
});

test('original client plan and viewing draft survive nested property navigation; simple edits survive reopening', async ({ page }) => {
  await page.goto('/#/clients?detail=client:DEMO-C-001');
  const detail = page.locator('.proto-detail-page:not([hidden])');
  await expect(detail).toBeVisible();
  await detail.getByText('Client records and viewing history', { exact: true }).click();
  const plan = detail.getByLabel('Independent client plan', { exact: true });
  await plan.selectOption('DEMO-R-001');
  await detail.getByRole('tab', { name: 'Viewing History', exact: true }).click();
  await detail.locator('.proto-existing-property').getByRole('button', { name: 'View Property Details', exact: true }).first().click();
  const property = page.getByRole('dialog').filter({ has: page.getByRole('tab', { name: 'Price evidence', exact: true }) });
  await expect(property).toBeVisible();
  await property.getByRole('tab', { name: 'Price evidence', exact: true }).click();
  await expect(property.locator('.pd-history-section')).toBeVisible();
  await property.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(detail.getByRole('tab', { name: 'Viewing History', exact: true })).toHaveAttribute('aria-selected', 'true');
  await detail.getByRole('tab', { name: 'Recommended Properties', exact: true }).click();
  await expect(plan).toHaveValue('DEMO-R-001');
  await detail.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Edit Expected price range', { exact: true }).fill('AED 1.5–2m');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(detail.getByLabel('Core client needs')).toContainText('AED 1.5–2m');
  await detail.getByRole('button', { name: '← Back', exact: true }).click();
  await page.locator('[data-client-id="DEMO-C-001"]').getByRole('button', { name: 'View Client Details' }).click();
  await detail.getByText('Client records and viewing history', { exact: true }).click();
  await detail.getByLabel('Independent client plan', { exact: true }).selectOption('DEMO-R-001');
  await expect(detail.getByLabel('Core client needs')).toContainText('AED 1.5–2m');
});

test('demo client appears in retained client filters; a blank new client does not acquire villa needs', async ({ page }) => {
  await home(page);
  await page.getByRole('button', { name: '+ New client', exact: true }).click();
  await page.getByLabel('New client name').fill('Empty needs');
  await page.getByRole('button', { name: 'Create client', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Clients & needs', exact: true }).click();
  await page.getByLabel('Client Name', { exact: true }).fill('Empty needs');
  await expect(page.locator('.client-directory-client')).toHaveCount(1);
  await expect(page.locator('.client-directory-client')).not.toContainText('villa');
  await page.getByLabel('Client Name', { exact: true }).fill('Khalid');
  await expect(page.locator('.client-directory-client')).toHaveCount(1);
  await page.getByRole('button', { name: 'View Client Details' }).click();
  await expect(page.locator('.proto-sheet h1')).toHaveText('Khalid Al Mansouri');
});
