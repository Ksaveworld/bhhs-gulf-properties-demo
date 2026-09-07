import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOSED_CASES } from '../shared/prototype-cases';
import { DEMO_CLIENT_ID } from '../shared/prototype-demo';
import { closedDealReport } from '../shared/closed-deal-report';

test('both entry points use the same case record and change only the relevance section', () => {
  for (const value of CLOSED_CASES) {
    const similar = closedDealReport(value, DEMO_CLIENT_ID);
    const own = closedDealReport(value, value.clientId);
    assert.equal(own.filename, similar.filename);
    assert.deepEqual(own.sections.filter((_, i) => i !== 4), similar.sections.filter((_, i) => i !== 4));
    assert.equal(similar.sections[4].heading, 'Relevance to Current Client');
    assert.deepEqual(similar.sections[4].lines, [value.reference]);
    assert.equal(own.sections[4].heading, 'Key takeaways');
    assert.doesNotMatch(JSON.stringify(own), /Khalid/);
    assert.ok(own.sections[0].lines.includes(`Completed purchase: ${value.result}`));
    const other = CLOSED_CASES.find(c => c.id !== value.id)!;
    assert.ok(!JSON.stringify(own).includes(other.name));
    assert.equal(own.sections.length, 6);
    assert.equal(own.sections[3].lines.length, value.challenges.length * 2);
    assert.match(own.disclosure, /Fictional/);
  }
});

test('unknown fields stay absent and unrelated clients are not claimed to resemble Khalid', () => {
  const okonjo = closedDealReport(CLOSED_CASES[1], 'UNRELATED');
  assert.equal(okonjo.sections[4].heading, 'Key takeaways');
  assert.ok(!okonjo.sections[1].lines.some(line => line.startsWith('Budget:')));
  assert.equal(okonjo.filename, 'S-Okonjo-Closed-Deal-2023');
  assert.doesNotMatch(okonjo.sections[2].lines.join(' '), /\d+ viewings/);
  assert.match(okonjo.disclosure, /illustrative process narrative/);
});
