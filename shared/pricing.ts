import { validDate } from './matching';
import type { Dataset, ListingSnapshot, ListingTransactionLink, Transaction } from './types';

export interface LinkedTransaction { transaction: Transaction; link: ListingTransactionLink }
export interface PriceEvidence { history: LinkedTransaction[]; comparables: LinkedTransaction[]; excluded_count: number }

const hasText = (value: string | null): boolean => Boolean(value?.trim());

function exactIdentity(listing: ListingSnapshot, transaction: Transaction, link: ListingTransactionLink): boolean {
  if (!hasText(link.match_basis) || !hasText(link.evidence_refs)) return false;
  // Contradictory physical identities cannot be rescued by similar addresses.
  if (listing.property_id && transaction.property_id) return listing.property_id === transaction.property_id;
  // A source-reviewed stable unit reference is an alternate identity route.
  return Boolean(listing.unit_ref && transaction.unit_ref && listing.unit_ref === transaction.unit_ref &&
    listing.building_name && listing.building_name === transaction.building_name && listing.area_name === transaction.area_name &&
    /\b(?:unit|identity|authorized|authorised)\b|单元|房屋标识|授权/i.test(link.match_basis));
}

export function getPriceEvidence(listing: ListingSnapshot, dataset: Dataset): PriceEvidence {
  const history: LinkedTransaction[] = [], comparables: LinkedTransaction[] = [];
  const transactions = new Map(dataset.transactions.map((row) => [row.transaction_id, row]));
  let excluded_count = 0;
  for (const link of dataset.listing_transaction_links.filter((row) => row.listing_id === listing.listing_id)) {
    const transaction = transactions.get(link.transaction_id);
    const eligible = transaction && listing.verification_status === 'verified' && hasText(listing.reviewed_by) && listing.usage_status === 'approved' &&
      transaction.record_type === 'sale' && transaction.transaction_scope === 'whole_unit' &&
      transaction.amount !== null && Number.isFinite(transaction.amount) && transaction.amount > 0 && transaction.currency && transaction.currency !== 'other' &&
      validDate(transaction.transaction_date) && transaction.date_basis !== 'unknown' &&
      transaction.verification_status === 'verified' && hasText(transaction.reviewed_by) && transaction.usage_status === 'approved' &&
      hasText(transaction.source_ref) && hasText(transaction.evidence_excerpt) &&
      link.pricing_eligible === 'yes' && link.relation_type !== 'unresolved' &&
      link.verification_status === 'verified' && hasText(link.reviewed_by) && hasText(link.reviewed_at) && Number.isFinite(Date.parse(link.reviewed_at!)) &&
      hasText(link.match_basis) && hasText(link.evidence_refs) &&
      ((listing.data_kind !== 'demo' && transaction.data_kind !== 'demo') || link.data_kind === 'demo');
    if (!eligible || !transaction) { excluded_count++; continue; }
    if (link.relation_type === 'exact_property') {
      if (exactIdentity(listing, transaction, link)) history.push({ transaction, link });
      else excluded_count++;
    } else if (link.relation_type === 'comparable') {
      const sameKnownProperty = Boolean(listing.property_id && listing.property_id === transaction.property_id);
      const comparable = !sameKnownProperty && listing.area_name === transaction.area_name && listing.property_type !== 'unknown' && listing.property_type === transaction.property_type &&
        listing.currency === transaction.currency && listing.area_basis && listing.area_basis !== 'unknown' && listing.area_basis === transaction.area_basis &&
        listing.area_value !== null && listing.area_value > 0 && listing.area_unit && transaction.area_value !== null && transaction.area_value > 0 && transaction.area_unit;
      if (comparable) comparables.push({ transaction, link });
      else excluded_count++;
    }
  }
  const byDate = (a: LinkedTransaction, b: LinkedTransaction) => b.transaction.transaction_date!.localeCompare(a.transaction.transaction_date!) || a.link.link_id.localeCompare(b.link.link_id);
  return { history: history.sort(byDate), comparables: comparables.sort(byDate), excluded_count };
}
