import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateDataset} from '../apps/api/ingest.mjs';
const data=JSON.parse(readFileSync(new URL('../data/demo/dataset.json',import.meta.url),'utf8'));
test('v1 inputs without maximum remain readable and v1.2 upper bound is normalized',()=>{
  assert.equal(validateDataset(data).meta.quarantined_count,0);
  const next=structuredClone(data); Object.assign(next.client_requirements[0],{area_min:100,area_max:120,area_unit:'sqm',area_basis:'built_up'});
  assert.equal(validateDataset(next).client_requirements[0].area_max,120);
});
test('invalid area ceilings and missing units are withheld',()=>{
  for(const change of [{area_max:-1},{area_min:100,area_max:90},{area_min:null,area_max:120,area_unit:null}]){
    const next=structuredClone(data);Object.assign(next.client_requirements[0],change);
    assert.ok(!validateDataset(next).client_requirements.some(r=>r.requirement_id===next.client_requirements[0].requirement_id));
  }
});
