import type { ClientRequirement } from './types';

export interface ConstraintSegmentReview {
  kind: 'equivalent' | 'conflict' | 'unrecognized';
  fields: string[];
  reason?: string;
}

const NUMBER = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';
const BEDROOM = '([0-9]+|[一二两三四五六七八九十])\\s*(?:居室?|卧室?|房)';
const UNIT = '(sqft|sq\\.?\\s*ft|平方英尺|sqm|sq\\.?\\s*m|平方米|平米)';
const MINIMUM = '(?:至少|不少于|不低于|不小于)';
const CURRENCY = '(AED|USD|EUR|GBP)';
const SUFFIX = '(K|M|万|亿)?';
const finite = (value: number | null): value is number => value !== null && Number.isFinite(value);
const clean = (text: string): string => text.trim().replace(/[。.!！]+$/u, '').trim();
const clauses = (text: string): string[] => text.split(/[;；\n。，]|,(?!\d{3}(?:\D|$))/u).map(clean).filter(Boolean);
const unitKey = (unit: string): string => /ft|英尺/i.test(unit) ? 'sqft' : 'sqm';
const count = (value: string): number => /^\d+$/.test(value) ? Number(value) : ({ 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 } as Record<string, number>)[value];
const multipliers: Record<string, number> = { k: 1000, m: 1000000, 万: 10000, 亿: 100000000 };
const numeric = (value: string, suffix = ''): number => Number(value.replaceAll(',', '')) * (multipliers[suffix.toLowerCase()] ?? 1);
const unknown = (fields: string[] = [], reason?: string): ConstraintSegmentReview => ({ kind: 'unrecognized', fields, ...(reason ? { reason } : {}) });

function numberReview(field: 'budget_min' | 'budget_max' | 'bedrooms_min' | 'area_min', expected: number, requirement: ClientRequirement): ConstraintSegmentReview {
  if (!Number.isFinite(expected) || !finite(requirement[field])) return unknown([field], `${field} is missing or cannot be compared.`);
  return requirement[field] === expected
    ? { kind: 'equivalent', fields: [field] }
    : { kind: 'conflict', fields: [field], reason: `The original constraint and ${field} contain different numeric limits.` };
}

function combine(reviews: ConstraintSegmentReview[]): ConstraintSegmentReview {
  const fields = [...new Set(reviews.flatMap((review) => review.fields))];
  const issue = reviews.find((review) => review.kind === 'conflict') ?? reviews.find((review) => review.kind === 'unrecognized');
  return issue ? { ...issue, fields } : { kind: 'equivalent', fields };
}

function money(text: string): { value: number; currency: string } | null {
  const prefix = text.match(new RegExp(`^${CURRENCY}\\s*(${NUMBER})\\s*${SUFFIX}$`, 'i'));
  if (prefix) return { currency: prefix[1].toUpperCase(), value: numeric(prefix[2], prefix[3]) };
  const postfix = text.match(new RegExp(`^(${NUMBER})\\s*${SUFFIX}\\s*${CURRENCY}$`, 'i'));
  return postfix ? { currency: postfix[3].toUpperCase(), value: numeric(postfix[1], postfix[2]) } : null;
}

function moneyReview(field: 'budget_min' | 'budget_max', value: number, currency: string, requirement: ClientRequirement): ConstraintSegmentReview {
  if (!requirement.currency || requirement.currency === 'other' || requirement.currency !== currency) {
    return unknown([field, 'currency'], 'Budget currencies are missing or different; no currency conversion is assumed.');
  }
  return combine([numberReview(field, value, requirement), { kind: 'equivalent', fields: ['currency'] }]);
}

function areaReview(value: number, unit: string, requirement: ClientRequirement): ConstraintSegmentReview {
  if (!requirement.area_unit || unitKey(unit) !== requirement.area_unit) {
    return unknown(['area_min', 'area_unit'], 'Area units are missing or different; strict numeric equivalence is unconfirmed.');
  }
  // This only reviews repeated amount/unit wording. It does not establish an area basis or qualify a listing.
  return combine([numberReview('area_min', value, requirement), { kind: 'equivalent', fields: ['area_unit'] }]);
}

/** A whole hard-condition segment must be understood before any duplicate wording is considered equivalent. */
export function reviewConstraintSegment(segment: string, requirement: ClientRequirement): ConstraintSegmentReview {
  const text = clean(segment);
  const cap = text.match(/^预算(?:上限|不超过|不得超过|不能超过|最高|最多)(?:为|是|[:：])?\s*(.+)$/u);
  if (cap) {
    const parsed = money(cap[1]);
    if (!parsed) return unknown(['budget_max', 'currency'], 'The complete budget cap, currency and any additional qualifications need review.');
    const hardness: ConstraintSegmentReview = requirement.budget_constraint === 'hard'
      ? { kind: 'equivalent', fields: ['budget_constraint'] }
      : requirement.budget_constraint === 'flexible'
        ? { kind: 'conflict', fields: ['budget_constraint'], reason: 'An explicit budget cap conflicts with budget_constraint=flexible.' }
        : unknown(['budget_constraint'], 'Confirm that the explicit budget cap is a hard limit.');
    return combine([moneyReview('budget_max', parsed.value, parsed.currency, requirement), hardness]);
  }

  const bedrooms = text.match(new RegExp(`^${MINIMUM}\\s*${BEDROOM}(?:\\s*(?:和|及|与)\\s*(?:${MINIMUM}\\s*)?(${NUMBER})\\s*${UNIT})?$`, 'i'));
  if (bedrooms) {
    const reviews = [numberReview('bedrooms_min', count(bedrooms[1]), requirement)];
    if (bedrooms[2]) reviews.push(areaReview(numeric(bedrooms[2]), bedrooms[3], requirement));
    return combine(reviews);
  }
  const area = text.match(new RegExp(`^(?:面积\\s*)?${MINIMUM}\\s*(${NUMBER})\\s*${UNIT}$`, 'i'));
  if (area) return areaReview(numeric(area[1]), area[2], requirement);

  const market = text.match(/^(?:必须(?:是|为)?|只考虑|仅考虑)?(现房|期房)$/u);
  if (market) {
    const expected = market[1] === '现房' ? 'ready' : 'off_plan';
    if (requirement.market_preference === 'unknown') return unknown(['market_preference'], 'The stated market condition has not been selected in market_preference.');
    return requirement.market_preference === expected
      ? { kind: 'equivalent', fields: ['market_preference'] }
      : { kind: 'conflict', fields: ['market_preference'], reason: 'The explicit market condition differs from market_preference.' };
  }
  return unknown();
}

const AMENITIES: Record<string, string[]> = {
  parking: ['停车位', '车位', 'parking', 'car park'], garden: ['花园', 'garden'], pool: ['泳池', 'pool', 'swimming pool'],
  gym: ['健身房', 'gym'], balcony: ['阳台', 'balcony'], sea_view: ['海景', 'sea_view', 'sea view'], study: ['书房', 'study'],
};
const obligation = /(?:必须(?:有|带|配备)?|需要(?:有|带|配备)?|必需(?:有|带|配备)?)/u;

function amenityList(text: string): string[] | null {
  const rest = clean(text).replace(/^(?:必须(?:有|带|配备)?|需要(?:有|带|配备)?|必需(?:有|带|配备)?|must\s+(?:have|include)|requires?|amenities\s*:|偏好|最好)\s*/iu, '');
  const parts = rest.split(/\s*(?:和|及|与|、|&|,|\band\b)\s*/iu);
  const keys = parts.map((part) => Object.entries(AMENITIES).find(([, aliases]) => aliases.includes(part.trim().toLowerCase()))?.[0]);
  return keys.length && keys.every((key): key is string => Boolean(key)) ? [...new Set(keys)] : null;
}

function collectAmenities(text: string | null): Set<string> {
  return new Set(clauses(text ?? '').flatMap((part) => amenityList(part) ?? []));
}

function negatedOrConditional(text: string): boolean {
  return /(?:不需要|不要求|无需|不要|不接受|不考虑|并非|不是|如果|除非|或者|或是|可选|约|左右)/u.test(text);
}

/** Advisory review only. Original text, structured fields and hard constraints are never rewritten. */
export function reviewRawRequest(requirement: ClientRequirement): string[] {
  const warnings = new Set<string>();
  let explicitBudgetCap = false, explicitBudgetRange = false;
  const addReview = (review: ConstraintSegmentReview) => {
    if (review.kind !== 'equivalent' && review.reason) warnings.add(`Original request review: ${review.reason}`);
  };
  const hardAmenities = collectAmenities(requirement.hard_constraints);
  const softAmenities = collectAmenities(requirement.soft_preferences);
  for (const clause of clauses(requirement.raw_request)) {
    // This checker only recognizes Chinese wording; English grammar is handled by the assistant adapter.
    if (!/[\u3400-\u9fff]/u.test(clause)) continue;
    const uncertain = negatedOrConditional(clause);
    const complete = reviewConstraintSegment(clause, requirement);
    const combinedMinimum = complete.fields.includes('bedrooms_min') && complete.fields.includes('area_min');
    if (combinedMinimum) addReview(complete);
    const budgetStart = clause.indexOf('预算');
    if (budgetStart >= 0 && uncertain) warnings.add('Original request review: Budget wording is conditional or approximate; confirm the intended limits.');
    if (budgetStart >= 0 && !uncertain) {
      const budgetClause = clause.slice(budgetStart);
      const cap = reviewConstraintSegment(budgetClause, requirement);
      if (cap.fields.includes('budget_max')) { explicitBudgetCap = true; addReview(cap); }
      else {
        const range = budgetClause.match(new RegExp(`^预算(?:范围)?(?:为|是|[:：])?\\s*${CURRENCY}\\s*(${NUMBER})\\s*${SUFFIX}\\s*(?:-|–|—|至|到)\\s*(?:${CURRENCY}\\s*)?(${NUMBER})\\s*${SUFFIX}$`, 'i'));
        if (range) {
          explicitBudgetRange = true;
          const firstCurrency = range[1].toUpperCase();
          const secondCurrency = range[4]?.toUpperCase() ?? firstCurrency;
          if (firstCurrency !== secondCurrency) warnings.add('Original request review: Budget range mentions different currencies; confirm the range without assuming FX.');
          else {
            addReview(moneyReview('budget_min', numeric(range[2], range[3] ?? range[6]), firstCurrency, requirement));
            addReview(moneyReview('budget_max', numeric(range[5], range[6] ?? range[3]), firstCurrency, requirement));
          }
        } else if (money(budgetClause.replace(/^预算(?:为|是|[:：])?\s*/u, ''))) warnings.add('Original request review: A single budget amount does not specify a minimum, maximum or exact target; confirm its meaning.');
      }
    }

    const minimumBedrooms = [...clause.matchAll(new RegExp(`${MINIMUM}\\s*${BEDROOM}`, 'gi'))];
    const bedroomMentions = [...clause.matchAll(new RegExp(BEDROOM, 'gi'))];
    if (minimumBedrooms.length && minimumBedrooms.length === bedroomMentions.length && !uncertain && !/或/u.test(clause)) {
      for (const match of minimumBedrooms) addReview(numberReview('bedrooms_min', count(match[1]), requirement));
    } else if (bedroomMentions.length) {
      warnings.add('Original request review: Bedroom wording is exact, approximate or lacks a clear minimum; confirm whether bedrooms_min represents it.');
    }

    const minimumAreas = [...clause.matchAll(new RegExp(`${MINIMUM}\\s*(${NUMBER})\\s*${UNIT}`, 'gi'))];
    const suffixAreas = [...clause.matchAll(new RegExp(`(${NUMBER})\\s*${UNIT}\\s*以上`, 'gi'))];
    const areaMentions = [...clause.matchAll(new RegExp(`(${NUMBER})\\s*${UNIT}`, 'gi'))];
    const otherAreaOperator = new RegExp(`(?:最多|不超过|至多|仅|只要|正好|恰好|(?<!不)小于|(?<!不)少于|大于|多于)\\s*(${NUMBER})\\s*${UNIT}`, 'i').test(clause);
    if (combinedMinimum) {
      // The complete conjunction already supplies the explicit minimum operator for both quantities.
    } else if ((minimumAreas.length || suffixAreas.length) && !uncertain && !otherAreaOperator && !/或/u.test(clause)) {
      for (const match of [...minimumAreas, ...suffixAreas]) addReview(areaReview(numeric(match[1]), match[2], requirement));
    } else if (areaMentions.length) {
      warnings.add('Original request review: Area wording is approximate or lacks a clear minimum; confirm area_min, area_unit and area_basis.');
    }

    const required = obligation.exec(clause);
    if (required && !uncertain && !/(?:不|无|无需)$/u.test(clause.slice(0, required.index))) {
      const requiredText = clause.slice(required.index);
      const facilities = amenityList(requiredText);
      if (facilities) {
        for (const key of facilities) if (!hardAmenities.has(key)) {
          warnings.add(`Original request requires ${key}, but it ${softAmenities.has(key) ? 'appears only in soft_preferences and is missing from' : 'is not represented in'} hard_constraints.`);
        }
      } else {
        const market = reviewConstraintSegment(requiredText, requirement);
        if (market.fields.includes('market_preference')) {
          addReview(market);
          const represented = clauses(requirement.hard_constraints ?? '').some((part) => reviewConstraintSegment(part, requirement).fields.includes('market_preference'));
          if (!represented) warnings.add('Original request has an explicit required market condition missing from hard_constraints; a preference alone does not record its hard status.');
        } else warnings.add('Original request includes a required condition that is not fully understood; retain it for manual review.');
      }
    }

    if (/可接受期房/u.test(clause) && requirement.market_preference === 'off_plan') {
      warnings.add('Original request accepts off-plan property but does not state an exclusive off-plan restriction; review market_preference.');
    }
    if (/偏好(?:现房|期房)/u.test(clause)) {
      const preferred = /偏好现房/u.test(clause) ? 'ready' : 'off_plan';
      const hasHardMarket = clauses(requirement.hard_constraints ?? '').some((part) => /^(?:必须(?:是|为)?|只考虑|仅考虑)?(?:现房|期房)$/u.test(part));
      if (hasHardMarket && requirement.market_preference === preferred) warnings.add('Original request states a market preference, while hard_constraints make it mandatory; confirm before treating alternatives as hard conflicts.');
    }
    if (/(?:[一二两三四五六七八九十\d]+个?月内|年内|尽快|下周|下月|今年|明年).*(?:入住|购买|购房)|(?:入住|购买|购房).*(?:年内|尽快|下周|下月|今年|明年)/u.test(clause)) {
      warnings.add('Original request uses relative purchase or move-in timing; confirm complete dates without inventing a date or swapping their purposes.');
    }
  }
  if (explicitBudgetCap && !explicitBudgetRange && requirement.budget_min !== null) {
    warnings.add('Original request only establishes a budget cap; budget_min also contains a value. Confirm the source of that lower bound before treating it as the client’s requirement.');
  }
  return [...warnings];
}
