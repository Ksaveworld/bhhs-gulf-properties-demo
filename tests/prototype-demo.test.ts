import assert from 'node:assert/strict';
import test from 'node:test';
import { demoRequirement, freshDemoCall, khalidProfile, profileFromRequirement, requirementWithProfile, saveDemoCall } from '../shared/prototype-demo';

test('call changes stay drafts until save and saved edits, source and booking fields agree', () => {
  const before = khalidProfile();
  const call = { ...freshDemoCall(), payment: 'Mortgage, approval pending', ceiling: 'AED 21m', time: 'Sunday 10:00', property: 'frond-k', commitments: 'Send floor plan on Friday.' };
  assert.equal(before.payment, '');
  assert.equal(before.sources.length, 7);
  const after = saveDemoCall(before, call);
  assert.equal(after.payment, call.payment);
  assert.equal(after.core.find(f => f.key === 'budget')?.value, 'Up to AED 21m');
  assert.equal(after.call?.time, call.time);
  assert.match(after.sources[0].text, /Mortgage, approval pending/);
  assert.match(after.sources[0].text, /Garden Home, Frond K/);
  assert.match(after.sources[0].text, /Send floor plan on Friday/);
  assert.equal(before.sources.length, 7);
});

test('repeated saves retain previous calls and a cleared payment remains unknown', () => {
  const first = saveDemoCall(khalidProfile(), freshDemoCall());
  const second = saveDemoCall(first, { ...freshDemoCall(), payment: '' });
  assert.equal(second.sources.length, 9);
  assert.equal(second.paymentSource, '');
  assert.equal(second.payment, '');
  assert.equal(second.sources[1].id, first.sources[0].id);
});

test('regular records never inherit Khalid facts and simple edits change matching inputs only where edited', () => {
  const req = { ...demoRequirement(khalidProfile()), client_id: 'OTHER', client_alias: 'Other buyer', preferred_areas: ['Dubai Marina'], budget_max: 2500000 };
  const profile = profileFromRequirement(req);
  assert.equal(profile.fixture, false);
  assert.equal(profile.sources.length, 1);
  assert.equal(profile.known.some(f => /wife|brother/i.test(f.value)), false);
  assert.deepEqual(requirementWithProfile(req, profile), req);
  profile.core.find(f => f.key === 'budget')!.value = 'AED 1.8–2.2m';
  const revised = requirementWithProfile(req, profile);
  assert.equal(revised.budget_min, 1800000);
  assert.equal(revised.budget_max, 2200000);
  assert.deepEqual(revised.preferred_areas, ['Dubai Marina']);
  assert.equal(req.budget_max, 2500000);
});
