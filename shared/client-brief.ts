import { createEmptyRequirement, ruleAssistant } from './assistant';
import { extractClientName } from './home-tasks';
import type { ClientRequirement } from './types';

export type MaterialKind = 'Sales note' | 'WhatsApp' | 'Email' | 'Call transcript' | 'Photo notes';
export interface ClientMaterial { id: string; kind: MaterialKind; title: string; text: string; synthetic: boolean; reviewedValues?: Partial<ClientRequirement> }
export const BRIEF_FIELDS = [
  { id: 'name', label: 'Client', keys: ['client_alias'] },
  { id: 'budget', label: 'Budget', keys: ['budget_min', 'budget_max', 'currency', 'budget_constraint'] },
  { id: 'location', label: 'Location', keys: ['preferred_areas'] },
  { id: 'home', label: 'Property type', keys: ['property_types'] },
  { id: 'beds', label: 'Bedrooms', keys: ['bedrooms_min'] },
  { id: 'size', label: 'Size & measurement', keys: ['area_min', 'area_max', 'area_unit', 'area_basis'] },
  { id: 'purpose', label: 'Purchase purpose', keys: ['purchase_purpose'] },
  { id: 'completion', label: 'Completion', keys: ['market_preference'] },
  { id: 'purchase', label: 'Purchase by', keys: ['purchase_by'] },
  { id: 'movein', label: 'Move-in by', keys: ['move_in_by'] },
  { id: 'features', label: 'Must-haves', keys: ['hard_constraints'] },
  { id: 'preferences', label: 'Preferences', keys: ['soft_preferences'] },
  { id: 'intent', label: 'Stated next step', keys: ['intent_evidence'] },
] as const;
type BriefField = typeof BRIEF_FIELDS[number];
export interface BriefEvidence { sourceId: string; label: string; values: Partial<ClientRequirement>; display: string }
export interface BriefFact { id: BriefField['id']; label: string; evidence: BriefEvidence[]; selected: number }
export interface ClientBrief { draft: ClientRequirement; facts: BriefFact[]; warnings: string[] }
const known = (value: unknown) => value !== null && value !== undefined && value !== '' && value !== 'unknown' && (!Array.isArray(value) || value.length > 0);
const words = (value: unknown) => Array.isArray(value) ? value.join(', ') : String(value).replaceAll('_', ' ');
export function describeBriefField(field: BriefField, values: Partial<ClientRequirement>): string {
  if (field.id === 'budget') {
    const amount = (n: number) => n.toLocaleString('en-US');
    const range = values.budget_min != null && values.budget_max != null ? `${amount(values.budget_min)} – ${amount(values.budget_max)}`
      : values.budget_max != null ? `up to ${amount(values.budget_max)}` : values.budget_min != null ? `from ${amount(values.budget_min)}` : 'Amount unconfirmed';
    return `${values.currency ?? 'Currency unconfirmed'} ${range}`;
  }
  return field.keys.map(key => values[key]).filter(known).map(words).join(' · ') || 'To confirm';
}

/** Each material is parsed separately. Later sources propose changes, never silently resolve conflicts. */
export async function buildClientBrief(materials: ClientMaterial[], baseline: ClientRequirement | null, areas: string[]): Promise<ClientBrief> {
  const draft = { ...(baseline ?? createEmptyRequirement()), client_alias: baseline?.client_alias ?? '' };
  const facts: BriefFact[] = BRIEF_FIELDS.map(field => ({ id: field.id, label: field.label, evidence: [], selected: 0 }));
  const warnings: string[] = [];
  const add = (req: ClientRequirement, fields: string[], sourceId: string, label: string, reviewed = false) => {
    BRIEF_FIELDS.forEach((field, index) => {
      if (!field.keys.some(key => fields.includes(key) && (reviewed || known(req[key])))) return;
      const values = Object.fromEntries(field.keys.map(key => [key, req[key]])) as Partial<ClientRequirement>;
      facts[index].evidence.push({ sourceId, label, values, display: describeBriefField(field, values) });
      facts[index].selected = facts[index].evidence.length - 1;
      Object.assign(draft, values);
    });
  };
  if (baseline) add(baseline, BRIEF_FIELDS.flatMap(field => [...field.keys]), 'baseline', 'Current client record');
  for (const material of materials) {
    if (material.reviewedValues) {
      add({ ...createEmptyRequirement(), ...material.reviewedValues }, Object.keys(material.reviewedValues), material.id, material.title, true);
      continue;
    }
    const parsed = await ruleAssistant.extract(material.text, { areas });
    const name = extractClientName(material.text);
    if (name) { parsed.requirement.client_alias = name; parsed.extracted_fields.push('client_alias'); }
    add(parsed.requirement, parsed.extracted_fields, material.id, material.title);
    warnings.push(...parsed.warnings.filter(warning => !/^Rules demo only|^No budget|^No exact area name|^No structured conditions/.test(warning)).map(warning => `${material.title}: ${warning}`));
  }
  draft.raw_request = [baseline ? `Current client record:\n${baseline.raw_request}` : '', ...materials.map(material => `${material.title} (${material.kind}${material.synthetic ? ', fictional example' : ''}):\n${material.text}`)].filter(Boolean).join('\n\n');
  draft.source_name = 'Sales-reviewed client workspace';
  draft.source_ref = materials.map(material => material.id).join(', ') || baseline?.source_ref || '';
  draft.verification_status = 'needs_review';
  draft.reviewed_by = null;
  draft.missing_questions = [...new Set([baseline?.missing_questions, ...warnings].filter(Boolean))].join('\n') || null;
  // User text has no inferred permission or demo classification; synthetic examples are explicit.
  draft.data_kind = materials.every(material => material.synthetic) ? baseline?.data_kind ?? 'demo' : baseline?.data_kind === 'real_public' ? 'real_public' : 'real_authorized';
  draft.usage_status = materials.length ? 'pending' : baseline?.usage_status ?? 'pending';
  draft.notes = 'Session analysis. Text extraction uses rules; source claims and permissions remain unverified. Saved copies stay in the current browser.';
  return { draft, facts, warnings: [...new Set(warnings)] };
}

export function factHasChange(fact: BriefFact): boolean {
  return new Set(fact.evidence.map(evidence => JSON.stringify(evidence.values))).size > 1;
}
export function selectBriefEvidence(brief: ClientBrief, factId: string, selected: number): ClientBrief {
  const fact = brief.facts.find(item => item.id === factId);
  if (!fact?.evidence[selected]) return brief;
  return { ...brief, draft: { ...brief.draft, ...fact.evidence[selected].values }, facts: brief.facts.map(item => item.id === factId ? { ...item, selected } : item) };
}

/** Explicit reviewer edits become a new source, so future interactions cannot erase them. */
export function recordBriefReview(brief: ClientBrief, draft: ClientRequirement): { brief: ClientBrief; material: ClientMaterial | null } {
  const changed = BRIEF_FIELDS.filter(field => {
    const fact = brief.facts.find(fact => fact.id === field.id)!;
    return field.keys.some(key => JSON.stringify(draft[key]) !== JSON.stringify(brief.draft[key])) || (fact.evidence.length > 1 && fact.selected !== fact.evidence.length - 1);
  });
  if (!changed.length) return { brief: { ...brief, draft }, material: null };
  const id = `review-${crypto.randomUUID()}`;
  const reviewedValues = Object.fromEntries(changed.flatMap(field => field.keys.map(key => [key, draft[key]]))) as Partial<ClientRequirement>;
  const material: ClientMaterial = { id, kind: 'Sales note', title: 'Sales review', text: changed.map(field => `${field.label}: ${describeBriefField(field, draft)}`).join('\n'), synthetic: draft.data_kind === 'demo', reviewedValues };
  const facts = brief.facts.map(fact => {
    const field = changed.find(field => field.id === fact.id);
    if (!field) return fact;
    const values = Object.fromEntries(field.keys.map(key => [key, draft[key]])) as Partial<ClientRequirement>;
    return { ...fact, selected: fact.evidence.length, evidence: [...fact.evidence, { sourceId: id, label: 'Sales review', values, display: describeBriefField(field, draft) }] };
  });
  return { brief: { ...brief, draft: { ...draft, raw_request: `${draft.raw_request}\n\nSales review:\n${material.text}`, source_ref: [draft.source_ref, id].filter(Boolean).join(', ') }, facts }, material };
}

export function exampleClientMaterials(): ClientMaterial[] {
  return [
    { id: 'example-call', kind: 'Call transcript', title: 'Initial call · fictional example', synthetic: true, text: 'Client name: Alex Morgan. A ready 2 bedroom apartment in Dubai Marina for self use. Budget up to AED 2.8m. Must have parking. The purchase date and decision makers still need confirmation.' },
    { id: 'example-whatsapp', kind: 'WhatsApp', title: 'Latest WhatsApp · fictional example', synthetic: true, text: 'My budget cap is AED 2.5m. Please keep Dubai Marina on the shortlist. I need to discuss viewing times with my partner.' },
  ];
}
