import type { ClosedCase } from './prototype-cases';
import { DEMO_CLIENT_ID } from './prototype-demo';
import type { SalesReport } from './sales-report';

/** One content model for the drawer and both downloads. Only the supplied Khalid relationship is asserted. */
export function closedDealReport(value: ClosedCase, currentClientId: string): SalesReport {
  const compare = currentClientId === DEMO_CLIENT_ID;
  return {
    title: `${value.name} — Closed Deal`, subtitle: 'Historical closed-deal brief',
    disclosure: value.supplied
      ? 'Fictional closed-client example. Demo case supplied in the second-round plan.'
      : 'Fictional closed-client example. Supplied sale outcome with the existing illustrative process narrative.',
    filename: `${value.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/-$/, '')}-Closed-Deal-${value.closed.replace(/^Closed /, '').replaceAll(' ', '-')}`,
    sections: [
      { heading: 'Deal Overview', lines: [`Client: ${value.name}`, `Status / period: ${value.closed}`, `Completed purchase: ${value.result}`, `Location: ${value.location}`, `Property type: ${value.home}`] },
      { heading: 'Client Profile at the Time', lines: [value.portrait, ...(value.budget === 'Not recorded' || value.portrait.includes(value.budget) ? [] : [`Budget: ${value.budget}`]), `Focus location: ${value.location}`, `Home preference: ${value.home}`] },
      { heading: 'Viewing and Decision Journey', lines: value.journey },
      { heading: 'Challenges and Resolution', lines: value.challenges.flatMap((challenge, i) => [`Challenge: ${challenge}`, `Resolution: ${value.resolutions[i]}`]) },
      { heading: compare ? 'Relevance to Current Client' : 'Key takeaways', lines: compare ? [value.reference] : value.takeaways },
      { heading: 'Sources and Record Summary', lines: [
        value.supplied ? 'Existing demo case: second-round plan and historical client record.' : 'Existing demo case: first-round sale outcome and second-round illustrative process narrative.',
        `Recorded outcome: ${value.shortlistSummary}`,
        'No original historical email, WhatsApp or call material is attached to this case.',
      ] },
    ],
  };
}
