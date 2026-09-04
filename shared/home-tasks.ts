import { ruleAssistant, type AssistantResult } from './assistant';
import { convertArea, getAreaRangeError, requirementTextReview, requirementsToFilters, validDate, type Filters } from './matching';
import { resolveRequirementArea } from './requirement-area';
import { EMPTY_CLIENT_DIRECTORY_FILTERS, clientDirectoryBudgetError, type ClientDirectoryFilters } from './client-directory';
import type { ClientRequirement } from './types';

export type HomeTask = 'property' | 'client' | 'create';
export type HomeRequirement = ClientRequirement & { area_max?: number | null };

export const HOME_TASKS: Record<HomeTask, { label: string; example: string; description: string }> = {
  property: { label: 'Find a Property', example: 'A ready 2 bedroom apartment in Dubai Marina, budget up to AED 2.8m, with parking.', description: 'Describe the home your client needs. Review the details, then explore matching properties.' },
  client: { label: 'Find a Client', example: 'Find company clients looking for apartments in Dubai Marina, budget AED 2m to 3m.', description: 'Search your visible clients by name, preferred location, budget or property type.' },
  create: { label: 'Create a Private Client', example: 'Client name: Alex. A 2 bedroom apartment in Dubai Marina, budget AED 2.8m, for self use.', description: 'Capture a client’s needs, review the details and confirm before saving a private client.' },
};

/** Only explicit names are extracted; task words and property descriptions never become names. */
export function extractClientName(text: string): string {
  const found = text.match(/(?:\b(?:client\s*(?:name|alias)|name|alias)\s*[:：]\s*|(?:客户姓名|客户名称|客户别名|姓名|别名)\s*[:：]?\s*)([^\n,，;；。.]+)/i)
    ?? text.match(/\b(?:find|search(?:\s+for)?)\s+(?:a\s+)?client\s+(?:named\s+|called\s+)?(?!in\b|with\b|looking\b)([^\n,，;；.]+?)(?=\s+(?:in|with|looking|budget)\b|[\n,，;；.]|$)/i)
    ?? text.match(/(?:查找|寻找|找)(?:名叫|姓名为)?客户\s*([^\n,，;；。.]+?)(?=(?:预算|偏好|想在|需要|寻找)|[\n,，;；。.]|$)/);
  return found?.[1]?.trim().replace(/^['“”"]|['“”"]$/g, '') ?? '';
}

const englishWarning = (message: string) => message.replace(/\s*（面积口径待确认）|\s*\(面积口径待确认\)/g, '');
const sizeUnit = '(sqft|sq\\.?\\s*ft|square feet|sqm|sq\\.?\\s*m|square met(?:er|re)s?|平方米|平米|平方英尺)';
const sizeNumber = '([\\d,]+(?:\\.\\d+)?)';
const sizeRangePattern = new RegExp(`${sizeNumber}\\s*(?:-|–|—|\\bto\\b|至|到)\\s*${sizeNumber}\\s*${sizeUnit}`, 'i');
const maximumSizePattern = new RegExp(`(?:\\b(?:no more than|at most|maximum(?: of)?|max|up to)|最多|不超过|至多|上限)\\s*${sizeNumber}\\s*${sizeUnit}`, 'i');
const sourceSize = (value: string, unit: string, to: ClientRequirement['area_unit']) => convertArea(Number(value.replaceAll(',', '')), /ft|feet|英尺/i.test(unit) ? 'sqft' : 'sqm', to ?? 'sqft');
const amountsDiffer = (actual: number | null | undefined, expected: number) => actual == null || Math.abs(actual - expected) > 1e-6;

/** Advisory comparisons only. Editing a number never erases the stated source condition. */
function numericReview(requirement: HomeRequirement): string[] {
  const text = requirement.raw_request;
  const warnings: string[] = [];
  const budget = text.match(/(?:\bbudget\b|预算)([^;；\n。]*)/i)?.[1]?.split(/\.(?=\s|$)|[,，](?!\d{3}(?:\D|$))/)[0];
  if (budget) {
    const amount = (value: string, suffix = '') => Number(value.replaceAll(',', '')) * ({ m: 1e6, million: 1e6, k: 1e3, thousand: 1e3, 万: 1e4, 亿: 1e8 }[suffix.toLowerCase()] ?? 1);
    const number = '([\\d,]+(?:\\.\\d+)?)\\s*(million|thousand|[mk万亿])?';
    const range = budget.match(new RegExp(`(?:AED\\s*)?${number}\\s*(?:-|–|—|\\bto\\b|至|到)\\s*(?:AED\\s*)?${number}`, 'i'));
    const single = budget.match(new RegExp(number, 'i'));
    const currency = budget.match(/\b(AED|USD|EUR|GBP)\b/i)?.[1]?.toUpperCase();
    if (currency && currency !== requirement.currency) warnings.push('The budget currency differs from the original notes. Confirm the new currency and amount with the client.');
    else if (range && (amountsDiffer(requirement.budget_min, amount(range[1], range[2] ?? range[4])) || amountsDiffer(requirement.budget_max, amount(range[3], range[4] ?? range[2])))) warnings.push('The budget range differs from the original notes. Confirm the updated limits with the client.');
    else if (!range && single && amountsDiffer(requirement.budget_max, amount(single[1], single[2]))) warnings.push('The maximum budget differs from the original notes. Confirm the updated limit with the client.');
  }
  const bedroom = text.match(/\b(\d+|one|two|three|four|five|six)\s*[- ]?bed(?:room)?s?\b|([0-9一二两三四五六七八九十]+)\s*(?:居室?|卧室?|房)/i);
  if (bedroom) {
    const value = (bedroom[1] ?? bedroom[2]).toLowerCase();
    const count = /^\d+$/.test(value) ? Number(value) : ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 } as Record<string, number>)[value];
    if (count !== undefined && amountsDiffer(requirement.bedrooms_min, count)) warnings.push('The bedroom count differs from the original notes. Confirm the updated number and whether it is a minimum or an exact count.');
  }
  const range = text.match(sizeRangePattern), cap = !range && text.match(maximumSizePattern);
  if (range && (amountsDiffer(requirement.area_min, sourceSize(range[1], range[3], requirement.area_unit)) || amountsDiffer(requirement.area_max, sourceSize(range[2], range[3], requirement.area_unit)))) warnings.push('The size range differs from the original notes. Confirm the updated limits and measurement basis.');
  if (cap && amountsDiffer(requirement.area_max, sourceSize(cap[1], cap[2], requirement.area_unit))) warnings.push('The maximum size differs from the original notes. Confirm the updated limit and measurement basis.');
  return warnings;
}

/** A task-specific adapter on the existing rule engine, with no model or currency conversion. */
export async function prepareHomeRequirement(text: string, areas: string[]): Promise<AssistantResult & { requirement: HomeRequirement }> {
  const result = await ruleAssistant.extract(text, { areas });
  const requirement: HomeRequirement = { ...result.requirement, client_alias: extractClientName(text), area_max: null };
  const warnings = result.warnings.map(englishWarning).filter(message => !/^Rules demo only|^No exact area name|^No budget|currency is missing|^A single budget amount|^No structured conditions/.test(message));
  if (requirement.currency && requirement.currency !== 'AED') {
    requirement.budget_min = null;
    requirement.budget_max = null;
    warnings.push('The stated budget is not in AED. Enter an agreed AED budget; no exchange rate was applied.');
  }
  requirement.currency = 'AED';
  // Unit conversion is exact and disclosed; it never supplies a measurement basis.
  if (requirement.area_unit === 'sqm' && requirement.area_min !== null) requirement.area_min = convertArea(requirement.area_min, 'sqm', 'sqft');
  const sizeRange = text.match(sizeRangePattern);
  if (sizeRange) {
    const multiplier = /ft|feet|英尺/i.test(sizeRange[3]) ? 1 : convertArea(1, 'sqm', 'sqft');
    requirement.area_min = Number(sizeRange[1].replace(/,/g, '')) * multiplier;
    requirement.area_max = Number(sizeRange[2].replace(/,/g, '')) * multiplier;
  }
  const maximumSize = !sizeRange && text.match(maximumSizePattern);
  if (maximumSize) {
    requirement.area_max = Number(maximumSize[1].replace(/,/g, '')) * (/ft|feet|英尺/i.test(maximumSize[2]) ? 1 : convertArea(1, 'sqm', 'sqft'));
    // The adapter deliberately did not invent a minimum for an upper bound.
    requirement.area_min = null;
  }
  requirement.area_unit = 'sqft';
  // Hidden selectors are not a reason to infer a client's area basis from a property.
  if (!requirement.area_basis) requirement.area_basis = 'unknown';
  const currentWarnings = warnings.map(message => maximumSize && /^A maximum or exact area is not supported/.test(message)
    ? 'The stated maximum size has been extracted. Confirm the measurement basis before comparing sizes.'
    : sizeRange && /^The stated area is used as a search minimum/.test(message)
      ? 'The stated size range has been extracted. Confirm the measurement basis before comparing sizes.' : message);
  requirement.missing_questions = [...new Set(currentWarnings)].join('\n') || null;
  return { ...result, requirement, warnings: [...new Set(currentWarnings)] };
}

export async function prepareClientSearch(text: string, areas: string[]): Promise<{ filters: ClientDirectoryFilters; warnings: string[] }> {
  const parsed = await prepareHomeRequirement(text, areas);
  const requirement = parsed.requirement;
  const scopes = [
    { name: 'unassigned', test: /\bunassigned\b|未分配/i },
    { name: 'private', test: /\bprivate\b|私有|私客/i },
    { name: 'company', test: /\bcompany\b|公司客户|公客/i },
  ] as const;
  const matched = scopes.filter(scope => scope.test.test(text));
  // Unassigned is a company subset; the phrase "unassigned company clients" is one scope.
  const selected = matched.filter(scope => scope.name !== 'company' || !matched.some(item => item.name === 'unassigned'));
  const warnings = parsed.warnings.filter(message => /currency|currencies|budget|Budget|exclusion/.test(message));
  if (selected.length > 1) warnings.push('More than one client type was mentioned. Review Client Type.');
  if ((requirement.preferred_areas?.length ?? 0) > 1) warnings.push('Several locations were mentioned. The first location is selected; review the location before searching.');
  if ((requirement.property_types?.length ?? 0) > 1) warnings.push('Several property types were mentioned. The first type is selected; review the property type before searching.');
  return { filters: {
    ...EMPTY_CLIENT_DIRECTORY_FILTERS, name: extractClientName(text),
    preferred_location: requirement.preferred_areas?.[0] ?? '',
    budget_min: requirement.budget_min, budget_max: requirement.budget_max,
    property_type: requirement.property_types?.[0] ?? '',
    visibility: selected.length === 1 ? selected[0].name : 'all',
  }, warnings };
}

export function missingHomeFields(task: Exclude<HomeTask, 'client'>, requirement: HomeRequirement): string[] {
  return [
    ...(task === 'create' && !requirement.client_alias.trim() ? ['client_alias'] : []),
    ...(!requirement.preferred_areas?.length ? ['preferred_areas'] : []),
    ...(requirement.budget_max === null ? ['budget_max'] : []),
    ...(!requirement.property_types?.length ? ['property_types'] : []),
    ...(requirement.bedrooms_min === null ? ['bedrooms_min'] : []),
  ];
}

export function homeRequirementErrors(requirement: HomeRequirement): string[] {
  return [
    clientDirectoryBudgetError(requirement), getAreaRangeError(requirement),
    requirement.bedrooms_min !== null && (!Number.isInteger(requirement.bedrooms_min) || requirement.bedrooms_min < 0) ? 'Enter a whole number of bedrooms, zero or greater.' : null,
    ...(['purchase_by', 'move_in_by'] as const).map(field => requirement[field] && !validDate(requirement[field]) ? 'Enter valid calendar dates.' : null),
  ].filter((message): message is string => Boolean(message));
}

export function hasClientSearchCondition(filters: ClientDirectoryFilters): boolean {
  return Boolean(filters.name.trim() || filters.preferred_location.trim() || filters.property_type || filters.budget_min !== null || filters.budget_max !== null);
}

export function homeReviewQuestions(requirement: HomeRequirement): string[] {
  const area = resolveRequirementArea(requirement);
  return [...new Set([
    ...(requirement.missing_questions?.split('\n').map(value => value.trim()).filter(Boolean) ?? []),
    ...((requirement.area_min !== null || requirement.area_max != null) && area.status !== 'known'
      ? ['Area basis needs confirmation. Confirm how the client’s size is measured before comparing property sizes.'] : []),
    ...requirementTextReview(requirement).warnings,
    ...numericReview(requirement),
  ].map(englishWarning))];
}

export function homePropertyFilters(requirement: HomeRequirement): Filters {
  return { ...requirementsToFilters(requirement), area_max: requirement.area_max ?? null, currency: 'AED', area_unit: 'sqft' };
}
