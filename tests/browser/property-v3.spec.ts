import { expect, test, type Page } from '@playwright/test';
import type { Dataset } from '../../shared/types';

test.use({ viewport: { width: 1366, height: 768 } });

async function openProperty(page: Page, listingId = 'DEMO-L-001') {
  await page.goto('/#/properties');
  await expect(page.getByTestId('result-count')).toHaveText('8');
  await page.getByTestId('listing-' + listingId).getByRole('button', { name: /^Open / }).click();
  return page.getByRole('dialog').filter({ has: page.getByRole('tab', { name: 'Price evidence', exact: true }) });
}

test('chart selection expands a full-width timeline record that can be closed and selected again', async ({ page }) => {
  const drawer = await openProperty(page);
  await drawer.getByRole('tab', { name: 'Price evidence', exact: true }).click();
  const history = drawer.locator('.pd-history-section');
  const node = history.locator('details[data-transaction-id="DEMO-T-007"]');
  const point = history.getByRole('button', { name: /^Transaction DEMO-T-007:/ });
  await point.press('Enter');
  await expect(node).toHaveAttribute('open', '');
  const geometry = await node.evaluate(element => ({
    width: element.getBoundingClientRect().width,
    parentWidth: element.parentElement!.getBoundingClientRect().width,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(geometry.width).toBeGreaterThan(geometry.parentWidth * 0.9);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  await expect(node.locator('summary')).toContainText('Marina Vista');
  await expect(node.locator('summary')).toContainText('Built-up area');
  await expect(node.getByRole('heading', { name: 'Property Association', exact: true })).toBeVisible();
  await expect(node.getByText('Source Date', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Original Evidence', { exact: true })).toHaveCount(0);
  await expect(drawer.getByText('Source Record', { exact: true })).toHaveCount(0);
  await node.locator('summary').click();
  await expect(node).not.toHaveAttribute('open');
  await history.getByRole('button', { name: /^Transaction DEMO-T-008:/ }).press('Enter');
  await expect(history.locator('details[data-transaction-id="DEMO-T-008"]')).toHaveAttribute('open', '');
  await expect(node).not.toHaveAttribute('open');
  await point.press('Enter');
  await expect(node).toHaveAttribute('open', '');
  await node.locator('summary').press('Enter');
  await expect(node).not.toHaveAttribute('open');
  await expect(drawer.locator('.pd-comparable-section').getByRole('article', { name: 'Comparable transaction DEMO-T-002', exact: true })).toBeVisible();
});

test('overview has one source field, no invented sample link, and a header report action', async ({ page }) => {
  const drawer = await openProperty(page);
  await expect(drawer.locator('.pd-drawer-title').getByRole('button', { name: 'Export Report', exact: true })).toBeVisible();
  await expect(drawer.getByText('Source', { exact: true })).toHaveCount(1);
  await expect(drawer.getByText('Source Reference', { exact: true })).toHaveCount(0);
  await expect(drawer.getByText('Sample source', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Not linked', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'View Source', exact: true })).toHaveCount(0);
  await expect(drawer.getByText('Original Evidence', { exact: true })).toHaveCount(0);
  await expect(drawer.getByText('Demo data', { exact: true })).toHaveCount(0);
  await expect(drawer.getByRole('checkbox', { name: 'Reviewed by local sales', exact: true })).toBeEnabled();
});

test('a supplied source URL opens the exact evidence page without exposing a duplicate reference', async ({ page, request, context }) => {
  const data = await (await request.get('/api/dataset')).json() as Dataset;
  const origin = new URL(test.info().project.use.baseURL as string).origin;
  const evidenceUrl = origin + '/evidence/v3-synthetic-source';
  for (const listing of data.listing_snapshots.filter(row => row.listing_id === 'DEMO-L-001')) listing.source_ref = evidenceUrl;
  await page.route('**/api/dataset', route => route.fulfill({ json: data }));
  await context.route('**/evidence/v3-synthetic-source', route => route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic source test</h1>' }));
  const drawer = await openProperty(page);
  await expect(drawer.getByRole('link', { name: 'View Source', exact: true })).toHaveCount(1);
  const popupPromise = page.waitForEvent('popup');
  await drawer.getByRole('link', { name: 'View Source', exact: true }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(evidenceUrl);
  await expect(popup.getByRole('heading', { name: 'Synthetic source test', exact: true })).toBeVisible();
  await popup.close();
});

test('potential client groups retain reasons and provide a compact top-right detail action', async ({ page }) => {
  const drawer = await openProperty(page);
  await drawer.getByRole('tab', { name: 'Potential clients', exact: true }).click();
  const groups = drawer.locator('.pd-client-group');
  await expect(groups).toHaveCount(2);
  await expect(groups.first()).toHaveClass(/pd-client-group-match/);
  await expect(groups.nth(1)).toHaveClass(/pd-client-group-review/);
  const cards = drawer.locator('.pd-client');
  expect(await cards.count()).toBeGreaterThan(0);
  for (const card of await cards.all()) {
    const heading = card.locator('.pd-client-heading');
    const button = heading.getByRole('button', { name: 'View Client Details', exact: true });
    await expect(button).toBeVisible();
    await expect(heading.locator('.ant-tag')).toHaveCount(0);
    await expect(heading.getByRole('heading')).not.toContainText(/^Demo\b/i);
    await expect(card.locator('.pd-client-next')).toContainText('Next Action:');
    const [headingBox, buttonBox] = await Promise.all([heading.boundingBox(), button.boundingBox()]);
    expect(buttonBox!.height).toBeGreaterThanOrEqual(32);
    expect(buttonBox!.y - headingBox!.y).toBeLessThanOrEqual(4);
    expect(headingBox!.x + headingBox!.width - buttonBox!.x - buttonBox!.width).toBeLessThanOrEqual(2);
  }
});
