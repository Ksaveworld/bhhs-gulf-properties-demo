import type { AreaBasis, ClientRequirement } from './types';

export const AREA_BASES: AreaBasis[] = ['internal', 'gross', 'built_up', 'land', 'unknown'];
export const AREA_CONFIRMATION = 'Area basis needs confirmation (面积口径待确认).';

/** Old v1 text is evidence, not a value to silently overwrite with a listing measurement. */
export function legacyAreaBases(text: string | null): AreaBasis[] {
  return [...new Set([...((text ?? '').matchAll(/area\s*basis\s*:\s*(built_up|internal|gross|land|unknown)\b/gi))]
    .map(match => match[1].toLowerCase() as AreaBasis))];
}

export interface RequirementAreaResolution {
  basis: AreaBasis;
  selected_basis: AreaBasis | null;
  legacy_bases: AreaBasis[];
  status: 'known' | 'missing' | 'unknown' | 'conflict';
  source: 'field' | 'legacy' | 'none';
  messages: string[];
}

export function resolveRequirementArea(requirement: Pick<ClientRequirement, 'area_basis' | 'hard_constraints'>): RequirementAreaResolution {
  const explicit = requirement.area_basis ?? null;
  const legacy = legacyAreaBases(requirement.hard_constraints);
  const selected = explicit ?? legacy[0] ?? null;
  const source = explicit ? 'field' : legacy.length ? 'legacy' : 'none';
  // An explicit unknown is an intentional unconfirmed value, not permission to use old text.
  const conflict = legacy.length > 1 || (explicit && explicit !== 'unknown' && legacy.some(value => value !== 'unknown' && value !== explicit));
  const status = conflict ? 'conflict' : !selected ? 'missing' : selected === 'unknown' ? 'unknown' : 'known';
  return {
    basis: status === 'known' ? selected! : 'unknown', selected_basis: selected,
    legacy_bases: legacy, status, source,
    messages: status === 'known' ? [] : [conflict
      ? `${AREA_CONFIRMATION} Structured field (${explicit ?? 'empty'}) and legacy statements (${legacy.join(', ')}) must be reconciled with the client. No area comparison is confirmed.`
      : `${AREA_CONFIRMATION} Confirm internal, gross, built up or land; sqft/sqm is a unit, not a measurement basis.`],
  };
}

export function requirementAreaWarnings(requirement: Pick<ClientRequirement, 'area_basis' | 'hard_constraints' | 'area_min' | 'area_unit'>): string[] {
  const resolution = resolveRequirementArea(requirement);
  return [
    ...(requirement.area_min !== null || resolution.status === 'conflict' ? resolution.messages : []),
    ...(requirement.area_min !== null && !requirement.area_unit ? ['Required area unit needs confirmation.'] : []),
  ];
}
