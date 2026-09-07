import { expect, test, type Page } from '@playwright/test';
import { ensureSalesIdentity } from './helpers';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { CLOSED_CASES } from '../../shared/prototype-cases';
import { closedDealReport } from '../../shared/closed-deal-report';
import { DEMO_CLIENT_ID } from '../../shared/prototype-demo';

test.use({ viewport: { width: 1440, height: 1000 } });
const assessment = (page: Page) => page.locator('.proto-detail-page:not([hidden])');
const property = (page: Page) => page.locator('.property-detail.ant-drawer-open .ant-drawer-content');
const deal = (page: Page) => page.locator('.closed-case-drawer.ant-drawer-open .ant-drawer-content');
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  (page as Page & { errors: string[] }).errors = errors;
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { errors: string[] }).errors).toEqual([]);
});
async function searchClient(page: Page, name: string) {
  await page.getByRole('navigation').getByRole('button', { name: 'Clients & needs', exact: true }).click();
  await page.getByLabel('Client Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: /View Client Details/ }).click();
}

for (const entry of ['Home', 'Clients & needs']) {
  test(`${entry}: all three recommendations open their own existing property drawer and retain client state`, async ({ page }) => {
    await page.goto('/');
    if (entry === 'Home') await page.locator('.proto-rowlink').filter({ hasText: 'Khalid' }).click();
    else await searchClient(page, 'Khalid');
    await assessment(page).getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Edit Expected price range', { exact: true }).fill('AED 19–21m');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await assessment(page).getByRole('button', { name: /Expected price range/ }).click();
    const before = page.url();
    for (const [name, price, address] of [
      ['Signature Villa, Frond N', '22,500,000', 'Palm Jumeirah, Frond N'],
      ['Garden Home, Frond K', '17,800,000', 'Palm Jumeirah, Frond K'],
      ['Sector E, Emirates Hills', '23,000,000', 'Emirates Hills, Sector E'],
    ]) {
      const card = assessment(page).getByRole('button', { name: new RegExp(name) }).filter({ has: page.locator('b') });
      await card.scrollIntoViewIfNeeded();
      const scroll = await assessment(page).evaluate(el => el.scrollTop);
      await card.click();
      await expect(property(page)).toBeVisible();
      await expect(property(page).locator('.pd-drawer-title h2')).toHaveText(name);
      await expect(property(page).locator('.pd-price')).toContainText(price);
      await expect(property(page).locator('.pd-location')).toContainText(address);
      await expect(property(page).getByRole('tab')).toHaveCount(3);
      await property(page).getByRole('tab', { name: 'Price evidence', exact: true }).click();
      await property(page).getByRole('button', { name: 'Close', exact: true }).click();
      await expect(page).toHaveURL(before);
      await expect(assessment(page).locator('h1')).toHaveText('Khalid Al Mansouri');
      await expect(assessment(page).getByLabel('Core client needs')).toContainText('AED 19–21m');
      await expect(assessment(page).locator('.proto-source.lit')).toContainText('AED 19–21m');
      expect(await assessment(page).evaluate(el => el.scrollTop)).toBeCloseTo(scroll, 0);
      await expect(card).toBeInViewport();
    }
  });
}

test('Property library → potential client → recommendation returns through each layer with tabs and viewing draft retained', async ({ page }) => {
  await page.goto('/#/properties');
  await ensureSalesIdentity(page);
  await page.getByTestId('listing-DEMO-L-001').getByRole('button', { name: /^Open / }).click();
  await property(page).getByRole('tab', { name: 'Potential clients', exact: true }).click();
  await property(page).locator('article[data-client-id="DEMO-C-001"]').getByRole('button', { name: 'View Client Details', exact: true }).click();
  const clientUrl = page.url();
  const clientName = await assessment(page).locator('h1').innerText();
  await assessment(page).locator('.proto-record-tools > summary').click();
  await assessment(page).getByRole('tab', { name: 'Viewing History', exact: true }).click();
  await assessment(page).locator('.client-detail-viewing-entry > summary').click();
  await assessment(page).getByRole('textbox', { name: 'Viewing feedback', exact: true }).fill('Unsubmitted viewing draft');
  // Source selection, open tab and unsubmitted feedback survive a nested property.
  const source = assessment(page).locator('.proto-field').first();
  await source.click();
  const cards = assessment(page).locator('.proto-existing-property');
  expect(await cards.count()).toBeGreaterThan(0);
  for (const card of await cards.all()) {
    const name = await card.locator('h3').innerText();
    await card.getByRole('button', { name: 'View Property Details', exact: true }).click();
    await expect(property(page).locator('.pd-drawer-title h2')).toHaveText(name);
    await property(page).getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page).toHaveURL(clientUrl);
    await expect(assessment(page).locator('h1')).toHaveText(clientName);
    await expect(assessment(page).getByRole('tab', { name: 'Viewing History', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(assessment(page).locator('.proto-record-tools')).toHaveAttribute('open', '');
    await expect(assessment(page).getByRole('textbox', { name: 'Viewing feedback', exact: true })).toHaveValue('Unsubmitted viewing draft');
    await card.locator('h3 button').click();
    await expect(property(page).locator('.pd-drawer-title h2')).toHaveText(name);
    await property(page).getByRole('button', { name: 'Close', exact: true }).click();
  }
  await assessment(page).getByRole('button', { name: '← Back', exact: true }).click();
  await expect(property(page).getByRole('tab', { name: 'Potential clients', exact: true })).toHaveAttribute('aria-selected', 'true');
  await property(page).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL(/#\/properties$/);
});

for (const entry of ['Similar client', 'Own client']) {
  test(`${entry}: both historical drawers preserve context and export matching Word and PDF briefs`, async ({ page }, testInfo) => {
    test.setTimeout(90000);
    await page.goto('/');
    for (const value of CLOSED_CASES) {
      if (entry === 'Similar client') {
        if (!(await assessment(page).isVisible())) await page.locator('.proto-rowlink').filter({ hasText: 'Khalid' }).click();
        await expect(assessment(page).getByRole('button', { name: /Past deal/ })).toHaveCount(0);
        await expect(assessment(page).getByRole('button', { name: /Export/ })).toHaveCount(0);
        await assessment(page).getByRole('button', { name: `View ${value.name} sale`, exact: true }).click();
      } else {
        await searchClient(page, value.name);
        const heading = assessment(page).locator('.proto-client-heading');
        await expect(heading.getByRole('button', { name: /Past deal/ })).toHaveCount(1);
        await heading.getByRole('button', { name: /Past deal/ }).click();
      }
      const clientName = await assessment(page).locator('h1').innerText();
      const clientUrl = page.url();
      const scroll = await assessment(page).evaluate(el => el.scrollTop);
      const report = closedDealReport(value, entry === 'Similar client' ? DEMO_CLIENT_ID : value.clientId);
      await expect(deal(page)).toBeVisible();
      await expect(deal(page).locator('.closed-case-heading h2')).toHaveText(value.name);
      await expect(deal(page)).toContainText(value.result);
      await expect(deal(page).locator('.closed-case-reference h3')).toHaveText(report.sections[4].heading);
      for (const section of report.sections) await expect(deal(page).getByRole('heading', { name: section.heading, exact: true })).toBeAttached();
      await expect.poll(async () => { const box = await deal(page).boundingBox(); return box && Math.round(box.x + box.width); }).toBe(1440);
      expect((await deal(page).boundingBox())!.width).toBeGreaterThan(700);
      await page.screenshot({ path: testInfo.outputPath(`${value.id}-drawer.png`), animations: 'disabled' });
      await deal(page).locator('.closed-case-reference').scrollIntoViewIfNeeded();
      await expect(deal(page).locator('.closed-case-reference')).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(`${value.id}-reference.png`), animations: 'disabled' });
      for (const format of ['Word', 'PDF'] as const) {
        await deal(page).getByRole('button', { name: /Export/ }).click();
        const pending = page.waitForEvent('download');
        await page.getByRole('menuitem', { name: `Export as ${format}`, exact: true }).click();
        const file = await pending;
        expect(await file.failure()).toBeNull();
        const extension = format === 'Word' ? 'docx' : 'pdf';
        expect(file.suggestedFilename()).toBe(`${report.filename}.${extension}`);
        const path = testInfo.outputPath(file.suggestedFilename());
        await file.saveAs(path);
        const bytes = await readFile(path);
        expect(bytes.length).toBeGreaterThan(1500);
        if (format === 'Word') {
          const zip = await JSZip.loadAsync(bytes);
          const xml = await zip.file('word/document.xml')!.async('string');
          const text = xml.replace(/<[^>]+>/g, '').replaceAll('&amp;', '&').replaceAll('&apos;', "'").replaceAll('&gt;', '>').replaceAll('&lt;', '<');
          expect(text).toContain(report.title);
          for (const section of report.sections) {
            expect(text).toContain(section.heading);
            for (const line of section.lines) expect(text).toContain(line);
          }
          if (entry === 'Own client') expect(text).not.toContain('Khalid');
        } else {
          expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
          expect(bytes.toString('latin1')).toContain('/Subtype /Image');
        }
        await expect(deal(page)).toBeVisible();
      }
      await deal(page).getByRole('button', { name: 'Close', exact: true }).click();
      await expect(page).toHaveURL(clientUrl);
      await expect(assessment(page).locator('h1')).toHaveText(clientName);
      expect(await assessment(page).evaluate(el => el.scrollTop)).toBeCloseTo(scroll, 0);
    }
  });
}
