import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClientBrief, exampleClientMaterials, factHasChange, selectBriefEvidence, recordBriefReview } from '../shared/client-brief';

test('separate materials preserve conflicting budgets and allow either source without changing raw evidence', async () => {
  const brief = await buildClientBrief(exampleClientMaterials(), null, ['Dubai Marina']);
  assert.equal(brief.draft.budget_max, 2500000);
  assert.equal(brief.draft.budget_constraint, 'hard');
  assert.equal(brief.draft.client_alias, 'Alex Morgan');
  const budget = brief.facts.find(fact => fact.id === 'budget')!;
  assert.ok(factHasChange(budget));
  assert.equal(budget.evidence.length, 2);
  const previous = selectBriefEvidence(brief, 'budget', 0);
  assert.equal(previous.draft.budget_max, 2800000);
  assert.equal(previous.draft.raw_request, brief.draft.raw_request);
  assert.equal(brief.draft.budget_max, 2500000);
});

test('explicit client linkage preserves missing fields and incoming unconfirmed currency is not inherited', async () => {
  const baseline = (await buildClientBrief(exampleClientMaterials().slice(0, 1), null, ['Dubai Marina'])).draft;
  const brief = await buildClientBrief([{ id: 'new', kind: 'Sales note', title: 'New note', text: 'Budget 2200000. Call back later.', synthetic: false }], baseline, ['Dubai Marina']);
  assert.equal(brief.draft.client_alias, baseline.client_alias);
  assert.deepEqual(brief.draft.preferred_areas, ['Dubai Marina']);
  assert.equal(brief.draft.budget_max, 2200000);
  assert.equal(brief.draft.currency, null);
  assert.equal(brief.draft.purchase_by, null);
  assert.match(brief.draft.raw_request, /Current client record/);
  assert.equal(brief.facts.find(fact => fact.id === 'location')!.evidence[0].sourceId, 'baseline');
});

test('reviewed names and cleared fields survive later feedback while untouched fields retain their sources', async () => {
  const materials = exampleClientMaterials();
  const initial = await buildClientBrief(materials, null, ['Dubai Marina']);
  const review = recordBriefReview(initial, { ...initial.draft, client_alias: 'Reviewed alias', purchase_purpose: 'unknown' });
  assert.ok(review.material);
  const next = await buildClientBrief([...materials, review.material!, { id: 'feedback', kind: 'Sales note', title: 'Later note', synthetic: true, text: 'Budget cap AED 2.3m.' }], null, ['Dubai Marina']);
  assert.equal(next.draft.client_alias, 'Reviewed alias');
  assert.equal(next.draft.purchase_purpose, 'unknown');
  assert.equal(next.draft.budget_max, 2300000);
  assert.equal(next.facts.find(fact => fact.id === 'name')!.evidence.at(-1)!.label, 'Sales review');
});
