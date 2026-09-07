import type { ClientRequirement, Dataset, ListingSnapshot, ListingTransactionLink, SourceRecord, Transaction } from './types';
import { demoProperties } from './prototype-demo';
import { createEmptyRequirement } from './assistant';

const captured = '2026-03-12T09:00:00.000Z';
const source = (id: string): SourceRecord => ({
  data_kind: 'demo', source_name: 'Simulated property and buyer records', source_ref: `SIMULATED:${id}`,
  source_date: '2026-03-12', captured_at: captured, verification_status: 'verified', usage_status: 'approved',
  reviewed_by: 'Demo fixture consistency check', notes: 'User-authorized fictional data for demonstration. Not externally verified market or customer evidence.',
});
const specs = {
  'frond-n': { size: 8500, beds: 4, listed: '2025-12-17', amenities: ['private_beach', 'pool', 'garden', 'parking', 'sea_view'], history: [11.8, 16.4], comps: [20.8, 21.6, 22.4], compSizes: [9000, 9300, 9420], compBeds: [5, 5, 6], buyers: ['Leila Rahman', 'Omar Darwish'] },
  'frond-k': { size: 7200, beds: 5, listed: '2026-02-01', amenities: ['pool', 'garden', 'parking', 'staff_accommodation'], history: [9.4, 12.6], comps: [16.9, 17.4, 18.2], compSizes: [6900, 7400, 7800], compBeds: [5, 5, 5], buyers: ['Nadia Saleh', 'Daniel Mercer'] },
  'sector-e': { size: 11200, beds: 6, listed: '2026-01-20', amenities: ['pool', 'garden', 'parking', 'study', 'staff_accommodation'], history: [13.5, 18.9], comps: [22, 23.2, 24], compSizes: [10600, 11500, 12200], compBeds: [6, 6, 7], buyers: ['Sara Khoury', 'Adam Bennett'] },
} as const;
export const isPrototypeListing = (id: string) => Object.hasOwn(specs, id);

/** The shortlist demo uses its location-specific buyer cohort, then applies the unchanged matching rules. */
export function propertyClientRequirements(listing: ListingSnapshot, requirements: ClientRequirement[]) {
  return isPrototypeListing(listing.listing_id) ? requirements.filter(req => req.preferred_areas?.includes(listing.area_name)) : requirements;
}

/** Complete fictional detail fixtures, kept distinct from imported property identities. */
export function prototypeListing(id: string): ListingSnapshot | null {
  const item = demoProperties.find(property => property.id === id);
  if (!item || !isPrototypeListing(id)) return null;
  const spec = specs[id as keyof typeof specs];
  return {
    ...source(id), snapshot_id: `PROTOTYPE-${id}`, listing_id: id, property_id: `SIM-PROPERTY-${id}`,
    title: item.name, building_name: item.name, area_name: item.address, unit_ref: `SIM-${id.toUpperCase()}`,
    property_type: 'villa', bedrooms: spec.beds, asking_price: item.asking * 1_000_000, currency: 'AED',
    area_value: spec.size, area_unit: 'sqft', area_basis: 'built_up', market_segment: 'ready', listing_status: 'active',
    listed_at: spec.listed, availability_date: id === 'frond-k' ? '2026-03-12' : '2026-03-15', amenities: [...spec.amenities],
    evidence_excerpt: `${item.description} ${item.gap}`,
  };
}

export function prototypeDetailRecords() {
  const listing_snapshots = demoProperties.map(p => prototypeListing(p.id)!);
  const transactions: Transaction[] = [], listing_transaction_links: ListingTransactionLink[] = [], client_requirements: ClientRequirement[] = [];
  for (const row of listing_snapshots) {
    const spec = specs[row.listing_id as keyof typeof specs];
    for (const [index, amount] of [...spec.history, ...spec.comps].entries()) {
      const own = index < 2, comparableIndex = index - 2;
      const id = `SIM-T-${row.listing_id}-${index + 1}`;
      const date = own ? ['2019-06-18', '2022-08-24'][index] : ['2026-01-18', '2025-12-12', '2025-11-08'][comparableIndex];
      const name = own ? row.title : `${row.area_name} · Comparable villa ${comparableIndex + 1}`;
      const difference = own ? null : `${spec.compBeds[comparableIndex]} bedrooms vs ${row.bedrooms}; ${spec.compSizes[comparableIndex].toLocaleString('en-US')} vs ${spec.size.toLocaleString('en-US')} sq ft built-up. ${row.listing_id === 'frond-n' && comparableIndex === 2 ? 'Sea-view example. ' : ''}Separate fictional property; no adjustment or valuation is implied.`;
      transactions.push({ ...source(id), transaction_id: id, source_record_id: id,
        property_id: own ? row.property_id : `SIM-COMP-${row.listing_id}-${comparableIndex + 1}`,
        record_type: 'sale', transaction_scope: 'whole_unit', transaction_date: date, date_basis: 'registration',
        amount: amount * 1_000_000, currency: 'AED', area_name: row.area_name, building_name: name,
        unit_ref: own ? row.unit_ref : `SIM-COMP-${row.listing_id}-${comparableIndex + 1}`, property_type: 'villa',
        bedrooms: own ? row.bedrooms : spec.compBeds[comparableIndex], area_value: own ? spec.size : spec.compSizes[comparableIndex],
        area_unit: 'sqft', area_basis: 'built_up', registration_segment: 'ready', source_date: date,
        evidence_excerpt: `Simulated completed whole-villa sale: ${name}, AED ${amount}m, ${date}. Fictional record, not a real registry extract.`,
      });
      listing_transaction_links.push({ link_id: `SIM-LINK-${row.listing_id}-${index + 1}`, listing_id: row.listing_id, transaction_id: id,
        relation_type: own ? 'exact_property' : 'comparable',
        match_basis: own ? `Same fictional property identity ${row.property_id} and unit ${row.unit_ref}.` : 'Separate fictional villa in the same location, ready market, AED and built-up area basis.',
        differences: difference, pricing_eligible: 'yes', evidence_refs: `SIMULATED:${id}`, verification_status: 'verified',
        reviewed_by: 'Demo fixture consistency check', reviewed_at: captured, data_kind: 'demo', notes: 'Simulated association only; not verified real-world evidence.',
      });
    }
    spec.buyers.forEach((name, index) => {
      const id = `SIM-BUYER-${row.listing_id}-${index + 1}`;
      client_requirements.push({ ...createEmptyRequirement(''), ...source(id), requirement_id: `${id}-REQ`, client_id: id, client_alias: name,
        sales_owner: 'Demo sales adviser', budget_min: (row.asking_price! / 1e6 - 3) * 1e6,
        budget_max: row.asking_price! + (index === 0 ? 1_000_000 : -500_000), budget_constraint: index === 0 ? 'hard' : 'flexible',
        currency: 'AED', preferred_areas: [row.area_name], property_types: ['villa'], bedrooms_min: spec.beds,
        area_min: spec.size - 1000, area_max: spec.size + 1500, area_unit: 'sqft', area_basis: 'built_up',
        purchase_purpose: index === 0 ? 'self_use' : 'investment', market_preference: 'ready', purchase_by: '2026-05-01', move_in_by: '2026-06-01',
        hard_constraints: 'pool; parking',
        soft_preferences: index === 0 ? null : 'Review annual running costs and renovation needs before agreeing the final offer.',
        intent_evidence: index === 0 ? 'Simulated buyer requested the floor plan and a family viewing.' : 'Simulated buyer asked to compare recent sales; any budget increase still needs confirmation.',
        missing_questions: index === 0 ? null : 'Confirm the acceptable budget increase and payment arrangements.',
        raw_request: `Fictional buyer brief for ${name}. Ready villa in ${row.area_name}; pool and parking required. ${index === 0 ? 'Family viewing to be arranged.' : 'Compare sale evidence before confirming a flexible budget.'}`,
      });
    });
  }
  return { listing_snapshots, transactions, listing_transaction_links, client_requirements };
}

/** Augment only the fixed demo. Product datasets and the original input objects stay untouched. */
export function withPrototypeDetails(dataset: Dataset): Dataset {
  if (dataset.meta.mode !== 'demo') return dataset;
  const extra = prototypeDetailRecords();
  const append = <T,>(rows: T[], additional: T[], key: keyof T) => [...rows, ...additional.filter(row => !rows.some(existing => existing[key] === row[key]))];
  return { ...dataset,
    listing_snapshots: append(dataset.listing_snapshots, extra.listing_snapshots, 'snapshot_id'),
    transactions: append(dataset.transactions, extra.transactions, 'transaction_id'),
    listing_transaction_links: append(dataset.listing_transaction_links, extra.listing_transaction_links, 'link_id'),
    client_requirements: append(dataset.client_requirements, extra.client_requirements, 'requirement_id'),
  };
}
