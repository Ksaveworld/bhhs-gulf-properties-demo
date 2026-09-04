import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import type { Dataset } from '../../shared/types';
import { requirementStorageKey } from '../../shared/local-requirements';
import { salesRequirementKey } from '../../shared/sales-identity';
import { viewingStorageKey, type StoredViewingRecords, type ViewingRecord } from '../../shared/viewing-records';
import { propertyDisplayName } from '../../shared/property-presentation';
import { ensureSalesIdentity } from './helpers';

test.use({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
test.setTimeout(60000);

test('legacy USD viewing survives reload and reopen, retains its original currency, and exports without rewriting storage', async ({ page, request, context }, testInfo) => {
  const source = await (await request.get('/api/dataset')).json() as Dataset;
  const dataset: Dataset = { ...source, meta: { ...source.meta, storage_namespace: 'synthetic-v2-usd-viewing-migration-qa' } };
  const listing = dataset.listing_snapshots.find(row => row.listing_id === 'DEMO-L-010')!;
  expect(listing.currency).toBe('USD');
  const propertyName = propertyDisplayName(listing);
  const salesId = 'LEGACY-REGRESSION-SALES';
  const scope = salesRequirementKey(await requirementStorageKey(dataset), salesId);
  const key = viewingStorageKey({ scope, salesId });
  const record: ViewingRecord = {
    record_id: 'VIEW-SYNTHETIC-LEGACY-USD', client_id: 'DEMO-C-001', listing_id: listing.listing_id,
    sales_id: salesId, viewed_at: '2026-09-02T09:30:00.000Z',
    feedback: 'Synthetic legacy USD viewing feedback remains available.', feedback_signal: 'mixed',
    preference_tags: [], source_kind: 'sales_entered', source_ref: 'LOCAL-SALES:VIEW-SYNTHETIC-LEGACY-USD',
    data_kind: 'demo', created_at: '2026-09-02T10:00:00.000Z',
  };
  const stored: StoredViewingRecords = { version: 1, key, revision: 'synthetic-legacy-usd-v1', records: [record] };
  const raw = JSON.stringify(stored);
  await context.route('**/api/dataset', route => route.fulfill({ json: dataset }));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await ensureSalesIdentity(page);
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw });
  await page.goto('/#/clients');
  const directory = page.getByRole('region', { name: 'Client directory', exact: true });
  await directory.locator(`article[data-client-id="${record.client_id}"]`).getByRole('button', { name: /View Client Details/ }).click();
  const drawer = page.locator('.client-detail-drawer .ant-drawer-content');
  await drawer.getByRole('combobox', { name: 'Independent client plan', exact: true }).selectOption('DEMO-R-001');
  const recommendations = drawer.locator('[data-match-group] article[data-listing-id]');
  expect(await recommendations.count()).toBeGreaterThan(0);
  const originalCandidates = await recommendations.evaluateAll(rows => rows.map(row => row.getAttribute('data-listing-id')));
  expect(originalCandidates).not.toContain(listing.listing_id);
  await drawer.getByRole('tab', { name: 'Viewing History', exact: true }).click();
  await expect(drawer.getByTestId('client-viewing-count')).toHaveText('1 recorded viewings');
  const viewing = drawer.locator(`li[data-viewing-id="${record.record_id}"]`);
  await expect(viewing).toContainText(propertyName);
  await expect(viewing).toContainText(record.feedback);
  await expect(viewing).not.toContainText('Demo record');
  await expect(viewing).toContainText(`Recorded by ${record.sales_id}`);
  await expect(viewing.locator('time')).toHaveAttribute('datetime', record.viewed_at);
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(raw);

  await page.reload();
  await drawer.getByRole('tab', { name: 'Viewing History', exact: true }).click();
  await expect(viewing).toContainText(record.feedback);
  await expect(drawer.getByTestId('client-viewing-count')).toHaveText('1 recorded viewings');
  const reopened = await context.newPage();
  reopened.on('pageerror', error => errors.push(error.message));
  await reopened.goto(page.url());
  const reopenedDrawer = reopened.locator('.client-detail-drawer .ant-drawer-content');
  await reopenedDrawer.getByRole('combobox', { name: 'Independent client plan', exact: true }).selectOption('DEMO-R-001');
  expect(await reopenedDrawer.locator('[data-match-group] article[data-listing-id]').evaluateAll(rows => rows.map(row => row.getAttribute('data-listing-id')))).toEqual(originalCandidates);
  await reopenedDrawer.getByRole('tab', { name: 'Viewing History', exact: true }).click();
  const reopenedViewing = reopenedDrawer.locator(`li[data-viewing-id="${record.record_id}"]`);
  await expect(reopenedViewing).toContainText(record.feedback);
  await expect(reopenedDrawer.getByTestId('client-viewing-count')).toHaveText('1 recorded viewings');
  const entry = reopenedDrawer.locator('.client-detail-viewing-entry');
  if (await entry.getAttribute('open') === null) await entry.locator('summary').click();
  await expect(entry.getByRole('combobox', { name: 'Viewed property', exact: true }).locator(`option[value="${listing.listing_id}"]`)).toContainText('USD');
  await reopenedViewing.getByRole('button', { name: propertyName, exact: true }).click();
  const property = reopened.locator('.property-detail .ant-drawer-content');
  await expect(property).toBeVisible();
  await expect(property.getByText(`USD ${listing.asking_price!.toLocaleString('en-US')}`, { exact: true })).toBeVisible();
  await expect(property.getByText(`AED ${listing.asking_price!.toLocaleString('en-US')}`, { exact: true })).toHaveCount(0);
  await property.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(property).toBeHidden();

  await reopenedDrawer.getByRole('button', { name: 'Export Report', exact: true }).click();
  const dialog = reopened.getByRole('dialog', { name: 'Export report', exact: true });
  await dialog.getByRole('radio', { name: 'Word', exact: true }).check();
  const pending = reopened.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download report', exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  const path = testInfo.outputPath('legacy-usd-viewing.docx');
  await download.saveAs(path);
  const zip = await JSZip.loadAsync(await readFile(path));
  const xml = await zip.file('word/document.xml')!.async('string');
  const text = xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replaceAll('&amp;', '&');
  expect(text).toContain(propertyName);
  expect(text).toContain(record.feedback);
  expect(text).toContain('DEMONSTRATION ONLY');
  expect(await reopened.evaluate(key => localStorage.getItem(key), key)).toBe(raw);
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(raw);
  expect(errors).toEqual([]);
  const unchangedSource = await (await request.get('/api/dataset')).json() as Dataset;
  expect(unchangedSource.listing_snapshots.find(row => row.listing_id === listing.listing_id)).toEqual(listing);
  await testInfo.attach('legacy-usd-viewing-word', { path, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  await testInfo.attach('legacy-viewing-evidence', { body: JSON.stringify({ listing_id: listing.listing_id, currency: listing.currency, originalCandidates, oldStorageBytesUnchanged: true, browserErrors: errors }), contentType: 'application/json' });
  await reopened.close();
});
