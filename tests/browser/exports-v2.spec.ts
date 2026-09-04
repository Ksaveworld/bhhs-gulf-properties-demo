import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { ensureSalesIdentity } from './helpers';

test.use({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
test.setTimeout(90000);
const failures = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  failures.set(page, []);
  page.on('pageerror', error => failures.get(page)!.push(error.message));
  await page.goto('/#/properties');
  await expect(page.getByTestId('listing-DEMO-L-001')).toBeVisible();
});
test.afterEach(async ({ page }, testInfo) => {
  expect.soft(failures.get(page)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('export-v2-end.png'), fullPage: true });
});

async function download(page: Page, testInfo: TestInfo, format: 'Word' | 'PDF', name: string) {
  const dialog = page.getByRole('dialog', { name: 'Export report', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: format, exact: true }).check();
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download report', exact: true }).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  const extension = format === 'Word' ? 'docx' : 'pdf';
  expect(file.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
  const path = testInfo.outputPath(`${name}.${extension}`);
  await file.saveAs(path);
  const bytes = await readFile(path);
  expect(bytes.length).toBeGreaterThan(1000);
  await testInfo.attach(name, { path, contentType: format === 'Word' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf' });
  return bytes;
}
async function docx(bytes: Buffer) {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml')!.async('string');
  const text = xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replaceAll('&amp;', '&');
  return { zip, xml, text };
}
async function exportProperty(page: Page) {
  const property = page.locator('.property-detail.ant-drawer-open .ant-drawer-content');
  if (!await property.isVisible()) await page.getByTestId('listing-DEMO-L-001').getByRole('button', { name: /^Open / }).click();
  await property.getByRole('button', { name: 'Export Report', exact: true }).click();
}

test('property Word download contains one own-history section, comparable evidence, chart and current row price', async ({ page }, testInfo) => {
  await exportProperty(page);
  const result = await docx(await download(page, testInfo, 'Word', 'property-word'));
  expect(result.text).toContain('Marina Vista');
  expect(result.text).toContain('AED 2,450,000');
  expect(result.text.match(/Property Transaction History/g)).toHaveLength(1);
  expect(result.text.match(/Comparable Property Transactions/g)).toHaveLength(1);
  expect(result.text.indexOf('Property Transaction History')).toBeLessThan(result.text.indexOf('Comparable Property Transactions'));
  expect(result.text).toContain('DEMONSTRATION ONLY');
  expect(result.text).toContain('Source:');
  expect(result.text).toContain('Condition Met');
  expect(result.text).toContain('Needs Clarification');
  expect(result.text).not.toMatch(/Hard Conflict|Unique Clients|Snapshot ID|Usage Review|Demo Fixture Author|Link ID/);
  expect(Object.keys(result.zip.files).filter(path => /^word\/media\/[^/]+\.png$/.test(path)).length).toBeGreaterThan(0);
  expect(result.xml).toContain('w:drawing');
});

test('property PDF downloads a valid multi-page file with rendered chart and evidence pages', async ({ page }, testInfo) => {
  await exportProperty(page);
  const bytes = await download(page, testInfo, 'PDF', 'property-pdf');
  const raw = bytes.toString('latin1');
  expect(raw.startsWith('%PDF-')).toBe(true);
  expect(raw).toContain('%%EOF');
  expect(raw).toContain('/Subtype /Image');
  expect(raw.match(/\/Type \/Page\b/g)?.length ?? 0).toBeGreaterThan(1);
});

test('client Word download follows its drawer and contains recommendations and viewing sections', async ({ page }, testInfo) => {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /Clients & needs/ }).click();
  const card = page.locator('.client-directory-client').first();
  const alias = await card.locator('.client-directory-client-name strong').innerText();
  await card.getByRole('button', { name: /View Client Details/ }).click();
  const drawer = page.getByRole('dialog').filter({ has: page.getByRole('tab', { name: 'Recommended Properties', exact: true }) });
  await drawer.getByRole('button', { name: /Export report/i }).click();
  const result = await docx(await download(page, testInfo, 'Word', 'client-word'));
  expect(result.text).toContain(alias);
  for (const section of ['Current requirements', 'Requirement changes', 'Best Matches', 'Worth Considering', 'Viewing History', 'Ownership:']) expect(result.text).toContain(section);
  expect(result.text).not.toMatch(/Hard Conflict|Unique Clients|Snapshot ID|Link ID/);
});

test('private client report is scoped to its creator and is absent from another Sales ID property export', async ({ page }, testInfo) => {
  await ensureSalesIdentity(page);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /\bHome$/ }).click();
  const home = page.getByRole('region', { name: 'Sales task workspace', exact: true });
  await home.getByRole('button', { name: 'Create a Private Client', exact: true }).click();
  await home.getByRole('textbox', { name: 'Sales conversation / notes' }).fill('Client name: Synthetic Export Owner Only. A ready 2 bedroom apartment in Dubai Marina, budget AED 2.8m.');
  await home.getByRole('button', { name: 'Send request', exact: true }).click();
  await home.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('dialog', { name: 'Confirm private client', exact: true }).getByRole('button', { name: 'Confirm & Create', exact: true }).click();
  const drawer = page.getByRole('dialog').filter({ has: page.getByRole('tab', { name: 'Recommended Properties', exact: true }) });
  await expect(drawer).toContainText('Synthetic Export Owner Only');
  await drawer.getByRole('button', { name: /Export report/i }).click();
  const own = await docx(await download(page, testInfo, 'Word', 'own-private-client'));
  expect(own.text).toContain('Synthetic Export Owner Only');
  expect(own.text).toContain('LEGACY-REGRESSION-SALES');
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /Property library/ }).click();
  await exportProperty(page);
  const ownProperty = await docx(await download(page, testInfo, 'Word', 'own-sales-property'));
  expect(ownProperty.text).toContain('Synthetic Export Owner Only');
  await page.locator('.property-detail.ant-drawer-open .ant-drawer-content').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Switch sales identity', exact: true }).click();
  const signIn = page.getByRole('dialog', { name: 'Sales sign in', exact: true });
  await signIn.getByRole('textbox', { name: 'Username', exact: true }).fill('Synthetic Other Sales');
  await signIn.getByRole('textbox', { name: 'Sales ID', exact: true }).fill('EXPORT-OTHER-SALES');
  await signIn.getByRole('button', { name: 'Continue as sales', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /Property library/ }).click();
  await exportProperty(page);
  const other = await docx(await download(page, testInfo, 'Word', 'other-sales-property'));
  expect(other.text).not.toContain('Synthetic Export Owner Only');
});

test('PDF rendering failure remains visible and does not create a download', async ({ page }) => {
  await exportProperty(page);
  let downloads = 0;
  page.on('download', () => downloads++);
  await page.evaluate(() => { HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext; });
  const dialog = page.getByRole('dialog', { name: 'Export report', exact: true });
  await dialog.getByRole('button', { name: 'Download report', exact: true }).click();
  await expect(dialog).toContainText('The report could not be generated');
  expect(downloads).toBe(0);
  await expect(dialog.getByRole('button', { name: 'Download report', exact: true })).toBeEnabled();
});
