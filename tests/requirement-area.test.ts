import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRequirementArea } from '../shared/requirement-area';

test('v1 missing field can use one explicit legacy basis without mutating source text', () => {
  const legacy = { hard_constraints: 'must have parking; area basis: internal' };
  const before = structuredClone(legacy);
  assert.deepEqual(resolveRequirementArea(legacy), {
    basis: 'internal', selected_basis: 'internal', legacy_bases: ['internal'],
    status: 'known', source: 'legacy', messages: [],
  });
  assert.deepEqual(legacy, before);
});

test('new known field takes precedence over missing, agreeing or unknown old text', () => {
  for (const hard_constraints of [null, 'area basis: built_up', 'area basis: unknown']) {
    const result = resolveRequirementArea({ area_basis: 'built_up', hard_constraints });
    assert.equal(result.basis, 'built_up');
    assert.equal(result.source, 'field');
    assert.equal(result.status, 'known');
  }
});

test('empty and explicit unknown stay unconfirmed; an explicit unknown does not inherit old knowledge', () => {
  assert.equal(resolveRequirementArea({ hard_constraints: '至少1200 sqft' }).status, 'missing');
  const result = resolveRequirementArea({ area_basis: 'unknown', hard_constraints: 'area basis: built_up' });
  assert.equal(result.basis, 'unknown');
  assert.equal(result.status, 'unknown');
  assert.match(result.messages[0], /Area basis needs confirmation/);
});

test('conflicting field and legacy statements preserve the preferred field but block confirmed comparison', () => {
  const result = resolveRequirementArea({ area_basis: 'internal', hard_constraints: 'area basis: built_up' });
  assert.equal(result.selected_basis, 'internal');
  assert.equal(result.basis, 'unknown');
  assert.equal(result.status, 'conflict');
  assert.match(result.messages[0], /internal.*built_up/);
});

test('multiple different legacy statements conflict while identical repetitions do not', () => {
  assert.equal(resolveRequirementArea({ hard_constraints: 'area basis: gross; area basis: land' }).status, 'conflict');
  assert.equal(resolveRequirementArea({ hard_constraints: 'area basis: gross; AREA BASIS: GROSS' }).basis, 'gross');
});
