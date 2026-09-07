import type { ListingSnapshot } from './types';
import { demoProperties } from './prototype-demo';

/** Adapt the existing shortlist to the shared detail UI; never associate it with unrelated library rows. */
export function prototypeListing(id: string): ListingSnapshot | null {
  const item = demoProperties.find(property => property.id === id);
  if (!item) return null;
  return {
    snapshot_id: `PROTOTYPE-${id}`, listing_id: id, property_id: null,
    title: item.name, building_name: item.name, area_name: item.address, unit_ref: null,
    property_type: 'villa', bedrooms: id === 'frond-n' ? 4 : id === 'frond-k' ? 5 : 6,
    asking_price: item.asking * 1_000_000, currency: 'AED',
    area_value: null, area_unit: null, area_basis: null,
    market_segment: id === 'sector-e' ? 'unknown' : 'ready', listing_status: 'unknown',
    listed_at: null, availability_date: null, amenities: null,
    data_kind: 'demo', source_name: 'Existing demo shortlist', source_ref: '', source_date: null,
    captured_at: '', verification_status: 'needs_review', usage_status: 'approved', reviewed_by: null,
    evidence_excerpt: `${item.description} ${item.gap}`,
    notes: 'Fictional property from the existing demo shortlist. No verified transaction links are supplied.',
  };
}
