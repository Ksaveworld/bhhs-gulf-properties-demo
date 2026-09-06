import { createEmptyRequirement } from './assistant';
import { buildClientBrief, type ClientBrief, type ClientMaterial } from './client-brief';
import type { ClientRequirement } from './types';

export type Payment = 'unknown' | 'cash' | 'mortgage';
export interface StoryCall {
  id: string; duration: number; points: string; changes: string; commitments: string;
  payment: Payment; budget: number | null; viewingTime: string; propertyId: string; attendees: string;
}
export interface ClientStory {
  brief: ClientBrief; materials: ClientMaterial[]; baseline: ClientRequirement | null; saveTarget?: ClientRequirement | null;
  fixture: boolean; phone: string; payment: Payment; paymentSource: string;
  decision: string; decisionSource: string; call: StoryCall | null; invitationReceipt?: string;
}
export function storyRequirement(story: ClientStory): ClientRequirement {
  return { ...story.brief.draft, source_ref: story.materials.map(m => m.id).join(', ') || story.brief.draft.source_ref,
    raw_request: [story.brief.draft.raw_request,
      ...story.materials.filter(m => !story.brief.draft.raw_request.includes(m.text)).map(m => `${m.title}:\n${m.text}`),
      `Sales-reviewed phone: ${story.phone || 'not supplied'}\nPayment: ${story.payment}\nDecision makers: ${story.decision || 'not supplied'}`].join('\n\n') };
}
export async function storyFromRequirement(requirement: ClientRequirement): Promise<ClientStory> {
  const last = (pattern: RegExp) => [...requirement.raw_request.matchAll(pattern)].at(-1)?.[1] ?? '';
  const payment = last(/^Payment: (cash|mortgage|unknown)$/gm) as Payment || 'unknown';
  const decision = last(/^Decision makers: (.+)$/gm);
  return { brief: await buildClientBrief([], requirement, []), baseline: requirement, saveTarget: requirement, materials: [], fixture: false,
    phone: last(/^Sales-reviewed phone: (.+)$/gm), payment, paymentSource: payment === 'unknown' ? '' : 'baseline',
    decision, decisionSource: decision ? 'baseline' : '', call: null };
}
export const storyProperties = [
  { id: 'story-frond-n', name: 'Signature Villa, Frond N', address: 'Palm Jumeirah, Frond N', asking: 22.5,
    description: 'Ready villa · private beach · modern interiors', caution: '4 bedrooms — one short of the original 5-bedroom brief. Confirm whether a smaller home is acceptable.' },
  { id: 'story-frond-k', name: 'Garden Home, Frond K', address: 'Palm Jumeirah, Frond K', asking: 17.8,
    description: '5 bedrooms · staff accommodation · vacant now', caution: 'Dated interiors. The client raised resale concerns about Frond K.' },
  { id: 'story-hills', name: 'Sector E, Emirates Hills', address: 'Emirates Hills, Sector E', asking: 23,
    description: '6 bedrooms · large plot · ready to move in', caution: 'No beach; fallback location needs agreement.' },
];
export async function createKhalidStory(): Promise<ClientStory> {
  const baseline: ClientRequirement = { ...createEmptyRequirement(), client_id: 'STORY-C-0114', requirement_id: 'STORY-R-0114', client_alias: 'Khalid Al Mansouri',
    budget_max: 16000000, currency: 'AED', budget_constraint: 'hard', preferred_areas: ['Dubai Marina'], property_types: ['apartment'],
    bedrooms_min: 5, market_preference: 'ready', data_kind: 'demo', captured_at: '2026-01-14T09:00:00Z',
    raw_request: 'Fictional CRM #C-2026-0114, created 14 Jan. Contact Khalid Al Mansouri, phone ending 418. AED 16m ceiling, apartment, Dubai Marina. Five bedrooms; ready property.' };
  const materials: ClientMaterial[] = [
    { id: 'call-mar12', kind: 'Call transcript', title: 'Call · 12 Mar', synthetic: true,
      text: 'Khalid, number ending 418: We are relocating for the September school term. My wife has the final say on the home. Budget AED 18–22m. Please shortlist villas in Palm Jumeirah. Five bedrooms minimum. I asked about transfer fees and want a second viewing.',
      reviewedValues: { budget_min: 18000000, budget_max: 22000000, currency: 'AED', budget_constraint: 'hard', property_types: ['villa'], preferred_areas: ['Palm Jumeirah'], bedrooms_min: 5, purchase_purpose: 'self_use', move_in_by: '2026-09-01' } },
    { id: 'wa-mar12', kind: 'WhatsApp', title: 'WhatsApp · through 12 Mar', synthetic: true,
      text: 'Khalid Al Mansouri: My wife wants to see the Frond N one before we talk numbers. Ready property only. We cannot wait on a handover with the school term.', reviewedValues: { market_preference: 'ready' } },
    { id: 'photos-mar7', kind: 'Photo notes', title: 'Photo notes · 7 Mar', synthetic: true,
      text: 'Demo interpretation of four reference images: pale stone, modern minimal interiors; no heavy classical detailing. This preference still needs the client’s confirmation.', reviewedValues: { soft_preferences: 'Modern, pale, minimal interiors; avoid heavy classical detailing (image interpretation, to confirm).' } },
    { id: 'note-mar4', kind: 'Sales note', title: 'Your note · 4 Mar', synthetic: true,
      text: 'Brother handles negotiation. Do not issue the first written bid without him. Service charge history is still needed; client has concerns about Frond K resale.', reviewedValues: {} },
    { id: 'prices', kind: 'Sales note', title: 'Property & transaction examples', synthetic: true,
      text: 'All numbers are scripted examples, not verified market records. Frond N asking 22.5m (was 23.5m); 41 days listed versus an illustrative 28-day median. Three different villas sold for 20.8m (Jan, 5BR), 21.6m (Dec, 5BR), 22.4m (Nov, 6BR sea view). Subject 4BR, area 8% below their mean. Historical reference 19.6m; opening 20.2m; target 20.8m. Frond K asking 17.8m, Emirates Hills 23m. No comparable evidence for the latter two.', reviewedValues: {} },
    { id: 'cases', kind: 'Sales note', title: 'Two illustrative client cases', synthetic: true,
      text: 'Fictional case R. Haddad: relocating family, ready Frond M villa, AED 19.4m, three viewings in 2024. Fictional case S. Okonjo: relocating family, ready Frond N villa, AED 22.1m, cash, six weeks in 2023. Similarity does not establish this client’s payment method or chance of closing.', reviewedValues: {} },
  ];
  return { brief: await buildClientBrief(materials, baseline, ['Palm Jumeirah', 'Dubai Marina']), materials, baseline, fixture: true,
    phone: 'Demo number · ending 418', payment: 'unknown', paymentSource: '', decision: 'Wife decides on the home; brother handles negotiation.', decisionSource: 'call-mar12', call: null };
}
export function freshCall(): StoryCall {
  return { id: crypto.randomUUID(), duration: 0, points: 'Cash purchase. Wife and brother can view Frond N on Saturday at 11:00. Needs three years of service charge history before an offer.',
    changes: 'Payment confirmed as cash. AED 22m is a firm ceiling. Viewing time agreed; invitation still to send.', commitments: 'Send Frond N service charge history by Thursday.',
    payment: 'cash', budget: 22000000, viewingTime: 'Saturday, 11:00', propertyId: 'story-frond-n', attendees: 'Client, wife and brother' };
}
/** Apply only the explicitly reviewed structured values; editable prose is kept as evidence. */
export function applyStoryCall(story: ClientStory, call: StoryCall): ClientStory {
  const sourceId = `outbound-${call.id}`;
  const source: ClientMaterial = { id: sourceId, kind: 'Call transcript', title: 'Outbound call · just now', synthetic: true,
    text: [call.points, call.changes, call.commitments, `Reviewed payment: ${call.payment}; budget ceiling: ${call.budget ?? 'unknown'}; viewing: ${call.viewingTime}; property: ${storyProperties.find(p => p.id === call.propertyId)?.name ?? 'unselected'}; attendees: ${call.attendees}`].join('\n'),
    reviewedValues: { budget_max: call.budget, currency: 'AED' } };
  return { ...story, invitationReceipt: undefined, call, payment: call.payment, paymentSource: sourceId, materials: [source, ...story.materials.filter(m => m.id !== sourceId)],
    brief: { ...story.brief, draft: { ...story.brief.draft, budget_max: call.budget }, facts: story.brief.facts.map(f => f.id !== 'budget' ? f : {
      ...f, evidence: [...f.evidence, { sourceId, label: source.title, values: { budget_min: story.brief.draft.budget_min, budget_max: call.budget, currency: 'AED', budget_constraint: story.brief.draft.budget_constraint }, display: `AED ${call.budget?.toLocaleString('en-US') ?? 'unconfirmed'}` }], selected: f.evidence.length,
    }) } };
}
