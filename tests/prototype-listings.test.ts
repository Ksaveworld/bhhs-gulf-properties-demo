import test from 'node:test';
import assert from 'node:assert/strict';
import { demoProperties } from '../shared/prototype-demo';
import { prototypeListing, prototypeDetailRecords, withPrototypeDetails, propertyClientRequirements } from '../shared/prototype-listings';
import { propertyDisplayName } from '../shared/property-presentation';
import { getPriceEvidence } from '../shared/pricing';
import { evaluateMatch } from '../shared/matching';
import { propertySalesReport } from '../shared/sales-report';
import type { Dataset } from '../shared/types';

const empty: Dataset = { listing_snapshots: [], transactions: [], listing_transaction_links: [], client_requirements: [], match_reference: [], meta: { mode: 'demo', label: 'Test', loaded_at: '', warnings: [], quarantined_count: 0 } };
test('three complete simulated properties preserve shortlist prices and distinct identities', () => {
  const rows = prototypeDetailRecords().listing_snapshots;
  for (const item of demoProperties) {
    const row = prototypeListing(item.id)!;
    assert.equal(propertyDisplayName(row), item.name);
    assert.equal(row.area_name, item.address);
    assert.equal(row.asking_price, item.asking * 1_000_000);
    assert.ok(row.area_value! > 0);
    assert.equal(row.listing_status, 'active');
    assert.equal(row.data_kind, 'demo');
    assert.match(row.source_ref, /^SIMULATED:/);
  }
  assert.equal(new Set(rows.map(row => row.property_id)).size, 3);
  assert.equal(prototypeListing('DEMO-L-001'), null);
  assert.equal(prototypeListing('missing'), null);
});
test('each property has two own sales and three separate comparable sales through unchanged evidence gates', () => {
  const dataset = withPrototypeDetails(empty);
  for (const listing of dataset.listing_snapshots) {
    const evidence = getPriceEvidence(listing, dataset);
    assert.equal(evidence.history.length, 2);
    assert.equal(evidence.comparables.length, 3);
    assert.equal(evidence.excluded_count, 0);
    for (const record of evidence.history) assert.equal(record.transaction.property_id, listing.property_id);
    for (const record of evidence.comparables) assert.notEqual(record.transaction.property_id, listing.property_id);
    assert.equal(getPriceEvidence({ ...listing, property_id: 'wrong-id' }, dataset).history.length, 0);
  }
  assert.deepEqual(getPriceEvidence(prototypeListing('frond-n')!, dataset).comparables.map(r => r.transaction.amount), [20_800_000, 21_600_000, 22_400_000]);
});
test('each simulated buyer cohort contains a match and a genuine budget clarification and agrees with exports', () => {
  const dataset = withPrototypeDetails(empty);
  for (const listing of dataset.listing_snapshots) {
    const buyers = propertyClientRequirements(listing, dataset.client_requirements);
    assert.equal(buyers.length, 2);
    assert.equal(evaluateMatch(listing, buyers[0]).status, 'match');
    const review = evaluateMatch(listing, buyers[1]);
    assert.equal(review.status, 'review');
    assert.ok(review.conflicts.some(s => /budget maximum/.test(s)));
    const report = propertySalesReport(listing, dataset, buyers, []);
    assert.match(report.disclosure, /Fictional/);
    assert.equal(report.sections.find(s => s.heading === 'Property Transaction History')!.lines.length, 2);
    assert.equal(report.sections.find(s => s.heading === 'Comparable Property Transactions')!.lines.length, 3);
    for (const buyer of buyers) assert.ok(JSON.stringify(report).includes(buyer.client_alias));
  }
});
test('demo augmentation is immutable and idempotent and never touches product data', () => {
  const once = withPrototypeDetails(empty);
  assert.deepEqual(withPrototypeDetails(once), once);
  assert.equal(empty.listing_snapshots.length, 0);
  const product = { ...empty, meta: { ...empty.meta, mode: 'product' as const } };
  assert.equal(withPrototypeDetails(product), product);
  for (const rows of Object.values(prototypeDetailRecords())) for (const row of rows) assert.equal(row.data_kind, 'demo');
});
