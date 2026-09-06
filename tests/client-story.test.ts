import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyStoryCall, createKhalidStory, freshCall, storyRequirement, storyFromRequirement } from '../shared/client-story';
import { factHasChange, selectBriefEvidence } from '../shared/client-brief';

test('story exposes real prototype conflicts including location and keeps CRM immutable', async () => {
  const story = await createKhalidStory();
  assert.deepEqual(story.brief.facts.filter(factHasChange).map(f => f.id), ['budget', 'location', 'home']);
  const retained = selectBriefEvidence(story.brief, 'budget', 0);
  assert.equal(retained.draft.budget_max, 16000000);
  assert.equal(story.baseline?.budget_max, 16000000);
  assert.equal(story.brief.draft.budget_max, 22000000);
});
test('call applies reviewed payment and ceiling, preserves transcript edits and is idempotent for source id', async () => {
  const story = await createKhalidStory();
  const call = { ...freshCall(), payment: 'unknown' as const, budget: 21000000, commitments: 'Ask again on Monday.', viewingTime: 'Sunday 14:00' };
  const next = applyStoryCall({ ...story, invitationReceipt: 'Earlier invitation sent' }, call);
  assert.equal(next.invitationReceipt, undefined);
  assert.equal(next.payment, 'unknown');
  assert.equal(next.brief.draft.budget_max, 21000000);
  assert.equal(next.call?.viewingTime, 'Sunday 14:00');
  assert.match(next.materials[0].text, /Ask again on Monday/);
  assert.equal(story.payment, 'unknown');
  assert.equal(story.materials.length, 6);
  assert.equal(applyStoryCall(next, call).materials.length, next.materials.length);
});
test('reviewed phone, payment and decision makers survive saving without losing original evidence', async () => {
  const original = await createKhalidStory();
  const next = { ...original, materials: [...original.materials, { id: 'old-edit', kind: 'Sales note' as const, title: 'Earlier edit', text: 'Decision makers: Previous decision maker\nPayment: cash', synthetic: true }], phone: '555-0148', payment: 'mortgage' as const, decision: 'Buyer and spouse' };
  const stored = storyRequirement(next);
  const loaded = await storyFromRequirement(stored);
  assert.equal(loaded.phone, '555-0148');
  assert.equal(loaded.payment, 'mortgage');
  assert.equal(loaded.decision, 'Buyer and spouse');
  assert.match(stored.raw_request, /AED 16m ceiling/);
});
