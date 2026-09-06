import test from 'node:test';
import assert from 'node:assert/strict';
import { khalidProfile, freshDemoCall, saveDemoCall } from '../shared/prototype-demo';
import { groupedSources, sourceTime } from '../shared/prototype-sources';
test('group counts reflect stored materials and entries sort newest first within each category', () => {
  const groups = groupedSources(khalidProfile().sources);
  assert.deepEqual(groups.map(g => [g.kind, g.count]), [['call', 3], ['whatsapp', 1], ['email', 2], ['photos', 4], ['note', 1], ['crm', 1]]);
  for (const group of groups) assert.deepEqual(group.entries.map(sourceTime), group.entries.map(sourceTime).sort((a, b) => b - a));
  assert.equal(groups.find(g => g.kind === 'email')!.entries[0].title, 'Re: Palm Jumeirah options');
  assert.equal(groups.find(g => g.kind === 'whatsapp')!.entries[0].original?.messages?.length, 47);
});
test('saving a reviewed call retains the original edited record and puts it first in its group', () => {
  const profile = khalidProfile();
  const updated = saveDemoCall(profile, { ...freshDemoCall(), points: 'A custom reviewed conversation.', payment: 'Mortgage', duration: 75 });
  const group = groupedSources(updated.sources).find(g => g.kind === 'call')!;
  assert.equal(group.count, 4);
  assert.equal(group.entries[0].original?.duration, '1:15');
  assert.match(group.entries[0].original!.transcript![0].text, /A custom reviewed conversation/);
  assert.match(group.entries[0].original!.transcript![0].text, /Payment: Mortgage/);
  assert.equal(group.entries[0].enteredBy, 'Sales user');
  assert.equal(profile.sources.length, 9);
});
