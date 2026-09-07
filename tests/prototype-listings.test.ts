import test from 'node:test';
import assert from 'node:assert/strict';
import { demoProperties } from '../shared/prototype-demo';
import { prototypeListing } from '../shared/prototype-listings';
import { propertyDisplayName } from '../shared/property-presentation';

test('each shortlist property retains its own identity, price and location without invented transaction evidence', () => {
  for (const item of demoProperties) {
    const row = prototypeListing(item.id)!;
    assert.equal(propertyDisplayName(row), item.name);
    assert.equal(row.area_name, item.address);
    assert.equal(row.asking_price, item.asking * 1_000_000);
    assert.equal(row.property_id, null);
    assert.equal(row.area_value, null);
    assert.equal(row.source_date, null);
    assert.equal(row.listing_status, 'unknown');
    assert.equal(row.data_kind, 'demo');
  }
  assert.equal(prototypeListing('DEMO-L-001'), null);
  assert.equal(prototypeListing('missing'), null);
});
