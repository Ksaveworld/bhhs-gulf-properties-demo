import { evaluateMatch, validDate } from './matching';
import type { MatchResult } from './matching';
import type { ClientRequirement, ListingSnapshot } from './types';

export type ClientSort = 'conditions' | 'budget' | 'purchase_date';

export interface RequirementAssessment {
  requirement: ClientRequirement;
  result: MatchResult;
  budget: {
    status: 'within' | 'above' | 'below' | 'unknown';
    headroom: number | null;
    label: string;
    range_label: string;
  };
  timing: { status: 'compatible' | 'conflict' | 'unknown'; label: string };
}

export interface ClientGroup {
  client_id: string;
  client_alias: string;
  status: 'match' | 'review' | 'excluded';
  primary: RequirementAssessment;
  requirements: RequirementAssessment[];
}

export const CLIENT_SORT_DESCRIPTIONS: Record<ClientSort, string> = {
  conditions: 'Condition status first: matches, needs review, then hard conflicts. Within each group, client ID is the stable order. Each client appears once, using their best individual requirement.',
  budget: 'Condition status first. Within each group, stated budget ranges covering the asking price come first; other comparable budgets follow by smallest absolute gap to the stated range, then unknown budgets. Ties use client ID. No currency conversion or wealth ranking.',
  purchase_date: 'Condition status first. Within each group, the earliest confirmed purchase-by date comes first; missing or invalid dates come last. Ties use client ID. Purchase timing is kept separate from the move-in deadline.',
};

const STATUS_ORDER: Record<MatchResult['status'], number> = { match: 0, review: 1, excluded: 2 };
const finite = (value: number | null): value is number => value !== null && Number.isFinite(value);
const stableIdOrder = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const amount = (value: number): string => value.toLocaleString('en-US', { maximumFractionDigits: 2 });

function budgetRange(requirement: ClientRequirement): string {
  const currency = requirement.currency && requirement.currency !== 'other' ? requirement.currency : 'Currency unconfirmed';
  const minimum = requirement.budget_min;
  const maximum = requirement.budget_max;
  if (finite(minimum) && finite(maximum)) return `${currency} ${amount(minimum)} – ${amount(maximum)}`;
  if (finite(maximum)) return `Up to ${currency} ${amount(maximum)}`;
  if (finite(minimum)) return `From ${currency} ${amount(minimum)}; maximum not provided`;
  return 'Budget not provided';
}

function assessBudget(listing: ListingSnapshot, requirement: ClientRequirement): RequirementAssessment['budget'] {
  const range_label = budgetRange(requirement);
  const unknown = (label: string): RequirementAssessment['budget'] => ({ status: 'unknown', headroom: null, label, range_label });
  const minimum = requirement.budget_min;
  const maximum = requirement.budget_max;
  const price = listing.asking_price;
  if (!finite(minimum) && !finite(maximum)) return unknown('Budget not provided; confirm the stated range.');
  if (!finite(price)) return unknown('Asking price is undisclosed; budget fit cannot be confirmed.');
  if (!requirement.currency || requirement.currency === 'other' || listing.currency !== requirement.currency) {
    return unknown('Budget and asking-price currencies differ or are unconfirmed; no FX comparison is available.');
  }

  const money = (value: number): string => `${requirement.currency} ${amount(value)}`;
  const headroom = finite(maximum) ? maximum - price : null;
  if (finite(maximum) && price > maximum) {
    return { status: 'above', headroom, range_label, label: `${money(price - maximum)} above the stated budget maximum.` };
  }
  if (finite(minimum) && price < minimum) {
    return { status: 'below', headroom, range_label, label: `${money(minimum - price)} below the stated budget range.` };
  }
  if (!finite(maximum)) return unknown('The asking price meets the stated minimum, but the budget maximum is missing; coverage is unconfirmed.');
  return {
    status: 'within', headroom, range_label,
    label: `${headroom === 0 ? 'At the stated budget maximum' : `${money(maximum - price)} below the stated budget maximum`}; within the stated range, excluding unspecified transaction costs.`,
  };
}

function assessTiming(listing: ListingSnapshot, requirement: ClientRequirement): RequirementAssessment['timing'] {
  if (!validDate(requirement.move_in_by)) {
    return { status: 'unknown', label: 'A complete move-in deadline has not been confirmed.' };
  }
  if (!validDate(listing.availability_date)) {
    return { status: 'unknown', label: `Availability by the move-in deadline ${requirement.move_in_by} has not been confirmed.` };
  }
  return listing.availability_date <= requirement.move_in_by
    ? { status: 'compatible', label: `Available ${listing.availability_date}, by the move-in deadline ${requirement.move_in_by}.` }
    : { status: 'conflict', label: `Available ${listing.availability_date}, after the move-in deadline ${requirement.move_in_by}.` };
}

function budgetOrder(a: RequirementAssessment, b: RequirementAssessment, askingPrice: number | null): number {
  const tier = (entry: RequirementAssessment): number => entry.budget.status === 'within' ? 0 : entry.budget.status === 'unknown' ? 2 : 1;
  const tierDifference = tier(a) - tier(b);
  if (tierDifference || tier(a) !== 1 || !finite(askingPrice)) return tierDifference;
  const gap = (entry: RequirementAssessment): number => entry.budget.status === 'above'
    ? Math.abs(entry.budget.headroom!)
    : Math.abs(entry.requirement.budget_min! - askingPrice);
  return gap(a) - gap(b);
}

function purchaseDateOrder(a: RequirementAssessment, b: RequirementAssessment): number {
  const dateA = a.requirement.purchase_by;
  const dateB = b.requirement.purchase_by;
  if (!validDate(dateA)) return validDate(dateB) ? 1 : 0;
  if (!validDate(dateB)) return -1;
  return stableIdOrder(dateA, dateB);
}

/** Groups original requirements without combining fields or changing evaluateMatch outcomes. */
export function buildClientGroups(listing: ListingSnapshot, requirements: ClientRequirement[], sort: ClientSort = 'conditions'): ClientGroup[] {
  const grouped = new Map<string, RequirementAssessment[]>();
  for (const requirement of requirements) {
    const assessments = grouped.get(requirement.client_id) ?? [];
    assessments.push({
      requirement,
      result: evaluateMatch(listing, requirement),
      budget: assessBudget(listing, requirement),
      timing: assessTiming(listing, requirement),
    });
    grouped.set(requirement.client_id, assessments);
  }
  const order = (a: RequirementAssessment, b: RequirementAssessment): number => {
    const status = STATUS_ORDER[a.result.status] - STATUS_ORDER[b.result.status];
    if (status) return status;
    return sort === 'budget' ? budgetOrder(a, b, listing.asking_price) : sort === 'purchase_date' ? purchaseDateOrder(a, b) : 0;
  };
  const groups: ClientGroup[] = [];
  for (const [client_id, assessments] of grouped) {
    assessments.sort((a, b) => order(a, b) || stableIdOrder(a.requirement.requirement_id, b.requirement.requirement_id));
    const primary = assessments[0];
    groups.push({ client_id, client_alias: primary.requirement.client_alias, status: primary.result.status, primary, requirements: assessments });
  }
  return groups.sort((a, b) => order(a.primary, b.primary) || stableIdOrder(a.client_id, b.client_id));
}

export function countClientGroups(groups: ClientGroup[]): { total: number; match: number; review: number; excluded: number } {
  const counts = { total: groups.length, match: 0, review: 0, excluded: 0 };
  for (const group of groups) counts[group.status] += 1;
  return counts;
}
