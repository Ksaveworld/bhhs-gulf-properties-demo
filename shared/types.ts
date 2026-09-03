/** CSV v1 keys are retained verbatim. Null means undisclosed, never zero or false. */
export type DataKind = 'real_public' | 'real_authorized' | 'demo';
export type Currency = 'AED' | 'USD' | 'EUR' | 'GBP' | 'other';
export type AreaUnit = 'sqm' | 'sqft';
export type AreaBasis = 'internal' | 'gross' | 'built_up' | 'land' | 'unknown';
export type PropertyType = 'apartment' | 'villa' | 'townhouse' | 'penthouse' | 'land' | 'other' | 'unknown';
export type MarketSegment = 'ready' | 'off_plan' | 'unknown';
export type VerificationStatus = 'verified' | 'needs_review' | 'conflict';

export interface SourceRecord {
  data_kind: DataKind;
  source_name: string;
  source_ref: string;
  source_date: string | null;
  captured_at: string;
  verification_status: VerificationStatus;
  usage_status: 'approved' | 'pending' | 'restricted';
  reviewed_by: string | null;
  notes: string | null;
}

export interface ListingSnapshot extends SourceRecord {
  snapshot_id: string;
  listing_id: string;
  property_id: string | null;
  title: string;
  area_name: string;
  building_name: string | null;
  unit_ref: string | null;
  property_type: PropertyType;
  bedrooms: number | null;
  area_value: number | null;
  area_unit: AreaUnit | null;
  area_basis: AreaBasis | null;
  market_segment: MarketSegment;
  listing_status: 'active' | 'withdrawn' | 'sold' | 'unknown';
  asking_price: number | null;
  currency: Currency | null;
  listed_at: string | null;
  availability_date: string | null;
  amenities: string[] | null;
  evidence_excerpt: string | null;
}

export interface Transaction extends SourceRecord {
  transaction_id: string;
  source_record_id: string | null;
  property_id: string | null;
  record_type: 'sale' | 'lease' | 'mortgage' | 'gift' | 'other' | 'unknown';
  transaction_scope: 'whole_unit' | 'partial_share' | 'bulk' | 'unknown';
  transaction_date: string | null;
  date_basis: 'contract' | 'registration' | 'unknown';
  amount: number | null;
  currency: Currency | null;
  area_name: string;
  building_name: string | null;
  unit_ref: string | null;
  property_type: PropertyType;
  bedrooms: number | null;
  area_value: number | null;
  area_unit: AreaUnit | null;
  area_basis: AreaBasis | null;
  registration_segment: MarketSegment | null;
  evidence_excerpt: string | null;
}

export interface ListingTransactionLink {
  link_id: string;
  listing_id: string;
  transaction_id: string;
  relation_type: 'exact_property' | 'comparable' | 'unresolved';
  match_basis: string;
  differences: string | null;
  pricing_eligible: 'yes' | 'no' | 'pending';
  evidence_refs: string;
  verification_status: VerificationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  data_kind: DataKind;
  notes: string | null;
}

export interface ClientRequirement extends SourceRecord {
  requirement_id: string;
  client_id: string;
  client_alias: string;
  sales_owner: string | null;
  raw_request: string;
  budget_min: number | null;
  budget_max: number | null;
  currency: Currency | null;
  budget_constraint: 'hard' | 'flexible' | 'unknown';
  preferred_areas: string[] | null;
  property_types: string[] | null;
  bedrooms_min: number | null;
  area_min: number | null;
  area_unit: AreaUnit | null;
  purchase_purpose: 'self_use' | 'investment' | 'mixed' | 'unknown';
  market_preference: MarketSegment | 'either';
  purchase_by: string | null;
  move_in_by: string | null;
  hard_constraints: string | null;
  soft_preferences: string | null;
  intent_evidence: string | null;
  missing_questions: string | null;
}

export interface MatchReference {
  case_id: string;
  requirement_id: string;
  listing_id: string | null;
  expected_result: 'recommend' | 'alternative' | 'exclude' | 'needs_clarification' | 'no_match';
  expected_rank: number | null;
  matched_conditions: string | null;
  conflicting_conditions: string | null;
  intent_assessment: 'high' | 'medium' | 'low' | 'unknown' | null;
  intent_basis: string | null;
  pricing_link_ids: string[] | null;
  price_reference_note: string | null;
  follow_up_questions: string | null;
  next_action: string | null;
  case_type: 'standard' | 'multiple_properties' | 'multiple_clients' | 'budget_conflict' | 'no_history' | 'no_match' | 'missing_fields' | 'other';
  business_reviewer: string;
  review_status: 'draft' | 'confirmed';
  reference_evidence: string;
  data_kind: DataKind;
  notes: string | null;
}

export interface Dataset {
  listing_snapshots: ListingSnapshot[];
  transactions: Transaction[];
  listing_transaction_links: ListingTransactionLink[];
  client_requirements: ClientRequirement[];
  match_reference: MatchReference[];
  meta: {
    mode: 'demo' | 'product';
    label: string;
    loaded_at: string;
    warnings: string[];
    quarantined_count: number;
  };
}

/** Distinct internal entities derived only from explicitly supplied identities. */
export interface Client {
  client_id: string;
  client_alias: string;
  requirement_ids: string[];
}
export interface Property {
  property_id: string;
  listing_ids: string[];
  transaction_ids: string[];
}
export function deriveClients(requirements: ClientRequirement[]): Client[] {
  const clients = new Map<string, Client>();
  for (const row of requirements) {
    const client = clients.get(row.client_id) ?? { client_id: row.client_id, client_alias: row.client_alias, requirement_ids: [] };
    if (!client.requirement_ids.includes(row.requirement_id)) client.requirement_ids.push(row.requirement_id);
    clients.set(row.client_id, client);
  }
  return [...clients.values()];
}
export function deriveProperties(dataset: Pick<Dataset, 'listing_snapshots' | 'transactions'>): Property[] {
  const properties = new Map<string, Property>();
  for (const row of [...dataset.listing_snapshots, ...dataset.transactions]) {
    if (!row.property_id) continue;
    const property = properties.get(row.property_id) ?? { property_id: row.property_id, listing_ids: [], transaction_ids: [] };
    if ('listing_id' in row && !property.listing_ids.includes(row.listing_id)) property.listing_ids.push(row.listing_id);
    if ('transaction_id' in row && !property.transaction_ids.includes(row.transaction_id)) property.transaction_ids.push(row.transaction_id);
    properties.set(row.property_id, property);
  }
  return [...properties.values()];
}
