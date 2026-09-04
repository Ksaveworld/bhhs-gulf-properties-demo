import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import type { Dataset } from '../../shared/types';
import { requirementStorageKey, type LocalRequirementCopy } from '../../shared/local-requirements';
import { salesRequirementKey } from '../../shared/sales-identity';
import { ensureSalesIdentity } from './helpers';

test.use({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
test.setTimeout(60000);

test('a legacy company review remains Unassigned and exports source ownership without changing its saved bytes', async ({ page, request, context }, testInfo) => {
  const source = await (await request.get('/api/dataset')).json() as Dataset;
  const original = { ...source.client_requirements.find(row => row.requirement_id === 'DEMO-R-001')!, sales_owner: null };
  const dataset: Dataset = { ...source, client_requirements: [original], match_reference: [], meta: { ...source.meta, storage_namespace: 'synthetic-v2-owner-migration-qa' } };
  await context.route('**/api/dataset', route => route.fulfill({ json: dataset }));
  await page.goto('/'); await ensureSalesIdentity(page);
  const key = salesRequirementKey(await requirementStorageKey(dataset), 'LEGACY-REGRESSION-SALES');
  const legacy: LocalRequirementCopy = {
    requirement: { ...original, requirement_id: 'LEGACY-OWNER-REVIEW', sales_owner: 'LEGACY-REGRESSION-SALES', budget_max: 2700000 },
    original_requirement_id: original.requirement_id, parent_requirement_id: original.requirement_id,
    saved_at: '2026-09-03T00:00:00Z',
  };
  const raw = JSON.stringify({ version: 1, key, revision: 'synthetic-legacy-owner-version', copies: [legacy] });
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw });
  await page.reload(); await page.goto('/#/clients');
  const directory = page.getByRole('region', { name: 'Client directory', exact: true });
  await expect(page.getByTestId('local-storage-notice')).toContainText('1 saved browser copies');
  const unassigned = directory.getByRole('radio', { name: 'Unassigned', exact: true });
  await unassigned.locator('xpath=ancestor::label[1]').click();
  const card = directory.locator(`article[data-client-id="${original.client_id}"]`);
  await expect(card).toBeVisible();
  await expect(card.getByText('Unassigned', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: /View Client Details/ }).click();
  const drawer = page.locator('.client-detail-drawer .ant-drawer-content');
  await drawer.getByRole('combobox', { name: 'Independent client plan', exact: true }).selectOption(legacy.requirement.requirement_id);
  await expect(drawer.locator('.client-detail-current')).toContainText('2,700,000');
  await drawer.getByRole('button', { name: 'Export Report', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export report', exact: true });
  await dialog.getByRole('radio', { name: 'Word', exact: true }).check();
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download report', exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  const path = testInfo.outputPath('legacy-company-owner.docx');
  await download.saveAs(path);
  const zip = await JSZip.loadAsync(await readFile(path));
  const xml = await zip.file('word/document.xml')!.async('string');
  const text = xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replaceAll('&amp;', '&');
  expect(text).toContain('Ownership: Company · Unassigned');
  expect(text).not.toContain('Company · LEGACY-REGRESSION-SALES');
  expect(text).toContain('AED 2,700,000');
  expect(text).toContain('DEMONSTRATION ONLY');
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(raw);
  expect(original.sales_owner).toBeNull();
  expect(legacy.requirement.sales_owner).toBe('LEGACY-REGRESSION-SALES');
  await testInfo.attach('legacy-company-owner-word', { path, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
});
