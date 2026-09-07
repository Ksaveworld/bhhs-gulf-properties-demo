import type { DemoProfile } from './prototype-demo';

export type ClosedCase = {
  id: string; clientId: string; name: string; closed: string; result: string;
  portrait: string; challenges: string[]; resolutions: string[]; reference: string; supplied: boolean;
  budget: string; home: string; location: string; time: string;
  shortlistSummary: string; journey: string[]; takeaways: string[];
};
export const CLOSED_CASES: ClosedCase[] = [
  {
    id: 'haddad-2024', clientId: 'PROTOTYPE-HADDAD', name: 'R. Haddad', closed: 'Closed August 2024', supplied: true,
    result: 'Frond M villa · AED 19.4m · cash · 11 weeks from first contact to transfer',
    portrait: 'AED 18–20m budget · 5BR villa · family residence · wife led the decision',
    challenges: ['The first offer was rejected; the seller held at AED 21m.', 'His wife was concerned about community security and only agreed after the second viewing.', 'A service-charge dispute during completion almost ended the deal.'],
    resolutions: ['A 30-day completion commitment secured AED 1.2m of negotiating room.', 'A meeting with the property manager addressed the security questions in person.', 'The seller covered the first year of service charges, written into an addendum.'],
    reference: 'Khalid also has a wife-led decision and an unresolved service-charge question. Reuse the option of asking the seller to cover the first year of service charges in the negotiation.',
    budget: 'AED 18–20m', home: 'Villa · 5 bedrooms', location: 'Palm Jumeirah · Frond M', time: 'Completed August 2024',
    shortlistSummary: 'Frond M villa, AED 19.4m, closed after three viewings',
    journey: ['Three viewings before closing on the Frond M villa.', 'The first offer was rejected; the seller held at AED 21m.', 'His wife agreed after the second viewing, following concerns about community security.', 'A service-charge dispute arose during completion; the seller covered the first year in an addendum.'],
    takeaways: ['Address the family decision-maker’s concerns before progressing the offer.', 'Discuss service charges explicitly and record agreed seller contributions in the contract.', 'Confirm the buyer’s ability to meet a short completion commitment before using it in negotiation.'],
  },
  {
    id: 'okonjo-2023', clientId: 'PROTOTYPE-OKONJO', name: 'S. Okonjo', closed: 'Closed 2023', supplied: false,
    result: 'Frond N villa · AED 22.1m · cash · six weeks from first contact to transfer',
    portrait: 'Relocating family · ready villa · cash purchase · off-plan ruled out',
    challenges: ['The family needed confidence that the home would be ready for their move.', 'Off-plan options could not meet the agreed relocation schedule.', 'The client wanted a complete view of recurring costs before committing.'],
    resolutions: ['Focused viewings on ready homes and checked vacant possession before progressing.', 'Agreed a completion checklist with dates and named owners for outstanding items.', 'Shared the available service-charge information before the offer discussion.'],
    reference: 'For Khalid, confirm payment and availability before offering a fast completion. Resolve the service-charge question before the family viewing so the conversation can focus on the home and the offer.',
    budget: 'Not recorded', home: 'Ready villa', location: 'Palm Jumeirah · Frond N', time: 'Completed 2023',
    shortlistSummary: 'Frond N villa, AED 22.1m, cash, six weeks end to end',
    journey: ['Ready villas were compared with off-plan options; off-plan was ruled out against the relocation schedule.', 'Viewings focused on ready homes, with vacant possession checked before progressing.', 'The available service-charge information was shared before the offer discussion.', 'The cash purchase completed in six weeks from first contact to transfer.'],
    takeaways: ['Check availability against the relocation window before arranging viewings.', 'Confirm payment and completion readiness before agreeing a fast timetable.', 'Share available recurring-cost information before discussing the offer.'],
  },
];
export function closedClientProfiles(): DemoProfile[] {
  return CLOSED_CASES.map(item => {
    const source = `case-${item.id}`;
    return { id: item.clientId, name: item.name, phone: '', fixture: false, closedCaseId: item.id, updated: item.time,
      payment: 'Cash', paymentSource: source,
      core: [['budget', 'Expected price range', item.budget], ['location', 'Preferred location', item.location], ['home', 'Home type', item.home], ['size', 'Size', 'Not recorded'], ['move', 'Move-in', item.time], ['purpose', 'Purchase purpose', 'Family residence']].map(([key, label, value]) => ({ key, label, value, sources: [source] })),
      known: [{ key: 'portrait', label: 'Recorded client portrait', value: item.portrait, sources: [source] }, { key: 'outcome', label: 'Completed purchase', value: item.result, sources: [source] }],
      sources: [{ id: source, title: 'Closed-deal client record', meta: item.closed, text: `${item.result}\n\nClient portrait\n${item.portrait}\n\nChallenges\n${item.challenges.join('\n')}\n\nResolution\n${item.resolutions.join('\n')}`, kind: 'crm', enteredBy: 'Sales adviser (demo)', channel: 'Historical CRM case', synthetic: true, original: { crm: { createdAt: '', createdBy: 'Not recorded', fields: { 'Client name': item.name, 'Closed period': item.closed, 'Transaction result': item.result, 'Client portrait': item.portrait } } } }],
    };
  });
}
