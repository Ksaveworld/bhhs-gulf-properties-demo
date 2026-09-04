import { convertArea } from './matching';
import type { ClientRequirement, ListingSnapshot } from './types';

function presentationName(value: string, kind?: string): string {
  return kind === 'demo' ? value.replace(/^demo(?:\s*[-–—:]\s*|\s+)/i, '').trim() || value : value;
}

/** Presentation only. Original titles and evidence remain intact in the imported record. */
export function propertyDisplayName(listing: Pick<ListingSnapshot, 'building_name' | 'title' | 'area_name'> & Partial<Pick<ListingSnapshot, 'data_kind'>>): string {
  const name = listing.building_name?.trim() || listing.title.trim() || listing.area_name || 'Property name not supplied';
  return presentationName(name, listing.data_kind);
}

export function clientDisplayName(requirement: Pick<ClientRequirement, 'client_alias' | 'data_kind'>): string {
  return presentationName(requirement.client_alias, requirement.data_kind);
}

export function propertyAreaSqft(listing: Pick<ListingSnapshot, 'area_value' | 'area_unit'>): number | null {
  return listing.area_value === null || !listing.area_unit ? null : convertArea(listing.area_value, listing.area_unit, 'sqft');
}
