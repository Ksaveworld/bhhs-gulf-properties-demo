import type { AreaUnit, ClientRequirement, ListingSnapshot } from './types';
import { legacyAreaBases, resolveRequirementArea } from './requirement-area';
import { reviewConstraintSegment, reviewRawRequest } from './constraint-review';

export interface Filters {
  areas: string[];
  budget_min: number | null;
  budget_max: number | null;
  currency: string;
  bedrooms_min: number | null;
  area_min: number | null;
  /** Optional ceiling shared with v1.2 client requirements. */
  area_max?: number | null;
  area_unit: AreaUnit | null;
  area_basis: string;
  property_types: string[];
  market_preference: string;
  listing_status: string;
  amenities: string[];
  move_in_by: string | null;
  sort: 'updated_desc' | 'updated_asc' | 'price_asc' | 'price_desc';
}

/** Explicit search defaults; these are demo UI choices, not BHHS business policy. */
export const EMPTY_FILTERS: Filters = {
  areas: [], budget_min: null, budget_max: null, currency: 'AED', bedrooms_min: null,
  area_min: null, area_max: null, area_unit: 'sqft', area_basis: 'built_up', property_types: [],
  market_preference: '', listing_status: 'active', amenities: [], move_in_by: null, sort: 'updated_desc',
};

const SQFT_PER_SQM = 10.763910416709722;
const finite = (n: number | null | undefined): n is number => n !== null && n !== undefined && Number.isFinite(n);
export function convertArea(value: number, from: AreaUnit, to: AreaUnit): number {
  return from === to ? value : from === 'sqm' ? value * SQFT_PER_SQM : value / SQFT_PER_SQM;
}
/** Invalid manual ranges remain visible for correction and never expand the search. */
export function getAreaRangeError(filters: Pick<Filters, 'area_min' | 'area_max'>): string | null {
  if ([filters.area_min, filters.area_max].some(value => value != null && (!Number.isFinite(value) || value < 0))) {
    return 'Enter a size of zero or greater, or leave the limit blank.';
  }
  if (finite(filters.area_min) && finite(filters.area_max) && filters.area_min > filters.area_max) {
    return 'Min. size cannot be greater than Max. size.';
  }
  return null;
}
export function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function latestListings(rows: ListingSnapshot[]): ListingSnapshot[] {
  const listings = new Map<string, ListingSnapshot>();
  for (const row of rows) {
    const existing = listings.get(row.listing_id);
    const time = Date.parse(row.captured_at);
    const existingTime = existing ? Date.parse(existing.captured_at) : -Infinity;
    if (!existing || (Number.isFinite(time) && (!Number.isFinite(existingTime) || time > existingTime)) ||
      (time === existingTime && row.snapshot_id.localeCompare(existing.snapshot_id) > 0)) listings.set(row.listing_id, row);
  }
  return [...listings.values()];
}

function updatedOrder(a: ListingSnapshot, b: ListingSnapshot, ascending = false): number {
  const timeA = Date.parse(a.captured_at), timeB = Date.parse(b.captured_at);
  const tie = () => a.listing_id.localeCompare(b.listing_id);
  if (!Number.isFinite(timeA)) return Number.isFinite(timeB) ? 1 : tie();
  if (!Number.isFinite(timeB)) return -1;
  return (timeA - timeB) * (ascending ? 1 : -1) || tie();
}

/** Returns confirmed search hits. Missing selected hard-filter fields never count as a pass. */
export function filterListings(rows: ListingSnapshot[], filters: Filters): ListingSnapshot[] {
  if (getAreaRangeError(filters)) return [];
  const filtered = latestListings(rows).filter((row) => {
    if (filters.areas.length && !filters.areas.includes(row.area_name)) return false;
    if (filters.property_types.length && !filters.property_types.includes(row.property_type)) return false;
    if (filters.listing_status && row.listing_status !== filters.listing_status) return false;
    if (filters.market_preference && !['either', 'unknown'].includes(filters.market_preference) && row.market_segment !== filters.market_preference) return false;
    if (finite(filters.budget_min) || finite(filters.budget_max)) {
      if (!finite(row.asking_price) || !filters.currency || filters.currency === 'other' || row.currency !== filters.currency) return false;
      if (finite(filters.budget_min) && row.asking_price < filters.budget_min) return false;
      if (finite(filters.budget_max) && row.asking_price > filters.budget_max) return false;
    }
    if (finite(filters.bedrooms_min) && (!finite(row.bedrooms) || row.bedrooms < filters.bedrooms_min)) return false;
    if (finite(filters.area_min) || finite(filters.area_max)) {
      if (!filters.area_unit) return false;
      if (!filters.area_basis || filters.area_basis === 'unknown' || !row.area_basis || row.area_basis === 'unknown' || row.area_basis !== filters.area_basis || !finite(row.area_value) || !row.area_unit) return false;
      const size = convertArea(row.area_value, row.area_unit, filters.area_unit);
      if (finite(filters.area_min) && size + 1e-8 < filters.area_min) return false;
      if (finite(filters.area_max) && size - 1e-8 > filters.area_max) return false;
    }
    if (filters.amenities.some((amenity) => !(row.amenities ?? []).includes(amenity))) return false;
    if (filters.move_in_by && (!validDate(filters.move_in_by) || !validDate(row.availability_date) || row.availability_date > filters.move_in_by)) return false;
    return true;
  });
  return filtered.sort((a, b) => {
    if (filters.sort === 'updated_desc' || filters.sort === 'updated_asc') return updatedOrder(a, b, filters.sort === 'updated_asc');
    // No FX source is configured. Group by original currency before numeric sorting.
    const currencyOrder = (a.currency ?? '\uffff').localeCompare(b.currency ?? '\uffff');
    if (currencyOrder) return currencyOrder;
    if (a.currency === 'other' || !a.currency) return updatedOrder(a, b);
    if (!finite(a.asking_price)) return finite(b.asking_price) ? 1 : updatedOrder(a, b);
    if (!finite(b.asking_price)) return -1;
    return (a.asking_price - b.asking_price) * (filters.sort === 'price_asc' ? 1 : -1) || updatedOrder(a, b);
  });
}

const AMENITY_ALIASES: Record<string, string[]> = {
  parking: ['parking', 'car park', '车位', '停车位'], pool: ['pool', 'swimming pool', '泳池'],
  gym: ['gym', '健身房'], balcony: ['balcony', '阳台'], garden: ['garden', '花园'],
  sea_view: ['sea_view', 'sea view', '海景'], study: ['study', '书房'],
};

export function parseHardConstraints(text: string | null, requirement?: ClientRequirement): {
  amenities: string[]; area_basis: string; unknowns: string[];
  equivalents: { text: string; fields: string[] }[]; required_market: string | null;
} {
  let rest = text ?? '';
  const bases = legacyAreaBases(text);
  rest = rest.replace(/area\s*basis\s*:\s*(built_up|internal|gross|land|unknown)\b/gi, '');
  const amenities: string[] = [], unknowns: string[] = [];
  const equivalents: { text: string; fields: string[] }[] = [];
  let required_market: string | null = null;
  for (const segment of rest.split(/[;；\n|。，]/).map((s) => s.trim()).filter(Boolean)) {
    const review = requirement ? reviewConstraintSegment(segment, requirement) : null;
    if (review?.kind === 'equivalent') {
      equivalents.push({ text: segment, fields: review.fields });
      if (review.fields.includes('market_preference')) required_market = requirement!.market_preference;
      continue;
    }
    if (review?.reason) { unknowns.push(`${segment} — ${review.reason}`); continue; }
    let unmatched = segment.replace(/^(?:amenities\s*:|must\s+(?:have|include)|requires?|required\s*:|必须(?:有|带|配备)?|需要(?:有|带|配备)?)\s*/i, '');
    const found: string[] = [];
    for (const [key, aliases] of Object.entries(AMENITY_ALIASES)) {
      for (const alias of [...aliases].sort((a, b) => b.length - a.length)) {
        const pattern = new RegExp(alias.includes('_') || /^[a-z ]+$/.test(alias) ? `\\b${alias}\\b` : alias, 'gi');
        if (pattern.test(unmatched)) { found.push(key); unmatched = unmatched.replace(pattern, ' '); }
      }
    }
    unmatched = unmatched.replace(/\b(?:and|with|a|an|the)\b|[,&和及与、。.!！\s]/gi, '');
    if (!unmatched && found.length) amenities.push(...found);
    else unknowns.push(segment);
  }
  return { amenities: [...new Set(amenities)], area_basis: bases.length === 1 ? bases[0] : '', unknowns, equivalents, required_market };
}

export function requirementTextReview(requirement: ClientRequirement) {
  const hard = parseHardConstraints(requirement.hard_constraints, requirement);
  return { equivalents: hard.equivalents, warnings: [
    ...hard.unknowns.map(text => `Hard condition needs confirmation: ${text}`), ...reviewRawRequest(requirement),
  ] };
}

export function requirementsToFilters(requirement: ClientRequirement): Filters {
  const hard = parseHardConstraints(requirement.hard_constraints, requirement);
  const area = resolveRequirementArea(requirement);
  return {
    ...EMPTY_FILTERS, areas: [...(requirement.preferred_areas ?? [])],
    budget_min: requirement.budget_min, budget_max: requirement.budget_max,
    currency: requirement.currency ?? '', bedrooms_min: requirement.bedrooms_min,
    area_min: requirement.area_min, area_max: requirement.area_max ?? null, area_unit: requirement.area_unit, area_basis: area.basis,
    property_types: [...(requirement.property_types ?? [])], market_preference: requirement.market_preference,
    amenities: hard.amenities, move_in_by: requirement.move_in_by,
  };
}

export interface MatchResult {
  listing_id: string;
  requirement_id: string;
  client_id: string;
  status: 'match' | 'review' | 'excluded';
  matched: string[];
  conflicts: string[];
  unknowns: string[];
  budget_fit: string;
  next_action: string;
  purchase_by: string | null;
  intent_evidence: string | null;
}

/** Transparent demo comparisons only: no probability, wealth inference, or learned ranking. */
export function evaluateMatch(listing: ListingSnapshot, requirement: ClientRequirement): MatchResult {
  const matched: string[] = [], conflicts: string[] = [], unknowns: string[] = [];
  let excluded = false;
  const exclude = (message: string) => { conflicts.push(message); excluded = true; };
  const hard = parseHardConstraints(requirement.hard_constraints, requirement);
  const area = resolveRequirementArea(requirement);
  const selectedAreas = requirement.preferred_areas ?? [];
  if (selectedAreas.length) {
    if (selectedAreas.includes(listing.area_name)) matched.push(`Area: ${listing.area_name}`);
    else conflicts.push(`Area ${listing.area_name} is outside the stated preferences: ${selectedAreas.join(', ')}`);
  } else unknowns.push('Preferred area has not been confirmed.');
  const selectedTypes = requirement.property_types ?? [];
  if (selectedTypes.length) {
    if (listing.property_type === 'unknown') unknowns.push('Property type is undisclosed.');
    else if (selectedTypes.includes(listing.property_type)) matched.push(`Property type: ${listing.property_type}`);
    else conflicts.push(`Property type ${listing.property_type} differs from the stated preference.`);
  }
  if (finite(requirement.bedrooms_min)) {
    if (!finite(listing.bedrooms)) unknowns.push('Bedroom count is undisclosed.');
    else if (listing.bedrooms >= requirement.bedrooms_min) matched.push(`Bedrooms: ${listing.bedrooms} meets minimum ${requirement.bedrooms_min}`);
    else exclude(`Bedrooms: ${listing.bedrooms} is below minimum ${requirement.bedrooms_min}`);
  }
  const hasBudget = finite(requirement.budget_min) || finite(requirement.budget_max);
  let budget_fit = 'Budget not provided.';
  if (!hasBudget) unknowns.push(budget_fit);
  else if (!finite(listing.asking_price)) { budget_fit = 'Asking price is undisclosed.'; unknowns.push(budget_fit); }
  else if (!requirement.currency || !listing.currency || requirement.currency === 'other' || listing.currency !== requirement.currency) {
    budget_fit = 'Budget and price currencies cannot be compared without a verified currency / FX basis.'; unknowns.push(budget_fit);
  } else {
    const format = (amount: number) => `${requirement.currency} ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    if (finite(requirement.budget_max) && listing.asking_price > requirement.budget_max) {
      budget_fit = `${format(listing.asking_price - requirement.budget_max)} above stated budget maximum.`;
      if (requirement.budget_constraint === 'hard') exclude(budget_fit);
      else { conflicts.push(budget_fit); unknowns.push(requirement.budget_constraint === 'flexible' ? 'Budget is flexible; sales must confirm the acceptable adjustment. No affordability inference is made.' : 'Confirm whether the stated budget maximum is a hard limit.'); }
    } else if (finite(requirement.budget_min) && listing.asking_price < requirement.budget_min) {
      budget_fit = `${format(requirement.budget_min - listing.asking_price)} below stated budget range.`;
      conflicts.push(budget_fit);
    } else { budget_fit = 'Within stated budget limits, excluding unspecified transaction costs.'; matched.push(budget_fit); }
    if (requirement.budget_constraint === 'unknown' && !unknowns.some((m) => m.includes('hard limit'))) unknowns.push('Budget flexibility has not been confirmed.');
  }
  if (getAreaRangeError(requirement)) exclude('The stated size range is invalid; confirm both limits.');
  if (finite(requirement.area_min) || finite(requirement.area_max)) {
    if (area.status !== 'known') unknowns.push(...area.messages);
    else if (!finite(listing.area_value) || !listing.area_unit || !listing.area_basis || listing.area_basis === 'unknown') unknowns.push('Listing area, unit or area basis is undisclosed.');
    else if (listing.area_basis !== area.basis) unknowns.push(`Area bases differ (${listing.area_basis} vs ${area.basis}); unit conversion cannot resolve this.`);
    else if (!requirement.area_unit) unknowns.push('Required area unit is missing.');
    else {
      const size = convertArea(listing.area_value, listing.area_unit, requirement.area_unit);
      if (finite(requirement.area_min)) {
        if (size + 1e-8 >= requirement.area_min) matched.push(`Area meets ${requirement.area_min} ${requirement.area_unit} minimum on ${area.basis} basis.`);
        else exclude(`Area is below ${requirement.area_min} ${requirement.area_unit} minimum on ${area.basis} basis.`);
      }
      if (finite(requirement.area_max)) {
        if (size - 1e-8 <= requirement.area_max) matched.push(`Area meets ${requirement.area_max} ${requirement.area_unit} maximum on ${area.basis} basis.`);
        else exclude(`Area exceeds ${requirement.area_max} ${requirement.area_unit} maximum on ${area.basis} basis.`);
      }
    }
  }
  else if (area.status === 'conflict') unknowns.push(...area.messages);
  if (requirement.market_preference === 'ready' || requirement.market_preference === 'off_plan') {
    if (listing.market_segment === 'unknown') unknowns.push('Ready / off-plan status is unknown.');
    else if (listing.market_segment === requirement.market_preference) matched.push(`Market status: ${listing.market_segment}`);
    else if (hard.required_market) exclude(`Market status ${listing.market_segment} conflicts with the explicit required ${hard.required_market} condition.`);
    else conflicts.push(`Market status ${listing.market_segment} differs from preference ${requirement.market_preference}.`);
  }
  if (listing.listing_status === 'unknown') unknowns.push('Listing availability has not been confirmed.');
  else if (listing.listing_status !== 'active') exclude(`Listing is ${listing.listing_status}; it is not active inventory.`);
  for (const amenity of hard.amenities) {
    if ((listing.amenities ?? []).includes(amenity)) matched.push(`Required amenity disclosed: ${amenity}`);
    else unknowns.push(`Required amenity ${amenity} is not disclosed; confirm before recommending.`);
  }
  for (const constraint of hard.unknowns) unknowns.push(`Manual confirmation required for hard condition: ${constraint}`);
  unknowns.push(...reviewRawRequest(requirement));
  if (requirement.move_in_by) {
    if (!validDate(requirement.move_in_by)) unknowns.push('Move-in deadline is not a valid complete date.');
    else if (!validDate(listing.availability_date)) unknowns.push(`Delivery by ${requirement.move_in_by} is not confirmed.`);
    else if (listing.availability_date <= requirement.move_in_by) matched.push(`Available ${listing.availability_date}, by move-in deadline ${requirement.move_in_by}`);
    else exclude(`Available ${listing.availability_date}, after move-in deadline ${requirement.move_in_by}`);
  }
  if (!validDate(requirement.purchase_by)) unknowns.push('Purchase date has not been confirmed.');
  if (requirement.missing_questions) unknowns.push(requirement.missing_questions);
  if (requirement.soft_preferences) unknowns.push(`Soft preferences for sales review: ${requirement.soft_preferences}`);
  const status = excluded ? 'excluded' : unknowns.length || conflicts.length || !matched.length ? 'review' : 'match';
  return {
    listing_id: listing.listing_id, requirement_id: requirement.requirement_id, client_id: requirement.client_id,
    status, matched, conflicts, unknowns, budget_fit,
    next_action: status === 'excluded' ? 'Review the conflicting condition with sales before considering this property.' : status === 'review' ? 'Confirm the listed unknowns and preference differences with the client.' : 'Sales can discuss this shortlist and confirm viewing interest.',
    purchase_by: validDate(requirement.purchase_by) ? requirement.purchase_by : null,
    intent_evidence: requirement.intent_evidence,
  };
}
