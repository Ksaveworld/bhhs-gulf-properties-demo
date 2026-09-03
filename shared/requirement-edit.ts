import type { AreaBasis, ClientRequirement, Currency } from './types';
import { parseHardConstraints, type Filters } from './matching';

/** A sales review changes structured fields; source text and unrecognized restrictions survive. */
export function applyRequirementFields(draft: ClientRequirement, filters: Filters): ClientRequirement {
  const existing = parseHardConstraints(draft.hard_constraints).amenities;
  const additions = filters.amenities.filter(value => !existing.includes(value)).map(value => `must have ${value}`);
  return {
    ...draft, budget_min: filters.budget_min, budget_max: filters.budget_max,
    currency: (filters.currency || null) as Currency | null,
    preferred_areas: [...filters.areas], property_types: [...filters.property_types],
    bedrooms_min: filters.bedrooms_min, area_min: filters.area_min, area_unit: filters.area_unit,
    area_basis: (filters.area_basis || null) as AreaBasis | null,
    market_preference: (filters.market_preference || 'unknown') as ClientRequirement['market_preference'],
    move_in_by: filters.move_in_by,
    hard_constraints: additions.length ? [draft.hard_constraints, ...additions].filter(Boolean).join('; ') : draft.hard_constraints,
  };
}
