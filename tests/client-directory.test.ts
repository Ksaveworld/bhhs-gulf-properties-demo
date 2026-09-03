import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyRequirement } from '../shared/assistant';
import {
  CLIENT_VISIBILITY_LABELS, EMPTY_CLIENT_DIRECTORY_FILTERS, clientDirectoryBudgetError,
  filterClientDirectory, hasClientDirectoryFilters,
  type ClientDirectoryFilters, type ClientVisibility,
} from '../shared/client-directory';
import type { ClientRequirement } from '../shared/types';

function requirement(id: string, changes: Partial<ClientRequirement> = {}): ClientRequirement {
  return {
    ...createEmptyRequirement('Fictional directory test request.'),
    requirement_id: id, client_id: 'TEST-C1', client_alias: 'Synthetic Avery',
    budget_min: 2_000_000, budget_max: 3_000_000, currency: 'AED', preferred_areas: ['Dubai Marina'],
    captured_at: '2026-09-03T00:00:00Z', source_name: 'Synthetic test fixture', source_ref: `DEMO-${id}`,
    notes: 'Fictional test data only.', ...changes,
  };
}
const company = () => 'company' as const;
const filters = (changes: Partial<ClientDirectoryFilters> = {}): ClientDirectoryFilters => ({ ...EMPTY_CLIENT_DIRECTORY_FILTERS, ...changes });
const ids = (requirements: ClientRequirement[], changes: Partial<ClientDirectoryFilters> = {}, visibility: (id: string) => ClientVisibility = company) =>
  filterClientDirectory(requirements, filters(changes), visibility).flatMap(group => group.requirements.map(row => row.requirement_id));

test('directory deduplicates clients in supplied order while retaining independent original requirement objects', () => {
  const first = requirement('R1', { client_id: 'C-Z', client_alias: 'Synthetic Zoe' });
  const second = requirement('R2', { client_id: 'C-A', client_alias: 'Synthetic Avery' });
  const third = requirement('R3', { client_id: 'C-Z', client_alias: 'Synthetic Zoe', budget_max: 9_000_000 });
  const original = structuredClone([first, second, third]);
  const groups = filterClientDirectory([first, second, third], filters(), company);
  assert.deepEqual(groups.map(group => [group.client_id, group.total_requirements]), [['C-Z', 2], ['C-A', 1]]);
  assert.deepEqual(groups[0].requirements.map(row => row.requirement_id), ['R1', 'R3']);
  assert.equal(groups[0].requirements[0], first);
  assert.equal(groups[0].requirements[1], third);
  assert.deepEqual([first, second, third], original);
});

test('budget and preferred location must coexist on one requirement; client grouping cannot combine them', () => {
  const rows = [
    requirement('MARINA-LOW', { budget_min: 1_000_000, budget_max: 1_500_000 }),
    requirement('DOWNTOWN-HIGH', { budget_min: 4_000_000, budget_max: 5_000_000, preferred_areas: ['Downtown Dubai'] }),
  ];
  assert.deepEqual(ids(rows, { preferred_location: 'Marina', budget_min: 4_000_000 }), []);
  assert.deepEqual(ids(rows, { preferred_location: 'Downtown', budget_max: 1_500_000 }), []);
  const groups = filterClientDirectory(rows, filters({ preferred_location: 'marina', budget_max: 1_500_000 }), company);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].total_requirements, 2);
  assert.deepEqual(groups[0].requirements.map(row => row.requirement_id), ['MARINA-LOW']);
});

test('name and preferred location respond independently to current case-insensitive partial text filters', () => {
  const rows = [
    requirement('AVERY'),
    requirement('BLAKE', { client_id: 'C2', client_alias: 'Synthetic Blake', preferred_areas: ['Business Bay', 'Downtown Dubai'] }),
    requirement('NO-LOCATION', { client_id: 'C3', client_alias: 'Synthetic Casey', preferred_areas: null }),
  ];
  assert.deepEqual(ids(rows, { name: '  aVeRy  ' }), ['AVERY']);
  assert.deepEqual(ids(rows, { name: 'blake', preferred_location: '  DOWNtown  ' }), ['BLAKE']);
  assert.deepEqual(ids(rows, { name: 'avery', preferred_location: 'Downtown' }), []);
  assert.deepEqual(ids(rows, { preferred_location: 'business   bay' }), ['BLAKE']);
  assert.deepEqual(ids(rows, { name: 'casey', preferred_location: 'Marina' }), []);
  assert.deepEqual(ids(rows), ['AVERY', 'BLAKE', 'NO-LOCATION']);
  assert.equal(hasClientDirectoryFilters(filters({ name: ' ', preferred_location: '  ' })), false);
});

test('AED budget ranges overlap inclusively rather than requiring containment or silently converting currencies', () => {
  const rows = [
    requirement('LOW', { budget_min: 1_000_000, budget_max: 2_000_000 }),
    requirement('MIDDLE'),
    requirement('HIGH', { budget_min: 3_000_000, budget_max: 4_000_000 }),
    requirement('USD', { currency: 'USD' }),
  ];
  assert.deepEqual(ids(rows, { budget_min: 2_000_000, budget_max: 3_000_000 }), ['LOW', 'MIDDLE', 'HIGH']);
  assert.deepEqual(ids(rows, { budget_min: 2_100_000, budget_max: 2_900_000 }), ['MIDDLE']);
  assert.deepEqual(ids(rows, { budget_min: 4_000_001 }), []);
  assert.deepEqual(ids(rows, { budget_max: 999_999 }), []);
  assert.deepEqual(ids(rows), ['LOW', 'MIDDLE', 'HIGH', 'USD']);
});

test('unknown budgets fail active budget filters while explicitly one-sided budgets retain their supplied limits', () => {
  const rows = [
    requirement('UNKNOWN', { budget_min: null, budget_max: null }),
    requirement('NO-CURRENCY', { currency: null }),
    requirement('MAX-ONLY', { budget_min: null, budget_max: 2_000_000 }),
    requirement('MIN-ONLY', { budget_min: 3_000_000, budget_max: null }),
    requirement('ZERO', { budget_min: 0, budget_max: 0 }),
  ];
  assert.deepEqual(ids(rows, { budget_min: 2_000_000, budget_max: 3_000_000 }), ['MAX-ONLY', 'MIN-ONLY']);
  assert.deepEqual(ids(rows, { budget_min: 2_000_001, budget_max: 2_999_999 }), []);
  assert.deepEqual(ids(rows, { budget_max: 0 }), ['MAX-ONLY', 'ZERO']);
  assert.deepEqual(ids(rows), ['UNKNOWN', 'NO-CURRENCY', 'MAX-ONLY', 'MIN-ONLY', 'ZERO']);
  assert.equal(hasClientDirectoryFilters(filters({ budget_max: 0 })), true);
});

test('inverted or invalid filter ranges report correction and cannot expand results; invalid source budgets stay unconfirmed', () => {
  const rows = [requirement('VALID'), requirement('INVERTED', { budget_min: 5_000_000, budget_max: 1_000_000 }), requirement('INVALID', { budget_max: NaN })];
  assert.match(clientDirectoryBudgetError(filters({ budget_min: 3, budget_max: 2 }))!, /Min\. budget cannot be greater/);
  assert.deepEqual(ids(rows, { budget_min: 3, budget_max: 2 }), []);
  assert.match(clientDirectoryBudgetError(filters({ budget_min: -1 }))!, /zero or greater/);
  assert.deepEqual(ids(rows, { budget_max: Infinity }), []);
  assert.equal(clientDirectoryBudgetError(filters({ budget_min: 2, budget_max: 2 })), null);
  assert.deepEqual(ids(rows, { budget_min: 2_000_000 }), ['VALID']);
});

test('company, private and unassigned visibility filters apply per requirement before grouping and before other conditions', () => {
  const rows = [
    requirement('COMPANY', { preferred_areas: ['Dubai Marina'] }),
    requirement('PRIVATE', { preferred_areas: ['Downtown Dubai'] }),
    requirement('LEGACY', { preferred_areas: ['Business Bay'] }),
  ];
  const visibility = (id: string): ClientVisibility => id === 'COMPANY' ? 'company' : id === 'PRIVATE' ? 'private' : 'legacy';
  assert.deepEqual(ids(rows, { visibility: 'company' }, visibility), ['COMPANY']);
  assert.deepEqual(ids(rows, { visibility: 'private' }, visibility), ['PRIVATE']);
  assert.deepEqual(ids(rows, { visibility: 'legacy' }, visibility), ['LEGACY']);
  assert.deepEqual(ids(rows, { visibility: 'private', preferred_location: 'Marina' }, visibility), []);
  assert.deepEqual(ids(rows, { visibility: 'all' }, visibility), ['COMPANY', 'PRIVATE', 'LEGACY']);
  assert.equal(CLIENT_VISIBILITY_LABELS.legacy, 'Unassigned browser review');
  assert.equal(filterClientDirectory(rows, filters(), visibility).length, 1);
});
