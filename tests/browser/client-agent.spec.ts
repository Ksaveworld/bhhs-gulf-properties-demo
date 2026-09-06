import { expect, test } from '@playwright/test';
import { ensureSalesIdentity } from './helpers';

test.use({ viewport: { width: 1366, height: 900 } });
test.setTimeout(60000);

test('source changes drive candidates, price detail returns to the brief, simulated feedback updates without an external call', async ({ page }, testInfo) => {
  const externalWrites: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && !request.url().startsWith('http://127.0.0.1:5173/')) externalWrites.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Read this client' })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('agent-home.png'), fullPage: true });
  await page.getByRole('button', { name: 'Explore example' }).click();
  await expect(page.getByRole('heading', { name: 'Alex Morgan', exact: true })).toBeVisible();
  await expect(page.locator('.agent-change-note')).toContainText('1 change to review');
  await expect(page.locator('.agent-property').filter({ hasText: 'Harbour View' })).toHaveCount(0);
  const budget = page.getByRole('group', { name: 'Budget evidence', exact: true });
  await expect(budget).toContainText('2,500,000');
  await budget.getByRole('button').click();
  await expect(page.getByLabel('Source text')).toContainText('My budget cap is AED 2.5m');
  await page.getByRole('combobox', { name: 'Source for Budget' }).press('Enter');
  await page.getByTitle(/AED up to 2,800,000 — Initial call/).click();
  await expect(page.locator('.agent-property').filter({ hasText: 'Harbour View' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Source for Budget' }).press('Enter');
  await page.getByTitle(/AED up to 2,500,000 — Latest WhatsApp/).click();
  await page.getByRole('combobox', { name: 'Source for Budget' }).press('Escape');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('agent-brief.png'), fullPage: true });
  await page.getByRole('button', { name: 'Details & price evidence' }).first().click();
  const property = page.getByRole('dialog').filter({ has: page.getByRole('tab', { name: 'Price evidence', exact: true }) });
  await property.getByRole('tab', { name: 'Price evidence', exact: true }).click();
  await expect(property.locator('.pd-history-section')).toBeVisible();
  await property.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alex Morgan', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Simulate follow-up' }).click();
  const call = page.getByRole('dialog', { name: 'Simulated client follow-up' });
  await call.getByRole('button', { name: 'Start simulated call' }).click();
  await call.getByRole('button', { name: 'Finish & review notes' }).click();
  await call.getByRole('button', { name: 'Use fictional response' }).click();
  await call.getByRole('button', { name: 'Add feedback to workspace' }).click();
  await expect(call).toBeHidden();
  await expect(budget.locator('strong')).toContainText('2,300,000');
  await expect(page.locator('.agent-property').filter({ hasText: 'Marina Vista' })).toHaveCount(0);
  await expect(page.locator('.agent-property').filter({ hasText: 'Marina Cove' })).toContainText('Asking price is undisclosed');
  await expect(page.getByLabel('Source text')).toContainText('My budget cap is AED 2.3m');
  await expect(page.locator('.agent-brief-top')).toContainText('Session draft');
  expect(externalWrites).toEqual([]);
});

test('review and identity are required before saving; the saved client and original source survive reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore example' }).click();
  await expect(page.getByRole('button', { name: 'Save client copy', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Review & confirm brief' }).click();
  const review = page.getByRole('dialog', { name: 'Review the client brief' });
  await review.getByRole('textbox', { name: 'Client Name / Alias', exact: true }).fill('');
  await expect(review.getByRole('button', { name: 'Use reviewed brief' })).toBeDisabled();
  await review.getByRole('textbox', { name: 'Client Name / Alias', exact: true }).fill('Agent QA Client');
  await review.getByRole('button', { name: 'Use reviewed brief' }).click();
  await expect(page.getByRole('heading', { name: 'Agent QA Client', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Client evidence', exact: true }).getByRole('button', { name: 'Sales review' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in to save client copy' }).click();
  const signIn = page.getByRole('dialog', { name: 'Sales sign in', exact: true });
  await signIn.getByRole('textbox', { name: 'Username', exact: true }).fill('Workspace reviewer');
  await signIn.getByRole('textbox', { name: 'Sales ID', exact: true }).fill('AGENT-QA');
  await signIn.getByRole('button', { name: 'Continue as sales' }).click();
  await page.getByRole('button', { name: 'Save client copy', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /^Agent QA Client/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('dialog', { name: /^Agent QA Client/ })).toBeVisible();
  const saved = await page.evaluate(() => Object.keys(localStorage).map(key => localStorage.getItem(key)).filter(value => value?.includes('Agent QA Client')).join('\n'));
  expect(saved).toContain('Initial call');
  expect(saved).toContain('fictional example');
  expect(saved).toContain('2500000');
});

test('text import, unsupported files and incomplete notes remain honest and editable', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Import client text file').setInputFiles({ name: 'voice.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('not audio') });
  await expect(page.getByRole('alert')).toContainText('Choose a .txt');
  await page.getByLabel('Import client text file').setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('Client name: Pat. Please call me tomorrow.') });
  await expect(page.getByRole('textbox', { name: 'Client material', exact: true })).toHaveValue('Client name: Pat. Please call me tomorrow.');
  await page.getByRole('button', { name: 'Read this client' }).click();
  await expect(page.getByRole('heading', { name: 'Pat', exact: true })).toBeVisible();
  await expect(page.locator('.agent-fact').filter({ has: page.getByText('Location', { exact: true }) })).toContainText('To confirm');
  await page.getByRole('button', { name: 'Review & confirm brief' }).click();
  await expect(page.getByRole('button', { name: 'Use reviewed brief' })).toBeDisabled();
  await page.getByRole('dialog', { name: 'Review the client brief' }).getByRole('button', { name: 'Close', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('agent-mobile.png'), fullPage: true });
});

test('explicit existing-client linkage retains baseline, new source changes only the proposed draft, and quick tools remain available', async ({ page }) => {
  await page.goto('/');
  await page.locator('.agent-client-card').first().click();
  await expect(page.getByLabel('Source text')).toContainText('What we already know');
  const originalName = await page.locator('.agent-brief-heading h1').innerText();
  await page.getByRole('button', { name: 'Add material', exact: true }).click();
  const add = page.getByRole('dialog', { name: 'Add a client interaction' });
  await add.getByRole('textbox', { name: 'Client material' }).fill('My budget cap is AED 2.2m.');
  await add.getByRole('button', { name: 'Read new material' }).click();
  await expect(page.locator('.agent-brief-heading h1')).toHaveText(originalName);
  await expect(page.getByRole('group', { name: 'Budget evidence', exact: true }).locator('strong')).toContainText('2,200,000');
  await page.locator('.agent-source-list').getByRole('button', { name: /Current client record/ }).click();
  await page.getByRole('button', { name: 'Open full client record' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Quick tools', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Find a Property', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a Private Client', exact: true })).toBeVisible();
});

test('an existing client can save successive feedback revisions without a stale target', async ({ page }) => {
  await page.goto('/');
  await ensureSalesIdentity(page);
  await page.locator('.agent-client-card').first().click();
  for (const budget of ['2.5m', '2.4m']) {
    await page.getByRole('button', { name: 'Add material', exact: true }).click();
    const add = page.getByRole('dialog', { name: 'Add a client interaction' });
    await add.getByRole('textbox', { name: 'Client material' }).fill(`My budget cap is AED ${budget}.`);
    await add.getByRole('button', { name: 'Read new material' }).click();
    await page.getByRole('button', { name: 'Review & confirm brief' }).click();
    await page.getByRole('button', { name: 'Use reviewed brief' }).click();
    await page.getByRole('button', { name: 'Save client copy', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Client copy saved', exact: true })).toBeDisabled();
  }
  const saved = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('bhhs:local-requirements:')).map(key => localStorage.getItem(key)).join('\n'));
  expect(saved).toContain('2500000');
  expect(saved).toContain('2400000');
});
