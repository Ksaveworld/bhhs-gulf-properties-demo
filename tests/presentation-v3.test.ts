import assert from 'node:assert/strict';
import test from 'node:test';
import { clientDisplayName, propertyDisplayName } from '../shared/property-presentation';

test('display cleanup only strips the prefix of known synthetic names without mutating originals', () => {
  const source = { building_name: 'Demo Marina Vista', title: 'Demo apartment', area_name: 'Dubai Marina', data_kind: 'demo' as const };
  assert.equal(propertyDisplayName(source), 'Marina Vista');
  assert.equal(source.building_name, 'Demo Marina Vista');
  assert.equal(propertyDisplayName({ ...source, data_kind: 'real_public' }), 'Demo Marina Vista');
  assert.equal(clientDisplayName({ client_alias: 'Demo — Client A', data_kind: 'demo' }), 'Client A');
  assert.equal(clientDisplayName({ client_alias: 'Demographics Research', data_kind: 'demo' }), 'Demographics Research');
  assert.equal(clientDisplayName({ client_alias: 'Demo Holdings', data_kind: 'real_authorized' }), 'Demo Holdings');
});
