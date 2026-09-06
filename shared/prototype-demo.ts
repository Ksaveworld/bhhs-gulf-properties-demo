import { createEmptyRequirement } from './assistant';
import type { ClientRequirement } from './types';

export type DemoField = { key: string; label: string; value: string; sources: string[] };
export type DemoSource = { id: string; title: string; meta: string; text: string };
export type DemoCall = { id: string; points: string; payment: string; ceiling: string; time: string; property: string; attendees: string; commitments: string; duration: number };
export type DemoProfile = { id: string; name: string; phone: string; fixture: boolean; core: DemoField[]; known: DemoField[]; sources: DemoSource[]; payment: string; paymentSource: string; call?: DemoCall; receipt?: string; updated: string };
export const DEMO_CLIENT_ID = 'PROTOTYPE-KHALID';
export const demoProperties = [
  { id: 'frond-n', name: 'Signature Villa, Frond N', address: 'Palm Jumeirah, Frond N', asking: 22.5, fit: 92, description: 'Ready, private beach, renovated in 2023 in the style from the photos he sent.', gap: 'Four bedrooms — one short of his brief.' },
  { id: 'frond-k', name: 'Garden Home, Frond K', address: 'Palm Jumeirah, Frond K', asking: 17.8, fit: 86, description: 'Under budget, five bedrooms with staff accommodation, vacant now.', gap: "Dated interiors, and he’s wary of Frond K resale." },
  { id: 'sector-e', name: 'Sector E, Emirates Hills', address: 'Emirates Hills, Sector E', asking: 23, fit: 79, description: 'Six bedrooms, the largest plot, closest to the school he named.', gap: "No beach, and he’s only lukewarm on Emirates Hills." },
];
const field = (key: string, label: string, value: string, ...sources: string[]): DemoField => ({ key, label, value, sources });
export function khalidProfile(): DemoProfile {
  return {
    id: DEMO_CLIENT_ID, name: 'Khalid Al Mansouri', phone: '+971 50 •• •• 418', fixture: true, payment: '', paymentSource: '', updated: '12 Mar',
    core: [field('budget', 'Expected price range', 'AED 18–22m', '1'), field('location', 'Preferred location', 'Palm Jumeirah · Fronds K to N', '3', '4'), field('home', 'Home type', 'Villa · 5+ bedrooms', '4'), field('size', 'Size', 'Not stated — to confirm'), field('move', 'Move-in', 'Before the September school term', '1', '3'), field('purpose', 'Purchase purpose', 'Family residence', '1')],
    known: [field('budget-note', 'Budget', 'AED 18–22m, and up to 24m for direct waterfront', '1'), field('where', 'Where', 'Palm Jumeirah, Fronds K to N. Emirates Hills as a fallback', '3', '4'), field('what', 'What', 'Five bedrooms or more, private pool, staff accommodation, four parking', '4'), field('must', 'Non-negotiable', 'Ready property only — nothing off-plan', '2'), field('soft', 'Never said out loud', 'Modern, pale, minimal interiors. Cool on anything heavily classical', '5'), field('why', 'Why and when', 'Family relocation. Wants to be in before the September school term', '1', '3'), field('decides', 'Who decides', 'His wife has the final say on the house. His brother handles the price', '1', '6'), field('signals', 'Buying signals', 'Asked about transfer fees twice, and asked for a second viewing unprompted', '1'), field('holds', 'Holding him back', 'Service charges, and resale liquidity on Frond K', '2')],
    sources: [
      { id: '1', title: 'Call recording', meta: '12 Mar · 8:42', text: '“Our budget is 18 to 22 million. If it’s on the water I could stretch to 24. Not for a Frond K villa. We’re moving as a family before the September school term. My wife has the final say. What are the transfer fees again? Can we see it a second time?”' },
      { id: '2', title: 'Call recording', meta: '4 Mar · 5:16', text: '“Ready property only. We can’t wait on a handover with the school term. Please check the service charges. I’m worried about resale on Frond K.”' },
      { id: '3', title: 'WhatsApp thread', meta: '47 messages · to 12 Mar', text: '“Palm Jumeirah, Fronds K to N. My wife wants to see the Frond N one before we talk numbers. We need to move before school starts in September.”' },
      { id: '4', title: 'Email · Palm Jumeirah', meta: '2 messages · 6 Mar', text: '“A villa on Palm Jumeirah. Five bedrooms minimum, private pool, staff accommodation and four parking spaces. Emirates Hills is a fallback.”' },
      { id: '5', title: 'Photos from client', meta: '4 images · 7 Mar', text: 'Image observations: pale stone, modern minimal interiors, open kitchen, no heavy classical detailing. Inferred preference, to confirm with the client.' },
      { id: '6', title: 'Your note', meta: '4 Mar', text: 'Brother handles price. Do not put the first offer in writing without him.' },
      { id: '7', title: 'CRM record', meta: '#C-2026-0114 · Created 14 Jan', text: 'Original brief: 4BR apartment, AED 16m ceiling, Dubai Marina. Phone ends 418; WhatsApp contact: Khalid Al Mansouri. Later area of interest: Palm Jumeirah. Retained preference: ready property only.' },
    ],
  };
}
export function profileFromRequirement(req: ClientRequirement): DemoProfile {
  const amount = (n: number | null | undefined) => n == null ? 'Not stated' : n.toLocaleString('en-US');
  return { id: req.client_id, name: req.client_alias || req.client_id, phone: '', fixture: false, payment: '', paymentSource: '', updated: req.captured_at.slice(0, 10),
    core: [field('budget', 'Expected price range', `${req.currency || ''} ${amount(req.budget_min)} – ${amount(req.budget_max)}`, 'record'), field('location', 'Preferred location', req.preferred_areas?.join(', ') || 'To confirm', 'record'), field('home', 'Home type', `${req.property_types?.join(', ') || 'To confirm'} · ${req.bedrooms_min ?? '?'}+ bedrooms`, 'record'), field('size', 'Size', `${amount(req.area_min)} – ${amount(req.area_max)} ${req.area_unit || ''}`, 'record'), field('move', 'Move-in', req.move_in_by || 'To confirm', 'record'), field('purpose', 'Purchase purpose', req.purchase_purpose.replaceAll('_', ' '), 'record')],
    known: [field('must', 'Non-negotiable', req.hard_constraints || 'To confirm', 'record'), field('soft', 'Preferences', req.soft_preferences || 'To confirm', 'record'), field('signals', 'Buying signals', req.intent_evidence || 'To confirm', 'record')],
    sources: [{ id: 'record', title: req.source_name || 'Current client record', meta: req.source_date || req.captured_at.slice(0, 10), text: req.raw_request || 'No source text supplied.' }],
  };
}
export function demoRequirement(profile: DemoProfile): ClientRequirement {
  const get = (key: string) => profile.core.find(f => f.key === key)?.value || '';
  const numbers = get('budget').replaceAll(',', '').match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  const multiplier = /m\b/i.test(get('budget')) ? 1e6 : 1;
  return { ...createEmptyRequirement('Fictional scenario supplied in the BHHS HTML and modification plan.'), client_id: profile.id, requirement_id: `${profile.id}-REQ`, client_alias: profile.name,
    budget_min: numbers.length > 1 ? numbers[0] * multiplier : null, budget_max: numbers.length ? numbers.at(-1)! * multiplier : null, currency: 'AED', budget_constraint: 'hard', preferred_areas: [get('location')], property_types: /apartment/i.test(get('home')) ? ['apartment'] : ['villa'], bedrooms_min: 5, purchase_purpose: 'self_use', source_name: 'Fictional HTML prototype', source_ref: 'bhhs-agent-demo.html', notes: 'Demo scenario only. All figures are illustrative presets.' };
}

/** Apply only the fields explicitly changed in the simple form; untouched dataset values survive. */
export function requirementWithProfile(base: ClientRequirement, profile: DemoProfile): ClientRequirement {
  const original = profileFromRequirement(base);
  const next = { ...base };
  for (const f of profile.core) {
    if (original.core.find(o => o.key === f.key)?.value === f.value) continue;
    const nums = f.value.replaceAll(',', '').match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
    if (f.key === 'budget') {
      const multiplier = /\bmillion\b|\d\s*m\b/i.test(f.value) ? 1e6 : /\d\s*k\b/i.test(f.value) ? 1e3 : 1;
      next.budget_min = nums.length > 1 ? nums[0] * multiplier : null;
      next.budget_max = nums.length ? nums.at(-1)! * multiplier : null;
    }
    if (f.key === 'location') next.preferred_areas = f.value.split(/[,·]/).map(v => v.trim()).filter(Boolean);
    if (f.key === 'home') {
      const type = ['apartment', 'villa', 'townhouse', 'penthouse', 'land', 'other'].find(t => f.value.toLowerCase().includes(t));
      next.property_types = type ? [type as NonNullable<ClientRequirement['property_types']>[number]] : null;
      next.bedrooms_min = nums[0] ?? null;
    }
    if (f.key === 'size') { next.area_min = nums[0] ?? null; next.area_max = nums[1] ?? null; next.area_unit = /sqm|sq m/i.test(f.value) ? 'sqm' : /sqft|sq ft/i.test(f.value) ? 'sqft' : null; }
    if (f.key === 'move') next.move_in_by = f.value || null;
    if (f.key === 'purpose') next.purchase_purpose = /self|family|residence/i.test(f.value) ? 'self_use' : /invest/i.test(f.value) ? 'investment' : /mixed/i.test(f.value) ? 'mixed' : 'unknown';
  }
  for (const f of profile.known) {
    if (original.known.find(o => o.key === f.key)?.value === f.value) continue;
    if (f.key === 'must') next.hard_constraints = f.value;
    if (f.key === 'soft') next.soft_preferences = f.value;
    if (f.key === 'signals') next.intent_evidence = f.value;
  }
  return next;
}
export function freshDemoCall(): DemoCall {
  return { id: crypto.randomUUID(), duration: 0, points: 'Buying in cash. No mortgage, no financing contingency. His wife is free Saturday at 11:00 for Frond N; his brother will come too. Wants three years of service charge history before any offer. The 24m waterfront exception is off the table.', payment: 'Full cash. No mortgage, no financing contingency', ceiling: 'AED 22m', time: 'Saturday 11:00', property: 'frond-n', attendees: 'Client, wife and brother', commitments: 'Send three years of service charge history for Frond N by Thursday.' };
}
export function saveDemoCall(profile: DemoProfile, call: DemoCall): DemoProfile {
  const source = `call-${call.id}`;
  const text = `WHAT WAS SAID\n${call.points}\nCHANGED\nPayment: ${call.payment || 'To confirm'}\nBudget ceiling: ${call.ceiling || 'To confirm'}\nViewing: ${call.time || 'To confirm'} · ${demoProperties.find(p => p.id === call.property)?.name || 'To confirm'}\nAttendees: ${call.attendees}\nYOU PROMISED\n${call.commitments}`;
  return { ...profile, payment: call.payment, paymentSource: call.payment ? source : '', call: { ...call }, updated: 'Just now', receipt: undefined,
    core: profile.core.map(f => f.key === 'budget' && call.ceiling ? { ...f, value: `Up to ${call.ceiling}`, sources: [source] } : f),
    known: profile.known.map(f => f.key === 'budget-note' && call.ceiling ? { ...f, value: `Firm ceiling: ${call.ceiling}`, sources: [source] } : f),
    sources: [{ id: source, title: 'Outbound call · you', meta: 'Just now · from this call', text }, ...profile.sources],
  };
}
