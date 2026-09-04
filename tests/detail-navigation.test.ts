import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWorkspaceRoute, workspaceRouteHash, pushDetail, popDetail } from '../shared/detail-navigation';

test('nested property / client views round-trip reserved identifiers without changing the background page', () => {
  const base = parseWorkspaceRoute('#/properties');
  const first = pushDetail(base, { kind: 'listing', id: 'L:1&中文' });
  const second = pushDetail(first, { kind: 'client', id: 'C/2' });
  const third = pushDetail(second, { kind: 'listing', id: 'L-3' });
  assert.deepEqual(parseWorkspaceRoute(workspaceRouteHash(third)), third);
  assert.deepEqual(popDetail(third), second);
  assert.deepEqual(popDetail(second), first);
  assert.deepEqual(popDetail(first), base);
  assert.deepEqual(popDetail(base), base);
  assert.deepEqual(pushDetail(first, { kind: 'listing', id: 'L:1&中文' }), first);
});

test('old direct links preserve object order and invalid detail kinds are ignored', () => {
  assert.deepEqual(parseWorkspaceRoute('#/reports?client=C-1&listing=L-1'), {
    page: 'properties', details: [{ kind: 'client', id: 'C-1' }, { kind: 'listing', id: 'L-1' }],
  });
  assert.deepEqual(parseWorkspaceRoute('#/clients?detail=listing%3AL-1&detail=script%3Ax&detail=client%3A'), {
    page: 'clients', details: [{ kind: 'listing', id: 'L-1' }],
  });
});
