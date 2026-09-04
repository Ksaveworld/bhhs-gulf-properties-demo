import type { ClientRequirement } from './types';

export type ClientVisibility = 'company' | 'private' | 'legacy';
export type ClientDirectoryScope = 'all' | 'unassigned' | ClientVisibility;

export interface ClientDirectoryFilters {
  name: string;
  budget_min: number | null;
  budget_max: number | null;
  preferred_location: string;
  property_type?: string;
  visibility: ClientDirectoryScope;
}

export const EMPTY_CLIENT_DIRECTORY_FILTERS: ClientDirectoryFilters = {
  name: '', budget_min: null, budget_max: null, preferred_location: '', property_type: '', visibility: 'all',
};

export const CLIENT_VISIBILITY_LABELS: Record<ClientVisibility, string> = {
  company: 'Company', private: 'Private', legacy: 'Legacy local copy',
};

export interface ClientDirectoryGroup {
  client_id: string;
  client_alias: string;
  /** Only individual requirements satisfying every directory filter. */
  requirements: ClientRequirement[];
  /** Number of this client's requirements in the caller's authorized input. */
  total_requirements: number;
}

type BudgetRange = Pick<ClientDirectoryFilters, 'budget_min' | 'budget_max'>;
const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

export function clientDirectoryBudgetError(range: BudgetRange): string | null {
  if ([range.budget_min, range.budget_max].some(value => value !== null && (!Number.isFinite(value) || value < 0))) {
    return 'Enter a budget of zero or greater, or leave the limit blank.';
  }
  if (range.budget_min !== null && range.budget_max !== null && range.budget_min > range.budget_max) {
    return 'Min. budget cannot be greater than Max. budget.';
  }
  return null;
}

export function hasClientDirectoryFilters(filters: ClientDirectoryFilters): boolean {
  return Boolean(normalized(filters.name) || normalized(filters.preferred_location) ||
    normalized(filters.property_type ?? '') || filters.budget_min !== null || filters.budget_max !== null || filters.visibility !== 'all');
}

/** An interval lookup of stated AED budgets, not an assessment of buying power. */
function budgetOverlaps(requirement: ClientRequirement, filter: BudgetRange): boolean {
  if (filter.budget_min === null && filter.budget_max === null) return true;
  if (requirement.currency !== 'AED' || clientDirectoryBudgetError(requirement) ||
      (requirement.budget_min === null && requirement.budget_max === null)) return false;
  // A single supplied bound stays open on the other side; no missing value is invented.
  const lower = requirement.budget_min ?? -Infinity;
  const upper = requirement.budget_max ?? Infinity;
  return upper >= (filter.budget_min ?? -Infinity) && lower <= (filter.budget_max ?? Infinity);
}

/** Permission filtering belongs to the caller. Conditions are never joined across requirements. */
export function filterClientDirectory(
  requirements: ClientRequirement[],
  filters: ClientDirectoryFilters,
  getVisibility: (requirementId: string) => ClientVisibility,
): ClientDirectoryGroup[] {
  if (clientDirectoryBudgetError(filters)) return [];
  const name = normalized(filters.name);
  const location = normalized(filters.preferred_location);
  const propertyType = normalized(filters.property_type ?? '');
  const groups = new Map<string, ClientDirectoryGroup>();
  const assignedCompanyClients = new Set(requirements.filter(row => getVisibility(row.requirement_id) === 'company' && row.sales_owner?.trim()).map(row => row.client_id));

  for (const requirement of requirements) {
    let group = groups.get(requirement.client_id);
    if (!group) {
      group = { client_id: requirement.client_id, client_alias: requirement.client_alias, requirements: [], total_requirements: 0 };
      groups.set(requirement.client_id, group);
    }
    group.total_requirements += 1;
    if (name && !normalized(requirement.client_alias).includes(name)) continue;
    if (location && !(requirement.preferred_areas ?? []).some(area => normalized(area).includes(location))) continue;
    if (propertyType && !(requirement.property_types ?? []).some(type => normalized(type) === propertyType)) continue;
    const visibility = getVisibility(requirement.requirement_id);
    if (filters.visibility === 'unassigned') {
      if (visibility !== 'company' || assignedCompanyClients.has(requirement.client_id)) continue;
    } else if (filters.visibility !== 'all' && visibility !== filters.visibility) continue;
    if (!budgetOverlaps(requirement, filters)) continue;
    if (group.requirements.length === 0) group.client_alias = requirement.client_alias;
    group.requirements.push(requirement);
  }

  // Preserve supplied client order; neither intent nor budget creates a business priority.
  return [...groups.values()].filter(group => group.requirements.length > 0);
}
