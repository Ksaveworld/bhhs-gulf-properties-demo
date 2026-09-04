import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Dataset } from '../shared/types';
import { clientSalesReport, propertySalesReport } from '../shared/sales-report';
import { getPriceEvidence } from '../shared/pricing';
import { buildClientGroups } from '../shared/client-priorities';
import { currentClientRequirements } from '../shared/client-requirement-history';
import { evaluateMatch } from '../shared/matching';
import type { ViewingRecord } from '../shared/viewing-records';
const data=JSON.parse(readFileSync(new URL('../data/demo/dataset.json',import.meta.url),'utf8')) as Dataset;
test('client viewing history retains non-AED properties independently of the recommendation scope', () => {
  const original = data.client_requirements[0];
  const viewed = data.listing_snapshots.find(row => row.currency === 'USD')!;
  const record: ViewingRecord = {
    record_id: 'USD-VIEWING', client_id: original.client_id, listing_id: viewed.listing_id,
    sales_id: 'QA', viewed_at: '2026-09-03T09:00:00.000Z', feedback: 'Original USD viewing retained.',
    feedback_signal: 'mixed', preference_tags: [], source_kind: 'sales_entered', source_ref: 'browser:qa',
    data_kind: 'demo', created_at: '2026-09-03T09:00:00.000Z',
  };
  const aed = data.listing_snapshots.filter(row => row.currency === 'AED');
  const report = clientSalesReport(original.client_id, [original], [original], [], aed, [record], 'Company', undefined, data.listing_snapshots);
  assert.ok(report.sections.find(s => s.heading === 'Viewing History')!.lines[0].includes(viewed.building_name || viewed.title));
  assert.ok(!report.sections.filter(s => ['Best Matches', 'Worth Considering'].includes(s.heading)).flatMap(s => s.lines).join('\n').includes(viewed.building_name || viewed.title));
  assert.doesNotThrow(() => clientSalesReport(original.client_id, [original], [original], [], aed, [record], 'Company'));
});
test('property brief uses eligible own history before comparables, with original values and no excluded clients',()=>{
  const l=data.listing_snapshots[0],r=propertySalesReport(l,data,data.client_requirements),e=getPriceEvidence(l,data);
  assert.match(r.disclosure,/DEMONSTRATION/);
  assert.equal(r.sections[1].heading,'Property Transaction History');assert.equal(r.sections[2].heading,'Comparable Property Transactions');
  assert.equal(r.sections[1].charts?.flatMap(c=>c.points).length,e.history.length);
  for(const {transaction:t} of e.comparables)assert.ok(r.sections[2].lines.some(s=>s.includes(t.source_ref)&&s.includes(String(t.transaction_date))));
  const potential=r.sections.slice(3).flatMap(s=>s.lines).join('\n');
  for(const g of buildClientGroups(l,data.client_requirements))assert.equal(potential.includes(g.client_alias),g.status!=='excluded');
  assert.ok(!JSON.stringify(r).includes('Hard Conflict'));
});
test('client report uses the explicit current revision and preserves original history',()=>{
  const original=data.client_requirements[0],changed={...original,requirement_id:'SESSION-R-REPORT',budget_max:1};
  const copy={requirement:changed,original_requirement_id:original.requirement_id,parent_requirement_id:original.requirement_id,saved_at:'2026-09-04T10:00:00.000Z',edit_kind:'revision' as const};
  const current=currentClientRequirements([original],[copy]);
  const report=clientSalesReport(original.client_id,current,[original],[copy],data.listing_snapshots,[],'Company');
  assert.ok(report.sections.some(s=>s.heading==='Requirement changes'&&s.lines.some(l=>l.includes('Maximum budget'))));
  const names=report.sections.filter(s=>['Best Matches','Worth Considering'].includes(s.heading)).flatMap(s=>s.lines).join('\n');
  for(const l of data.listing_snapshots.filter(l=>evaluateMatch(l,changed).status==='excluded'))assert.ok(!names.includes(l.building_name||l.title));
  assert.equal(original.budget_max,data.client_requirements[0].budget_max);
  assert.throws(()=>clientSalesReport('NOT-VISIBLE',current,[original],[copy],[],[],'Private'),/not available/);
});
