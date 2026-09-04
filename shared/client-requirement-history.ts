import type { ClientRequirement } from './types';
import type { LocalRequirementCopy } from './local-requirements';

const FIELDS: Partial<Record<keyof ClientRequirement, string>> = {
  client_alias: 'Client name', raw_request: 'Original request', budget_min: 'Minimum budget', budget_max: 'Maximum budget',
  currency: 'Currency', budget_constraint: 'Budget limit', preferred_areas: 'Preferred location', property_types: 'Property type',
  bedrooms_min: 'Minimum bedrooms', area_min: 'Minimum size', area_unit: 'Size unit', area_basis: 'Area basis',
  market_preference: 'Completion preference', purchase_purpose: 'Purchase purpose', purchase_by: 'Purchase by',
  move_in_by: 'Available / move-in by', hard_constraints: 'Required conditions', soft_preferences: 'Preferences / notes',
  intent_evidence: 'Stated intent', missing_questions: 'Questions to clarify',
};
export interface RequirementChange {
  field: keyof ClientRequirement;
  label: string;
  kind: 'added' | 'changed' | 'removed';
  before: string;
  after: string;
}
const blank = (value: unknown) => value === null || value === undefined || value === '' || Array.isArray(value) && value.length === 0;
const displayed = (value: unknown) => blank(value) ? 'Not supplied' : Array.isArray(value) ? value.join(', ') : String(value).replaceAll('_', ' ');

/** Compares complete sales-reviewed versions; never infers a preference from viewing activity. */
export function requirementChanges(before: ClientRequirement | null, after: ClientRequirement): RequirementChange[] {
  return (Object.keys(FIELDS) as (keyof ClientRequirement)[]).flatMap(field => {
    const previous = before?.[field] ?? null;
    const current = after[field] ?? null;
    if (JSON.stringify(previous) === JSON.stringify(current) || blank(previous) && blank(current)) return [];
    return [{ field, label: FIELDS[field]!, kind: blank(previous) ? 'added' : blank(current) ? 'removed' : 'changed', before: displayed(previous), after: displayed(current) }];
  });
}

function revisionRoot(id: string, copies: Map<string, LocalRequirementCopy>): string {
  const visited = new Set<string>();
  let current = id;
  while (!visited.has(current)) {
    visited.add(current);
    const copy = copies.get(current);
    if (copy?.edit_kind !== 'revision' || !copy.parent_requirement_id) return current;
    current = copy.parent_requirement_id;
  }
  // Storage validation refuses cycles. A malformed caller does not silently merge plans.
  return id;
}
function recordTime(copy: LocalRequirementCopy): number {
  const time = Date.parse(copy.saved_at);
  return Number.isFinite(time) ? time : -Infinity;
}
function later(a: LocalRequirementCopy, b: LocalRequirementCopy): boolean {
  return recordTime(a) > recordTime(b) || recordTime(a) === recordTime(b) && a.requirement.requirement_id.localeCompare(b.requirement.requirement_id) > 0;
}

/**
 * Only explicitly revised parent chains have one current complete version.
 * Original imports and legacy independent copies remain separate plans. No fields
 * are pooled across plans and no imported records are changed or deleted.
 */
export function currentClientRequirements(originals: ClientRequirement[], copies: LocalRequirementCopy[]): ClientRequirement[] {
  const local = new Map(copies.map(copy => [copy.requirement.requirement_id, copy]));
  const current = new Map(originals.map(requirement => [requirement.requirement_id, requirement]));
  const chosen = new Map<string, LocalRequirementCopy>();
  const revised = new Set(copies.filter(copy => copy.edit_kind === 'revision').map(copy => copy.parent_requirement_id));
  for (const copy of copies) {
    if (revised.has(copy.requirement.requirement_id)) continue;
    const root = revisionRoot(copy.requirement.requirement_id, local);
    const existing = chosen.get(root);
    if (!existing || later(copy, existing)) chosen.set(root, copy);
  }
  for (const [root, copy] of chosen) current.set(root, copy.requirement);
  return [...current.values()];
}

export interface RequirementHistoryEntry {
  requirement: ClientRequirement;
  recorded_at: string;
  kind: 'original' | 'local' | 'revision';
  changes: RequirementChange[];
  is_current: boolean;
  parent_missing: boolean;
}

/** Chronological history for one explicit plan, including all retained revision branches. */
export function clientRequirementHistory(current: ClientRequirement, originals: ClientRequirement[], copies: LocalRequirementCopy[]): RequirementHistoryEntry[] {
  const local = new Map(copies.map(copy => [copy.requirement.requirement_id, copy]));
  const all = new Map([...originals, ...copies.map(copy => copy.requirement)].map(row => [row.requirement_id, row]));
  const root = revisionRoot(current.requirement_id, local);
  const rows = [...all.values()].filter(row => row.client_id === current.client_id && revisionRoot(row.requirement_id, local) === root);
  return rows.map(requirement => {
    const copy = local.get(requirement.requirement_id);
    const parent = copy?.edit_kind === 'revision' && copy.parent_requirement_id ? all.get(copy.parent_requirement_id) : null;
    return {
      requirement, recorded_at: copy?.saved_at ?? requirement.captured_at,
      kind: copy?.edit_kind === 'revision' ? 'revision' as const : copy ? 'local' as const : 'original' as const,
      changes: requirementChanges(parent ?? null, requirement), is_current: requirement.requirement_id === current.requirement_id,
      parent_missing: copy?.edit_kind === 'revision' && !parent,
    };
  }).sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at) || a.requirement.requirement_id.localeCompare(b.requirement.requirement_id));
}
