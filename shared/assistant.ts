import { parseHardConstraints, validDate } from './matching';
import type { AreaBasis, ClientRequirement, Currency } from './types';

export interface AssistantResult {
  mode: 'rules';
  requirement: ClientRequirement;
  warnings: string[];
  extracted_fields: string[];
}
export interface AssistantAdapter {
  extract(text: string, context: { areas: string[] }): Promise<AssistantResult>;
}

export function createEmptyRequirement(raw_request = ''): ClientRequirement {
  return {
    requirement_id: 'DRAFT-REQUIREMENT', client_id: 'DRAFT-CLIENT', client_alias: 'Sales request draft', sales_owner: null,
    raw_request, budget_min: null, budget_max: null, currency: null, budget_constraint: 'unknown',
    preferred_areas: null, property_types: null, bedrooms_min: null, area_min: null, area_unit: null, area_basis: null,
    purchase_purpose: 'unknown', market_preference: 'unknown', purchase_by: null, move_in_by: null,
    hard_constraints: null, soft_preferences: null, intent_evidence: null, missing_questions: null,
    data_kind: 'demo', source_name: 'Rules demo: sales-entered draft', source_ref: 'DEMO-RULE-EXTRACTION',
    source_date: null, captured_at: new Date().toISOString(), verification_status: 'needs_review',
    usage_status: 'pending', reviewed_by: null, notes: 'Unverified extraction draft. Rules mode; no language model call and no business approval.',
  };
}

function amount(value: string, suffix?: string): number {
  const multiplier = /^(?:m|million)$/i.test(suffix ?? '') ? 1_000_000 : /^(?:k|thousand)$/i.test(suffix ?? '') ? 1_000 : suffix === '万' ? 10_000 : suffix === '亿' ? 100_000_000 : 1;
  return Number(value.replace(/,/g, '')) * multiplier;
}
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function mentions(text: string, pattern: RegExp): { positive: boolean; negative: boolean } {
  let positive = false, negative = false;
  for (const found of text.matchAll(new RegExp(pattern.source, 'gi'))) {
    const prefix = text.slice(Math.max(0, (found.index ?? 0) - 60), found.index);
    const negated = /(?:\b(?:not|no|without|avoid|exclude|except)\s+(?:(?:a|an|any|for|in|of|consider(?:ing)?)\s+){0,3}|不要|不考虑|排除|不是|不用于|不接受)\s*$/i.test(prefix);
    if (negated) negative = true;
    else positive = true;
  }
  return { positive, negative };
}

/** Replace this adapter to add a model. This implementation deliberately performs no network call. */
export const ruleAssistant: AssistantAdapter = {
  async extract(text, context) {
    const requirement = createEmptyRequirement(text);
    const warnings: string[] = ['Rules demo only. Review the original request and every extracted condition before applying filters.'];
    const fields = new Set<string>();
    const set = <K extends keyof ClientRequirement>(key: K, value: ClientRequirement[K]) => { requirement[key] = value; fields.add(key); };
    if (!text.trim()) {
      warnings.push('No request text was provided.');
      return { mode: 'rules', requirement, warnings, extracted_fields: [] };
    }

    // An observed listing price is not a client budget. Prefer the explicit budget clause.
    const budgetMarker = /\bbudget\b|预算/i.exec(text);
    const budgetText = budgetMarker ? text.slice(budgetMarker.index).split(/\.(?=\s|$)|[;；\n。]/)[0] : text;
    const observedPriceOnly = !budgetMarker && /\b(?:saw|listed|listing|asking|price|priced|sold)\b|看到|挂牌|报价|成交|价格/i.test(text);
    const currencies = [...budgetText.matchAll(/\b(AED|USD|EUR|GBP)\b/gi)].map((m) => m[1].toUpperCase() as Currency);
    if (/迪拉姆/.test(budgetText)) currencies.push('AED');
    const uniqueCurrencies = [...new Set(currencies)];
    if (uniqueCurrencies.length === 1 && !observedPriceOnly) set('currency', uniqueCurrencies[0]);
    if (uniqueCurrencies.length > 1) warnings.push('Multiple currencies were mentioned. Budget extraction needs manual confirmation; no currency conversion is performed.');

    const range = budgetText.match(/(?:\b(?:budget|between|from)\s*[:：]?\s*|预算\s*[:：]?\s*)?(?:(?:AED|USD|EUR|GBP)\s*)?([\d,]+(?:\.\d+)?)\s*(million|thousand|[mk万亿])?\s*(?:(?:AED|USD|EUR|GBP|迪拉姆)\s*)?(?:-|–|—|\bto\b|至|到)\s*(?:(?:AED|USD|EUR|GBP)\s*)?([\d,]+(?:\.\d+)?)\s*(million|thousand|[mk万亿])?\s*(?:AED|USD|EUR|GBP|迪拉姆)?/i);
    if (!observedPriceOnly && range && uniqueCurrencies.length <= 1 && (range[2] || range[4] || /budget|预算|AED|USD|EUR|GBP/i.test(range[0]))) {
      const low = amount(range[1], range[2] ?? range[4]), high = amount(range[3], range[4] ?? range[2]);
      if (Number.isFinite(low) && Number.isFinite(high) && low <= high) { set('budget_min', low); set('budget_max', high); }
      else warnings.push('Budget range is invalid. Enter a minimum no greater than the maximum.');
    } else if (!observedPriceOnly && uniqueCurrencies.length <= 1) {
      const prefix = budgetText.match(/\b(?:AED|USD|EUR|GBP)\s*([\d,]+(?:\.\d+)?)\s*(million|thousand|[mk万亿])?/i);
      const postfix = budgetText.match(/([\d,]+(?:\.\d+)?)\s*(million|thousand|[mk万亿])?\s*(?:AED|USD|EUR|GBP|迪拉姆)/i);
      const budget = budgetText.match(/(?:\bbudget\b|预算|不超过|上限)\s*(?:is|of|up to|under|最多|为|是|不超过|上限|[:：])?\s*([\d,]+(?:\.\d+)?)\s*(million|thousand|[mk万亿])?/i);
      const scaled = budgetText.match(/([\d,]+(?:\.\d+)?)\s*(万|亿)(?!\s*(?:平|平方))/);
      const found = prefix ?? postfix ?? budget ?? scaled;
      if (found) {
        set('budget_max', amount(found[1], found[2]));
        warnings.push('A single budget amount is used as the search maximum. Confirm the intended range and whether fees are included.');
      }
    }
    if (observedPriceOnly) warnings.push('Observed listing prices were not treated as a client budget. Confirm the budget separately.');
    if (requirement.budget_max !== null || requirement.budget_min !== null) {
      const budgetConstraintText = budgetText.split(/[,，](?!\d{3}(?:\D|$))|[;；\n。]/)[0];
      if (/\b(?:flexible|negotiable|can stretch)\b|可协商|可商量|预算可调|预算浮动/i.test(budgetConstraintText)) set('budget_constraint', 'flexible');
      else if (/\b(?:hard (?:budget|cap|limit)|strict(?:ly)?|cannot exceed|must not exceed|no more than|max(?:imum)? budget|budget cap)\b|不超过|不可超|硬性上限|预算上限不可/i.test(budgetConstraintText)) set('budget_constraint', 'hard');
      if (!requirement.currency) warnings.push('Budget currency is missing or ambiguous. No default currency was assumed.');
    } else warnings.push('No budget was recognized. Enter the budget manually if it was provided.');

    const excludedAreaRequests: string[] = [];
    const areas = context.areas.filter((area) => {
      const escaped = escapeRegExp(area);
      const found = new RegExp(`(?:^|[^A-Za-z0-9])(${escaped})(?=$|[^A-Za-z0-9])`, 'i').exec(text);
      if (!found) return false;
      const before = text.slice(Math.max(0, found.index - 32), found.index + found[0].indexOf(found[1]));
      if (/(?:\b(?:not|avoid|exclude|except)\s*(?:(?:consider(?:ing)?|include|want|in)\s*)?|不要|不考虑|排除|不在)\s*$/i.test(before)) {
        excludedAreaRequests.push(`Excluded area requested: ${area}`);
        warnings.push(`Area exclusion needs manual review: ${area}. It was not converted into a positive area preference.`);
        return false;
      }
      return true;
    });
    if (areas.length) set('preferred_areas', [...new Set(areas)]);
    else warnings.push('No exact area name from the loaded inventory was recognized. Area aliases are not assumed.');

    const bedroom = text.match(/\b(\d+)\s*(?:[- ]?bed(?:room)?s?|br)\b/i) ?? text.match(/([0-9一二三四五六七八九两]+)\s*(?:居|卧|房)(?:室)?/);
    const englishBedroom = text.match(/\b(one|two|three|four|five|six)\s*[- ]?bed(?:room)?s?\b/i);
    const bedroomUpperBound = text.match(/\b(?:no more than|at most|maximum(?: of)?|max|up to|less than|fewer than|exactly|only)\s+(?:\d+|one|two|three|four|five|six)\s*[- ]?(?:bed(?:room)?s?|br)\b|(?:最多|不超过|至多|仅|只要)[0-9一二三四五六七八九两]+\s*(?:居|卧|房)(?:室)?/i);
    const studio = mentions(text, /\bstudio\b|开间/);
    if (bedroomUpperBound) warnings.push('A maximum or exact bedroom count is not supported by the minimum-bedroom field. Confirm this hard condition manually.');
    else if (studio.positive && !studio.negative) set('bedrooms_min', 0);
    else if (bedroom || englishBedroom) {
      const value = bedroom?.[1] ?? englishBedroom![1].toLowerCase();
      const words: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
      const count = /^\d+$/.test(value) ? Number(value) : words[value];
      if (count !== undefined) set('bedrooms_min', count);
    }
    const propertyTypes: string[] = [];
    const excludedPropertyTypes: string[] = [];
    for (const [type, regex] of Object.entries({ apartment: /\bapartments?\b|公寓/i, villa: /\bvillas?\b|独栋别墅/i, townhouse: /\btownhouses?\b|联排/i, penthouse: /\bpenthouses?\b|顶层复式/i, land: /\bland\b|土地/i })) {
      const polarity = mentions(text, regex);
      if (polarity.positive && !polarity.negative) propertyTypes.push(type);
      if (polarity.negative) excludedPropertyTypes.push(`Excluded property type requested: ${type}`);
    }
    if (propertyTypes.length) set('property_types', propertyTypes);

    const areaSize = text.match(/([\d,]+(?:\.\d+)?)\s*(sqft|sq\.?\s*ft|square feet|sqm|sq\.?\s*m|square met(?:er|re)s?|平方米|平米|平方英尺)/i);
    const areaPrefix = areaSize ? text.slice(Math.max(0, (areaSize.index ?? 0) - 45), areaSize.index) : '';
    const areaUpperBound = areaPrefix.match(/(?:\b(?:no more than|at most|maximum(?: of)?|max|up to|less than|exactly|only)|最多|不超过|至多|仅|只要)\s*$/i);
    if (areaSize && areaUpperBound) warnings.push('A maximum or exact area is not supported by the minimum-area field. Confirm this hard condition manually.');
    else if (areaSize) {
      set('area_min', Number(areaSize[1].replace(/,/g, '')));
      set('area_unit', /ft|feet|英尺/i.test(areaSize[2]) ? 'sqft' : 'sqm');
      warnings.push('The stated area is used as a search minimum. Confirm its meaning and area basis.');
    }
    const ownUseMentions = mentions(text, /\b(?:self[- ]use|own use|live in|family home)\b|自住/);
    const investmentMentions = mentions(text, /\binvest(?:ment|ing)?\b|投资/);
    const ownUse = ownUseMentions.positive && !ownUseMentions.negative;
    const investment = investmentMentions.positive && !investmentMentions.negative;
    if (ownUse || investment) set('purchase_purpose', ownUse && investment ? 'mixed' : ownUse ? 'self_use' : 'investment');
    const marketNegation = /\b(?:not|no|avoid|exclude)\s+(?:ready|completed|resale|off[-_ ]?plan)\b|\b(?:ready|completed|resale|off[-_ ]?plan)\s+(?:is\s+)?not\b|(?:不要|不考虑|排除|不接受)(?:现房|期房)/i.test(text);
    const ready = !marketNegation && /\b(?:ready|completed|resale)\b|现房/i.test(text), offPlan = !marketNegation && /\boff[-_ ]?plan\b|期房/i.test(text);
    if (marketNegation) warnings.push('A negated ready / off-plan condition requires manual selection; no positive preference was inferred.');
    if (ready && offPlan) {
      if (/\b(?:either|both|or)\b|均可|都可|都行/.test(text.toLowerCase())) set('market_preference', 'either');
      else warnings.push('Ready and off-plan were both mentioned; select the intended preference.');
    } else if (ready || offPlan) set('market_preference', ready ? 'ready' : 'off_plan');

    const dates = [...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b|\d{4}年\d{1,2}月\d{1,2}日/g)];
    for (const found of dates) {
      const normalized = found[0].replace(/(\d{4})年(\d{1,2})月(\d{1,2})日/, (_, year, month, day) => `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
      if (!validDate(normalized)) { warnings.push(`Invalid full date: ${found[0]}`); continue; }
      const prefix = text.slice(Math.max(0, (found.index ?? 0) - 60), found.index).split(/[,，;；\n]/).at(-1) ?? '';
      if (/move[- ]?in|occupy|入住|交付/i.test(prefix)) set('move_in_by', normalized);
      else if (/buy|purchas(?:e|ing)|complete|购买|买房|购房/i.test(prefix)) set('purchase_by', normalized);
      else warnings.push(`Date ${normalized} has no recognized purpose. Specify purchase date or move-in date.`);
    }
    if (/\b(?:ASAP|next (?:week|month|year)|this (?:month|quarter|year)|Q[1-4])\b|尽快|下周|下月|明年|本季度|今年|季度/i.test(text)) warnings.push('Relative dates and quarters remain in the original request; no complete date was invented.');

    // A period followed by whitespace/end terminates a sentence; decimal points do not.
    const sentences = text.split(/\.(?=\s|$)|[;；\n。]/);
    const hardParts = [...excludedAreaRequests, ...excludedPropertyTypes, ...sentences.flatMap((sentence) => [...sentence.matchAll(/(?:\bmust\b|\brequire(?:d)?\b|必须|硬性条件)\s*[^,，]+/gi)].map((m) => m[0].trim()))];
    if (bedroomUpperBound) hardParts.push(bedroomUpperBound[0]);
    if (studio.negative) hardParts.push('Excluded layout requested: studio');
    if (areaSize && areaUpperBound) hardParts.push(`${areaUpperBound[0].trim()} ${areaSize[0]}`);
    if (ownUseMentions.negative || investmentMentions.negative) warnings.push('Negated purchase-purpose wording was not treated as a positive purpose. Check the original request.');
    if (marketNegation) hardParts.push('Negated ready / off-plan condition: check the original request.');
    const softParts = sentences.flatMap((sentence) => [...sentence.matchAll(/(?:\bprefer(?:red|ably)?\b|\bnice to have\b|偏好|最好)\s*[^,，]+/gi)].map((m) => m[0].trim()));
    const basis = text.match(/\b(?:area\s*basis\s*:\s*)?(built_up|internal|gross|land)\s*(?:area|basis)?\b/i);
    if (basis && requirement.area_min !== null) set('area_basis', basis[1].toLowerCase() as AreaBasis);
    if (/建筑面积/.test(text) && requirement.area_min !== null && !basis) set('area_basis', 'built_up');
    if (hardParts.length) set('hard_constraints', [...new Set(hardParts)].join('; '));
    if (softParts.length) set('soft_preferences', softParts.join('; '));
    const parsedHard = parseHardConstraints(requirement.hard_constraints);
    if (parsedHard.unknowns.length) warnings.push(`Hard conditions need manual confirmation: ${parsedHard.unknowns.join('; ')}`);
    if (requirement.area_min !== null && !requirement.area_basis) warnings.push('Area basis needs confirmation (面积口径待确认). Confirm internal / gross / built_up / land before applying an area filter.');
    const intent = text.split(/[;；\n。]/).find((part) => /\b(?:schedule|arrange|book)\b[^.]*\bviewing\b|约看|安排看房|预约看房/i.test(part));
    if (intent) set('intent_evidence', intent.trim());
    if (!fields.size) warnings.push('No structured conditions were recognized. The original request is preserved; enter conditions manually.');
    requirement.missing_questions = warnings.filter((warning) => /missing|ambiguous|not assumed|unknown|manual confirmation|No budget|No exact area/i.test(warning)).join(' ') || null;
    return { mode: 'rules', requirement, warnings, extracted_fields: [...fields] };
  },
};
