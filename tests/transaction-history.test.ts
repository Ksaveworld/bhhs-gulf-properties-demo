import assert from 'node:assert/strict';
import test from 'node:test';
import { getPriceEvidence, type LinkedTransaction } from '../shared/pricing';
import {
  filterTransactionHistory,
  groupTransactionHistory,
  historyDatePosition,
  uniqueHistoryRecords,
} from '../shared/transaction-history';
import type { Dataset, ListingSnapshot, ListingTransactionLink, Transaction } from '../shared/types';

const source = {
  data_kind: 'demo' as const, source_name: 'Synthetic history fixture', source_ref: 'DEMO-HISTORY-SOURCE',
  source_date: null, captured_at: '2026-09-03T12:00:00Z', verification_status: 'verified' as const,
  usage_status: 'approved' as const, reviewed_by: 'Synthetic fixture reviewer', notes: 'Fictional test data only.',
};

function record(id: string, changes: Partial<Transaction> = {}, linkChanges: Partial<ListingTransactionLink> = {}): LinkedTransaction {
  return {
    transaction: {
      ...source, transaction_id: id, source_record_id: `DEMO-SOURCE-${id}`, property_id: 'DEMO-P1',
      record_type: 'sale', transaction_scope: 'whole_unit', transaction_date: '2025-01-01', date_basis: 'registration',
      amount: 2000000, currency: 'AED', area_name: 'Demo area', building_name: 'Demo building', unit_ref: 'Demo unit 1',
      property_type: 'apartment', bedrooms: 2, area_value: 1200, area_unit: 'sqft', area_basis: 'built_up',
      registration_segment: 'ready', evidence_excerpt: 'Synthetic whole-unit sale record for the chart test.', ...changes,
    },
    link: {
      link_id: `DEMO-LINK-${id}`, listing_id: 'DEMO-L1', transaction_id: id, relation_type: 'exact_property',
      match_basis: 'Synthetic stable unit identity.', differences: null, pricing_eligible: 'yes',
      evidence_refs: `DEMO-L1|${id}`, verification_status: 'verified', reviewed_by: 'Synthetic fixture reviewer',
      reviewed_at: '2026-09-03T12:00:00Z', data_kind: 'demo', notes: null, ...linkChanges,
    },
  };
}

test('zero records produce no history series; one sale stays a single recorded point', () => {
  assert.deepEqual(groupTransactionHistory([]), []);
  assert.deepEqual(filterTransactionHistory([]), { records: [], error: null });
  const sale = record('DEMO-T1');
  const [series] = groupTransactionHistory([sale]);
  assert.equal(series.records.length, 1);
  assert.equal(series.first_date, '2025-01-01');
  assert.equal(series.last_date, '2025-01-01');
  assert.equal(historyDatePosition(series.first_date, series.first_date, series.last_date), 0.5);
});

test('sales are counted by transaction ID, never by link ID, and chronological order leaves inputs intact', () => {
  const first = record('DEMO-T1', { transaction_date: '2020-01-01' });
  const second = record('DEMO-T2', { transaction_date: '2025-01-01' });
  const duplicateLink = { ...first, link: { ...first.link, link_id: 'DEMO-SECOND-LINK' } };
  const input = [second, first, duplicateLink];
  const result = uniqueHistoryRecords(input);
  assert.deepEqual(result.map(({ transaction }) => transaction.transaction_id), ['DEMO-T1', 'DEMO-T2']);
  assert.equal(result[0].link.link_id, first.link.link_id);
  assert.equal(groupTransactionHistory(input)[0].records.length, 2);
  assert.deepEqual(input, [second, first, duplicateLink]);
});

test('same-day sales remain distinct by transaction ID even when date and total price coincide', () => {
  const sales = [record('DEMO-T2'), record('DEMO-T1')];
  const [series] = groupTransactionHistory(sales);
  assert.deepEqual(series.records.map(({ transaction }) => transaction.transaction_id), ['DEMO-T1', 'DEMO-T2']);
  assert.equal(series.records.length, 2);
  assert.equal(historyDatePosition('2025-01-01', series.first_date, series.last_date), 0.5);
});

test('currency and contract/registration date bases create independent series without duplicate transactions', () => {
  const aed = record('DEMO-AED', { transaction_date: '2021-01-01' });
  const usd = record('DEMO-USD', { currency: 'USD', amount: 600000 });
  const contract = record('DEMO-CONTRACT', { date_basis: 'contract', transaction_date: '2024-12-05' });
  const later = record('DEMO-LATER', { transaction_date: '2026-01-01', amount: 2500000 });
  const groups = groupTransactionHistory([aed, usd, contract, later, aed]);
  assert.deepEqual(groups.map((group) => [group.key, group.records.length]), [
    ['AED:contract', 1], ['AED:registration', 2], ['USD:registration', 1],
  ]);
  assert.deepEqual(groups.map((group) => group.label), ['AED · Contract date', 'AED · Registration date', 'USD · Registration date']);
  const registrations = groups[1];
  assert.equal(registrations.first_date, '2021-01-01');
  assert.equal(registrations.last_date, '2026-01-01');
  assert.equal(groups.reduce((sum, group) => sum + group.records.length, 0), 4);
});

test('date range includes both bounds, supports empty/open bounds, and has a distinct empty result', () => {
  const rows = [record('DEMO-T1', { transaction_date: '2020-01-01' }), record('DEMO-T2', { transaction_date: '2023-06-01' }), record('DEMO-T3', { transaction_date: '2025-01-01' })];
  const ids = (range: { from?: string; to?: string }) => filterTransactionHistory(rows, range).records.map(({ transaction }) => transaction.transaction_id);
  assert.deepEqual(ids({}), ['DEMO-T1', 'DEMO-T2', 'DEMO-T3']);
  assert.deepEqual(ids({ from: '', to: '' }), ['DEMO-T1', 'DEMO-T2', 'DEMO-T3']);
  assert.deepEqual(ids({ from: '2023-06-01', to: '2025-01-01' }), ['DEMO-T2', 'DEMO-T3']);
  assert.deepEqual(ids({ from: '2023-06-01', to: '2023-06-01' }), ['DEMO-T2']);
  assert.deepEqual(ids({ to: '2023-06-01' }), ['DEMO-T1', 'DEMO-T2']);
  assert.deepEqual(ids({ from: '2025-01-01' }), ['DEMO-T3']);
  assert.deepEqual(filterTransactionHistory(rows, { from: '2030-01-01', to: '2031-01-01' }), { records: [], error: null });
});

test('invalid calendar dates and reversed ranges cannot silently produce a chart', () => {
  const rows = [record('DEMO-T1')];
  assert.deepEqual(filterTransactionHistory(rows, { from: '2026-01-01', to: '2025-01-01' }), { records: [], error: 'From must be on or before To.' });
  assert.match(filterTransactionHistory(rows, { from: '2025-02-29' }).error!, /valid calendar date/);
  assert.match(filterTransactionHistory(rows, { to: 'not a date' }).error!, /valid calendar date/);
});

test('chart dates use elapsed calendar time instead of evenly spaced transaction positions', () => {
  assert.equal(historyDatePosition('2025-01-01', '2025-01-01', '2025-01-11'), 0);
  assert.equal(historyDatePosition('2025-01-02', '2025-01-01', '2025-01-11'), 0.1);
  assert.equal(historyDatePosition('2025-01-06', '2025-01-01', '2025-01-11'), 0.5);
  assert.equal(historyDatePosition('2025-01-11', '2025-01-01', '2025-01-11'), 1);
});

test('chart input guards do not mix comparable, unresolved, non-sale or unknown price/date records into history', () => {
  const rows = [
    record('DEMO-GOOD'),
    record('DEMO-COMPARABLE', {}, { relation_type: 'comparable' }),
    record('DEMO-UNRESOLVED', {}, { relation_type: 'unresolved' }),
    record('DEMO-INELIGIBLE', {}, { pricing_eligible: 'no' }),
    record('DEMO-WRONG-LINK', {}, { transaction_id: 'DEMO-ANOTHER' }),
    record('DEMO-LEASE', { record_type: 'lease' }),
    record('DEMO-SHARE', { transaction_scope: 'partial_share' }),
    record('DEMO-NO-DATE', { transaction_date: null }),
    record('DEMO-BAD-DATE', { transaction_date: '2025-02-30' }),
    record('DEMO-DATE-BASIS', { date_basis: 'unknown' }),
    record('DEMO-NO-CURRENCY', { currency: null }),
    record('DEMO-OTHER-CURRENCY', { currency: 'other' }),
    record('DEMO-NO-AMOUNT', { amount: null }),
    record('DEMO-ZERO-AMOUNT', { amount: 0 }),
    record('DEMO-INFINITE-AMOUNT', { amount: Infinity }),
  ];
  assert.deepEqual(uniqueHistoryRecords(rows).map(({ transaction }) => transaction.transaction_id), ['DEMO-GOOD']);
});

test('history visualization consumes the existing pricing gate without admitting unverified or comparable sales', () => {
  const listing: ListingSnapshot = {
    ...source, snapshot_id: 'DEMO-S1', listing_id: 'DEMO-L1', property_id: 'DEMO-P1', title: 'Synthetic listing',
    area_name: 'Demo area', building_name: 'Demo building', unit_ref: 'Demo unit 1', property_type: 'apartment',
    bedrooms: 2, area_value: 1200, area_unit: 'sqft', area_basis: 'built_up', market_segment: 'ready', listing_status: 'active',
    asking_price: 2700000, currency: 'AED', listed_at: null, availability_date: null, amenities: null, evidence_excerpt: 'Synthetic listing.',
  };
  const good = record('DEMO-GOOD');
  const rows = [good, record('DEMO-UNREVIEWED', { verification_status: 'needs_review' }),
    record('DEMO-RESTRICTED', { usage_status: 'restricted' }),
    record('DEMO-MISSING-SOURCE', { source_ref: '' }),
    record('DEMO-WRONG-PROPERTY', { property_id: 'DEMO-P2' }),
    record('DEMO-COMPARABLE', { property_id: 'DEMO-P2' }, { relation_type: 'comparable' }),
  ];
  const dataset: Dataset = {
    listing_snapshots: [listing], transactions: rows.map(({ transaction }) => transaction),
    listing_transaction_links: [...rows.map(({ link }) => link), { ...good.link, link_id: 'DEMO-SECOND-LINK' }],
    client_requirements: [], match_reference: [],
    meta: { mode: 'demo', label: 'Synthetic chart fixture', loaded_at: source.captured_at, warnings: [], quarantined_count: 0 },
  };
  const evidence = getPriceEvidence(listing, dataset);
  assert.equal(evidence.excluded_count, 4);
  assert.equal(evidence.comparables.length, 1);
  assert.equal(evidence.history.length, 2, 'the existing pricing gate retains both reviewed links');
  assert.deepEqual(groupTransactionHistory(evidence.history)[0].records.map(({ transaction }) => transaction.transaction_id), ['DEMO-GOOD']);
});
