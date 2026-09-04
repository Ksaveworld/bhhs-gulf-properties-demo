import { convertArea } from './matching';
import type { ListingSnapshot } from './types';

/** Presentation only. Original titles and evidence remain intact in the imported record. */
export function propertyDisplayName(listing: Pick<ListingSnapshot, 'building_name' | 'title' | 'area_name'>): string {
  return listing.building_name?.trim() || listing.title.trim() || listing.area_name || 'Property name not supplied';
}

export function propertyAreaSqft(listing: Pick<ListingSnapshot, 'area_value' | 'area_unit'>): number | null {
  return listing.area_value === null || !listing.area_unit ? null : convertArea(listing.area_value, listing.area_unit, 'sqft');
}
