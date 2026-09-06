import { expect, test, type Page } from '@playwright/test';
import { ensureSalesIdentity } from './helpers';

async function start(page: Page) {
  await page.goto('/#/home');
  await page.getByRole('button', { name: 'Use example materials', exact: true }).click();
  await page.getByRole('button', { name: 'Skip animation' }).click();
  await expect(page.getByRole('button', { name: 'Confirm same client' })).toBeVisible();
}
async function accept(page: Page, keepBudget = false) {
  await page.getByRole('button', { name: 'Confirm same client' }).click();
  await expect(page.getByRole('button', { name: 'Confirm extracted information' })).toBeDisabled();
  await page.getByRole('button', { name: `Budget: ${keepBudget ? 'Keep CRM' : 'Use new information'}`, exact: true }).click();
  await page.getByRole('button', { name: 'Location: Use new information', exact: true }).click();
  await page.getByRole('button', { name: 'Property type: Use new information', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm extracted information' }).click();
}
async function brief(page: Page) {
  await page.getByRole('button', { name: 'Confirm on next call' }).click();
  await page.getByRole('button', { name: 'View client brief' }).click();
}

test('confirmation gates, source trace, automatic call feedback and edited viewing invitation form one chain', async ({ page }, info) => {
  const writes: string[] = [];
  page.on('request', r => { if (['POST', 'PUT', 'PATCH'].includes(r.method())) writes.push(r.url()); });
  await start(page);
  await expect(page.getByRole('button', { name: 'View client brief' })).toHaveCount(0);
  await accept(page);
  await brief(page);
  await expect(page.getByTestId('payment-followup')).toBeVisible();
  await expect(page.getByRole('img', { name: /Price axis/ })).toBeVisible();
  await page.getByRole('button', { name: /Before making an offer/ }).click();
  await expect(page.locator('.story-source.lit')).toContainText('Brother handles negotiation');
  await page.getByRole('button', { name: 'Call Khalid' }).click();
  const modal = page.getByRole('dialog', { name: 'Demo call' });
  await modal.getByRole('button', { name: 'Hang up' }).click();
  await expect(modal.getByRole('textbox', { name: 'Communication points', exact: true })).toBeVisible();
  await modal.getByRole('textbox', { name: 'Commitments', exact: true }).fill('Send service charge records by Wednesday.');
  await modal.getByRole('textbox', { name: 'Call viewing time' }).fill('Saturday, 14:00');
  await modal.getByRole('textbox', { name: 'Call attendees' }).fill('Client and wife');
  await modal.getByRole('button', { name: 'Save to CRM' }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByTestId('payment-followup')).toHaveCount(0);
  await expect(page.locator('.story-source').first()).toContainText('Outbound call');
  await expect(page.getByRole('button', { name: /How they are paying/ })).toContainText('from this call');
  await expect(page.locator('.story-steps').last()).toContainText('Wednesday');
  await page.getByRole('button', { name: 'Book viewing', exact: true }).click();
  const booking = page.getByRole('dialog', { name: 'Book viewing', exact: true });
  await expect(booking.getByRole('textbox', { name: 'Viewing time' })).toHaveValue('Saturday, 14:00');
  await expect(booking.getByRole('textbox', { name: 'Viewing attendees' })).toHaveValue('Client and wife');
  await booking.getByRole('textbox', { name: 'Viewing time' }).fill('Sunday, 10:30');
  await booking.getByRole('button', { name: 'Confirm and send' }).click();
  await expect(page.getByRole('status')).toContainText('Sunday, 10:30');
  await page.getByRole('button', { name: 'Back to previous view' }).click();
  await expect(page.getByLabel('Client analysis conversation')).toContainText('Confirmed: Khalid');
  await page.getByRole('button', { name: 'View client brief' }).click();
  await expect(page.locator('.story-source').first()).toContainText('Outbound call');
  await expect(page.getByRole('status')).toContainText('Sunday, 10:30');
  await page.screenshot({ path: info.outputPath('client-brief.png'), fullPage: true });
  expect(writes).toEqual([]);
});

test('retaining CRM budget changes the price warning; switching properties does not reuse another strategy', async ({ page }) => {
  await start(page); await accept(page, true); await brief(page);
  await expect(page.getByRole('button', { name: /Budget range/ })).toContainText('16,000,000');
  await expect(page.getByText('Client ceiling 16m is below the proposed target.', { exact: false })).toBeVisible();
  await page.locator('.story-property').filter({ hasText: 'Garden Home' }).click();
  await expect(page.getByRole('img', { name: /Price axis/ })).toHaveCount(0);
  await expect(page.getByText('No comparable transactions or seller history', { exact: false })).toBeVisible();
});

test('rejecting identity creates a separate draft; add payment now and edit fields preserve source evidence', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Not the same' }).click();
  await page.getByRole('textbox', { name: 'New client name' }).fill('Separate buyer');
  await page.getByRole('textbox', { name: 'New client phone' }).fill('555-0148');
  await page.getByRole('button', { name: 'Create and continue' }).click();
  await expect(page.getByRole('button', { name: 'Budget: Keep CRM', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirm extracted information' }).click();
  await page.getByRole('button', { name: 'Add now' }).click();
  await page.getByRole('button', { name: 'Confirm payment', exact: true }).click();
  await page.getByRole('button', { name: 'View client brief' }).click();
  await expect(page.getByRole('heading', { name: 'Separate buyer', exact: true })).toBeVisible();
  await expect(page.getByTestId('payment-followup')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Budget maximum', exact: true }).fill('21000000');
  await page.getByRole('textbox', { name: 'Edit decision makers' }).fill('Buyer decides alone.');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('button', { name: /Budget range/ }).click();
  await expect(page.locator('.story-source.lit')).toContainText('21,000,000');
  await page.getByRole('button', { name: /Who decides/ }).click();
  await expect(page.locator('.story-source.lit')).toContainText('Buyer decides alone.');
});

test('unknown payment in edited call stays unresolved; closing summary writes nothing', async ({ page }) => {
  await start(page); await accept(page); await brief(page);
  const count = await page.locator('.story-source').count();
  await page.getByRole('button', { name: 'Call Khalid' }).click();
  await page.getByRole('button', { name: 'Hang up' }).click();
  const modal = page.getByRole('dialog', { name: 'Demo call' });
  await expect(modal.getByRole('button', { name: 'Save to CRM' })).toBeVisible();
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.story-source')).toHaveCount(count);
  await expect(page.getByTestId('payment-followup')).toBeVisible();
  await page.getByRole('button', { name: 'Call Khalid' }).click();
  await page.getByRole('button', { name: 'Hang up' }).click();
  await modal.getByRole('combobox', { name: 'Call payment' }).press('Enter');
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option[title="unknown"]').click();
  await modal.getByRole('textbox', { name: 'Changed information' }).fill('Payment still unconfirmed.');
  await modal.getByRole('button', { name: 'Save to CRM' }).click();
  await expect(page.getByTestId('payment-followup')).toBeVisible();
  await expect(page.getByRole('button', { name: /Still to confirm Cash or mortgage/ })).toBeVisible();
});

test('plain text does not receive the scripted identity; sales copy survives reload', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Import client text file').setInputFiles({ name: 'voice.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('bad') });
  await expect(page.getByRole('alert')).toContainText('Choose a .txt');
  await page.getByRole('textbox', { name: 'Client material', exact: true }).fill('Client name: Pat. I need a ready 2 bedroom apartment in Dubai Marina for self use, budget cap AED 2.5m.');
  await page.getByRole('button', { name: 'Read this client' }).click();
  await page.getByRole('button', { name: 'Skip animation' }).click();
  await expect(page.getByLabel('Client analysis conversation')).not.toContainText('214 illustrative');
  await expect(page.getByRole('button', { name: 'Confirm same client' })).toBeDisabled();
  await page.getByRole('button', { name: 'Not the same' }).click();
  await page.getByRole('textbox', { name: 'New client name' }).fill('Pat');
  await page.getByRole('button', { name: 'Create and continue' }).click();
  await page.getByRole('button', { name: 'Confirm extracted information' }).click(); await brief(page);
  await expect(page.getByRole('button', { name: 'Call Pat' })).toHaveCount(0);
  await ensureSalesIdentity(page);
  await page.getByRole('button', { name: 'Save client copy', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Client details', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Client details', exact: true }).getByRole('heading', { name: 'Pat', exact: true })).toBeVisible();
});

test('client directory opens full-page brief, property return and home conversation are retained', async ({ page }) => {
  await start(page); await accept(page); await brief(page);
  await page.getByRole('button', { name: 'Clients & needs', exact: true }).click();
  await page.getByRole('button', { name: 'View Client Details' }).first().click();
  const panel = page.getByRole('region', { name: 'Client details', exact: true });
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box!.width).toBeGreaterThan(1000);
  await panel.getByRole('button', { name: 'Back to previous view' }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Khalid Al Mansouri', exact: true })).toBeVisible();
});

test('mobile home and complete brief fit the viewport', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.screenshot({ path: info.outputPath('home-mobile.png'), fullPage: true });
  await start(page); await accept(page); await brief(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('brief-mobile.png'), fullPage: true });
});

test('successive materials preserve the reviewed client and save two revisions to the same owner', async ({ page }) => {
  await page.goto('/'); await ensureSalesIdentity(page);
  for (const [index, amount] of ['2.5m', '2.4m'].entries()) {
    if (index) await page.getByRole('button', { name: 'Back to previous view' }).click();
    await page.getByRole('textbox', { name: 'Client material', exact: true }).fill(`My budget cap is AED ${amount}.`);
    await page.getByRole('button', { name: 'Read this client' }).click();
    await page.getByRole('button', { name: 'Skip animation' }).click();
    if (!index) {
      await page.getByRole('combobox', { name: 'Link to client' }).press('Enter');
      await page.locator('.ant-select-dropdown:visible .ant-select-item-option').first().click();
    }
    await page.getByRole('button', { name: 'Confirm same client' }).click();
    await page.getByRole('button', { name: 'Budget: Use new information', exact: true }).last().click();
    await page.getByRole('button', { name: 'Confirm extracted information' }).click();
    await brief(page);
    await page.getByRole('button', { name: 'Save client copy', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Client copy saved', exact: true })).toBeVisible();
  }
  const copies = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('bhhs:local-requirements:')).flatMap(k => JSON.parse(localStorage.getItem(k)!).copies ?? []));
  expect(copies.map(c => c.requirement.budget_max).sort()).toEqual([2400000, 2500000]);
  expect(new Set(copies.map(c => c.requirement.client_id)).size).toBe(1);
});
