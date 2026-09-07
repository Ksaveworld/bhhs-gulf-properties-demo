import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { prototypeDetailRecords } from '../../shared/prototype-listings';

test.use({ viewport: { width: 1440, height: 1000 } });
for (const item of prototypeDetailRecords().listing_snapshots) {
  test(`${item.listing_id}: populated overview, sale evidence, buyer navigation and matching exports`, async ({ page }, testInfo) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const drawer = () => page.locator('.property-detail.ant-drawer-open .ant-drawer-content');
    await page.goto('/');
    await page.locator('.proto-rowlink').filter({ hasText: 'Khalid' }).click();
    await page.locator('.proto-listing').filter({ hasText: item.title }).click();
    await expect(drawer().getByText('Simulated property, transactions and buyers', { exact: true })).toBeVisible();
    await expect(drawer().locator('.pd-fact-strip')).toContainText(item.area_value!.toLocaleString('en-US'));
    await expect(drawer().locator('.pd-location')).toContainText('Active');
    await expect(drawer().locator('.pd-amenities')).toContainText('pool');
    await drawer().getByRole('tab', { name: 'Price evidence', exact: true }).click();
    const history = drawer().locator('.pd-history-section');
    await expect(history).toContainText('Sales recorded: 2');
    const records = prototypeDetailRecords().transactions.filter(t => t.property_id === item.property_id);
    await history.getByRole('button', { name: new RegExp(`^Transaction ${records[0].transaction_id}:`) }).click();
    await expect(history.locator(`details[data-transaction-id="${records[0].transaction_id}"]`)).toHaveAttribute('open', '');
    await expect(history).toContainText('2019');
    const comparables = drawer().locator('.pd-comparable-section article');
    await expect(comparables).toHaveCount(3);
    for (const row of prototypeDetailRecords().transactions.filter(t => t.transaction_id.startsWith(`SIM-T-${item.listing_id}`) && t.property_id !== item.property_id)) {
      await expect(drawer().getByRole('article', { name: `Comparable transaction ${row.transaction_id}`, exact: true })).toContainText(row.amount!.toLocaleString('en-US'));
    }
    await page.screenshot({ path: testInfo.outputPath('price-evidence.png'), animations: 'disabled' });
    await drawer().getByRole('tab', { name: 'Potential clients', exact: true }).click();
    await expect(drawer().locator('.pd-client-group-match > h3')).toHaveText('Condition Met (1)');
    await expect(drawer().locator('.pd-client-group-review > h3')).toHaveText('Needs Clarification (1)');
    const buyers = prototypeDetailRecords().client_requirements.filter(c => c.preferred_areas!.includes(item.area_name));
    await expect(drawer()).toContainText('500,000 above stated budget maximum');
    await page.screenshot({ path: testInfo.outputPath('potential-clients.png'), animations: 'disabled' });
    for (const buyer of buyers) {
      await drawer().locator(`article[data-client-id="${buyer.client_id}"]`).getByRole('button', { name: 'View Client Details', exact: true }).click();
      const assessment = page.locator('.proto-detail-page:not([hidden])');
      await expect(assessment.locator('h1')).toHaveText(buyer.client_alias);
      await expect(assessment.getByLabel('Core client needs')).toContainText(buyer.budget_max!.toLocaleString('en-US'));
      await assessment.locator('.proto-existing-property').filter({ hasText: item.title }).getByRole('button', { name: 'View Property Details', exact: true }).click();
      await expect(drawer().locator('.pd-drawer-title h2')).toHaveText(item.title);
      await drawer().getByRole('button', { name: 'Close', exact: true }).click();
      await assessment.getByRole('button', { name: '← Back', exact: true }).click();
      await expect(drawer().getByRole('tab', { name: 'Potential clients', exact: true })).toHaveAttribute('aria-selected', 'true');
    }
    for (const format of ['Word', 'PDF']) {
      await drawer().getByRole('button', { name: 'Export Report', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Export report', exact: true });
      await dialog.getByRole('radio', { name: format, exact: true }).check();
      const pending = page.waitForEvent('download');
      await dialog.getByRole('button', { name: 'Download report', exact: true }).click();
      const download = await pending;
      expect(await download.failure()).toBeNull();
      const path = testInfo.outputPath(download.suggestedFilename());
      await download.saveAs(path);
      const bytes = await readFile(path);
      if (format === 'Word') {
        const zip = await JSZip.loadAsync(bytes);
        const text = (await zip.file('word/document.xml')!.async('string')).replace(/<[^>]+>/g, '');
        for (const expected of [item.title, 'Fictional', '2019-06-18', '2022-08-24', 'Comparable Property Transactions', ...buyers.map(b => b.client_alias)]) expect(text).toContain(expected);
      } else {
        expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
        expect(bytes.length).toBeGreaterThan(10000);
      }
    }
    await drawer().getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('.proto-detail-page:not([hidden]) h1')).toHaveText('Khalid Al Mansouri');
    expect(errors).toEqual([]);
  });
}
