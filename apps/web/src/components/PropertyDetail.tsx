import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Descriptions, Drawer, Empty, Space, Tabs, Tag } from 'antd';
import type { ClientRequirement, Dataset, ListingSnapshot, SourceRecord } from '../../../../shared/types';
import { buildClientGroups, type ClientGroup } from '../../../../shared/client-priorities';
import { getPriceEvidence, type LinkedTransaction } from '../../../../shared/pricing';
import { uniqueHistoryRecords } from '../../../../shared/transaction-history';
import { listingConfirmationKey, loadListingConfirmation, saveListingConfirmation, type ListingConfirmation } from '../../../../shared/listing-confirmation';
import { propertyAreaSqft, propertyDisplayName } from '../../../../shared/property-presentation';
import type { ViewingRecord } from '../../../../shared/viewing-records';
import { TransactionHistory } from './TransactionHistory';
import './PropertyDetail.css';

interface PropertyDetailProps {
  listing: ListingSnapshot | null;
  dataset: Dataset;
  requirements: ClientRequirement[];
  onClose: () => void;
  onViewClient: (requirement: ClientRequirement) => void;
  salesId?: string | null;
  storageScope?: string | null;
  viewingRecords?: ViewingRecord[];
}
const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const labels: Record<string, string> = {
  ready: 'Ready', off_plan: 'Off-plan', active: 'Active', withdrawn: 'Withdrawn', sold: 'Sold',
  unknown: 'Unknown', needs_review: 'Needs review', verified: 'Verified', conflict: 'Conflicting evidence',
  internal: 'Internal area', gross: 'Gross area', built_up: 'Built-up area', land: 'Land area',
  real_public: 'Public source data', real_authorized: 'Authorized data', demo: 'Demo data',
  whole_unit: 'Whole unit', partial_share: 'Partial share', bulk: 'Bulk transaction',
  self_use: 'Own use', investment: 'Investment', mixed: 'Mixed purpose', contract: 'Contract date', registration: 'Registration date',
};
function label(value: string | null | undefined): string { return value ? labels[value] ?? value.replaceAll('_', ' ') : 'Not supplied'; }
function money(value: number | null, currency: string | null): string { return value === null || !Number.isFinite(value) ? 'Price not supplied' : (currency && currency !== 'other' ? currency : 'Currency not specified') + ' ' + numberFormatter.format(value); }
function area(value: number | null, unit: string | null): string { return value === null || !Number.isFinite(value) ? 'Size not supplied' : numberFormatter.format(value) + ' ' + (unit === 'sqm' ? 'm²' : unit === 'sqft' ? 'sq ft' : '(unit not supplied)'); }
function bedrooms(value: number | null): string { return value === null ? 'Bedrooms not supplied' : value === 0 ? 'Studio' : value + ' bedroom' + (value === 1 ? '' : 's'); }
function date(value: string | null): string {
  if (!value) return 'Not supplied';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}
function SourceReference({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="pd-muted">Not supplied</span>;
  let safeUrl: string | null = null;
  try { const url = new URL(value); if (url.protocol === 'http:' || url.protocol === 'https:') safeUrl = url.href; } catch { /* Non-URL evidence references remain readable text. */ }
  return safeUrl ? <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="pd-source-ref" title={value}>View Source</a> : <span className="pd-source-ref">{value}</span>;
}
function SourceDetails({ source }: { source: SourceRecord }) {
  return <Descriptions className="pd-descriptions" size="small" column={{ xs: 1, sm: 2 }} layout="vertical">
    <Descriptions.Item label="Source">{source.data_kind === 'demo' ? 'Illustrative demo source' : source.source_name || 'Not supplied'}</Descriptions.Item>
    <Descriptions.Item label="Source Reference"><SourceReference value={source.source_ref} /></Descriptions.Item>
    <Descriptions.Item label="Source Date">{date(source.source_date)}</Descriptions.Item>
    <Descriptions.Item label="Source Verification">{label(source.verification_status)}</Descriptions.Item>
  </Descriptions>;
}
function OriginalEvidence({ excerpt }: { excerpt: string | null }) {
  return excerpt ? <div className="pd-evidence-note"><h4>Original Evidence</h4><blockquote>{excerpt}</blockquote></div> : null;
}
function SalesConfirmation({ listing, salesId, scope }: { listing: ListingSnapshot; salesId: string | null; scope: string | null }) {
  const access = { scope, salesId, listingId: listing.listing_id };
  const [confirmation, setConfirmation] = useState<ListingConfirmation | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = salesId && scope ? listingConfirmationKey(access) : null;
  function reload() {
    setError(null);
    if (!key) { setConfirmation(null); setLoadedKey(null); return; }
    try { setConfirmation(loadListingConfirmation(localStorage, access)); setLoadedKey(key); }
    catch (failure) { setConfirmation(null); setLoadedKey(null); setError(failure instanceof Error ? failure.message : 'The property confirmation could not be read.'); }
  }
  useEffect(() => { reload(); const listener = (event: StorageEvent) => { if (event.key === key || event.key === null) reload(); }; window.addEventListener('storage', listener); return () => window.removeEventListener('storage', listener); }, [key]);
  const current = loadedKey === key && key ? confirmation : null;
  function confirm(checked: boolean) {
    try { const saved = saveListingConfirmation(localStorage, access, checked); setConfirmation(saved); setLoadedKey(key); setError(null); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Saving could not be confirmed.'); setLoadedKey(null); }
  }
  return <div className="pd-sales-confirmation">
    <Checkbox checked={!!current} disabled={!key || loadedKey !== key} onChange={event => confirm(event.target.checked)}>Reviewed by local sales</Checkbox>
    {current ? <dl data-testid="listing-confirmation"><div><dt>Reviewed by</dt><dd>{current.confirmed_by_sales_id}</dd></div><div><dt>Confirmed At</dt><dd>{date(current.confirmed_at)}</dd></div><div><dt>Confirmed By Sales ID</dt><dd>{current.confirmed_by_sales_id}</dd></div></dl> : <p className="pd-field-note">{salesId ? 'Not confirmed by the current sales identity.' : 'Sign in to confirm this property.'}</p>}
    <p className="pd-field-note">Saved in this browser. Sales confirmation is separate from source verification.</p>
    {error && <Alert data-testid="listing-confirmation-error" type="error" message={error} action={<Button size="small" onClick={reload}>Reload confirmation</Button>} />}
  </div>;
}
function Overview({ listing, salesId, scope }: { listing: ListingSnapshot; salesId: string | null; scope: string | null }) {
  const sqft = propertyAreaSqft(listing);
  const pricePerArea = listing.asking_price !== null && sqft !== null && sqft > 0 ? listing.asking_price / sqft : null;
  return <div className="pd-tab-content">
    <section className="pd-price-block" aria-label="Asking price"><div><span className="pd-eyebrow">{listing.listing_status === 'active' ? 'Current asking price' : 'Recorded asking price'}</span><div className="pd-price">{money(listing.asking_price, listing.currency)}</div><p className="pd-price-note">Asking price, not a completed sale price.</p></div>{pricePerArea !== null && <div className="pd-unit-price"><strong>{money(pricePerArea, listing.currency)} / sq ft</strong><span>{label(listing.area_basis)}</span></div>}</section>
    <section className="pd-section" aria-labelledby="pd-property-facts"><h3 id="pd-property-facts">Property Facts</h3><div className="pd-fact-strip">
      <div><span>Property Type</span><strong>{label(listing.property_type)}</strong></div><div><span>Bedrooms</span><strong>{bedrooms(listing.bedrooms)}</strong></div><div><span>Size</span><strong>{area(sqft, 'sqft')}</strong><small>{label(listing.area_basis)}{listing.area_unit === 'sqm' ? ' · converted from m²' : ''}</small></div>
    </div><Descriptions className="pd-descriptions" size="small" column={{ xs: 1, sm: 2 }} layout="vertical">
      <Descriptions.Item label="Area / Location">{listing.area_name || 'Not supplied'}</Descriptions.Item><Descriptions.Item label="Property">{propertyDisplayName(listing)}</Descriptions.Item>
      {listing.unit_ref && <Descriptions.Item label="Unit Reference">{listing.unit_ref}</Descriptions.Item>}
      <Descriptions.Item label="Completion Status">{label(listing.market_segment)}</Descriptions.Item><Descriptions.Item label="Listing Status">{label(listing.listing_status)}</Descriptions.Item>
      <Descriptions.Item label="Available From">{date(listing.availability_date)}</Descriptions.Item><Descriptions.Item label="Updated">{date(listing.captured_at)}</Descriptions.Item>
    </Descriptions><div className="pd-amenities"><h4>Disclosed Amenities</h4>{listing.amenities?.length ? <Space size={[4, 6]} wrap>{[...new Set(listing.amenities)].map(amenity => <Tag key={amenity}>{label(amenity)}</Tag>)}</Space> : <p className="pd-muted">Not supplied.</p>}</div></section>
    <section className="pd-section" aria-labelledby="pd-record-source"><h3 id="pd-record-source">Record and Source</h3><div className="pd-identity-grid"><div><span>Listing ID</span><code>{listing.listing_id}</code></div><div><span>Property ID</span><code>{listing.property_id || 'Not established'}</code></div></div>
      <SourceDetails source={listing} /><SalesConfirmation listing={listing} salesId={salesId} scope={scope} /><OriginalEvidence excerpt={listing.evidence_excerpt} />
    </section>
  </div>;
}
function TransactionEvidence({ record, comparable = false }: { record: LinkedTransaction; comparable?: boolean }) {
  const { transaction, link } = record;
  return <article className="pd-transaction" aria-label={(comparable ? 'Comparable transaction ' : 'Same-property transaction ') + transaction.transaction_id}>
    {comparable && <header className="pd-transaction-heading"><div><span className="pd-eyebrow">{label(transaction.date_basis)}</span><h4>{date(transaction.transaction_date)}</h4></div><strong>{money(transaction.amount, transaction.currency)}</strong></header>}
    <div className="pd-transaction-context">{[transaction.area_name, transaction.building_name].filter(Boolean).join(' · ')} · {bedrooms(transaction.bedrooms)} · {area(transaction.area_value, transaction.area_unit)} · {label(transaction.area_basis)}</div>
    <Descriptions className="pd-descriptions" size="small" column={{ xs: 1, sm: 2 }} layout="vertical"><Descriptions.Item label="Transaction Type">{label(transaction.record_type)} · {label(transaction.transaction_scope)}</Descriptions.Item><Descriptions.Item label="Transaction ID">{transaction.transaction_id}</Descriptions.Item>{transaction.source_record_id && <Descriptions.Item label="Source Record">{transaction.source_record_id}</Descriptions.Item>}{transaction.unit_ref && <Descriptions.Item label="Unit Reference">{transaction.unit_ref}</Descriptions.Item>}</Descriptions>
    <div className="pd-link-evidence"><h4>{comparable ? 'Comparison Basis' : 'Property Association'}</h4><p>{link.match_basis}</p>{link.differences && <div className="pd-differences"><strong>Recorded Differences</strong><span>{link.differences}</span></div>}{link.evidence_refs && link.evidence_refs !== transaction.source_ref && <p className="pd-field-note">Association Evidence: <SourceReference value={link.evidence_refs} /></p>}</div>
    <SourceDetails source={transaction} /><OriginalEvidence excerpt={transaction.evidence_excerpt} />
  </article>;
}
export function PriceEvidence({ listing, dataset }: { listing: ListingSnapshot; dataset: Dataset }) {
  const evidence = getPriceEvidence(listing, dataset);
  const history = uniqueHistoryRecords(evidence.history);
  const comparables = [...new Map(evidence.comparables.map(record => [record.transaction.transaction_id, record])).values()];
  return <div className="pd-tab-content">
    <section className="pd-section pd-history-section" aria-labelledby="pd-same-property-history"><div className="pd-section-heading"><h3 id="pd-same-property-history">Property Transaction History</h3><Tag>{history.length} records</Tag></div>
      <TransactionHistory key={listing.snapshot_id} records={history} renderRecord={record => <TransactionEvidence record={record} />} />
    </section>
    <section className="pd-section pd-comparable-section" aria-labelledby="pd-comparable-transactions"><div className="pd-section-heading"><h3 id="pd-comparable-transactions">Comparable Property Transactions</h3><Tag>{comparables.length} records</Tag></div><p className="pd-field-note">Other properties. Review the comparison basis and recorded differences.</p>
      {comparables.length ? comparables.map(record => <TransactionEvidence key={record.transaction.transaction_id} record={record} comparable />) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No eligible comparable sale records." />}
    </section>
    {evidence.excluded_count > 0 && <p className="pd-field-note">{evidence.excluded_count} linked records await complete sale or source evidence.</p>}
  </div>;
}
function ClientCard({ client, listing, onViewClient, viewingRecords }: { client: ClientGroup; listing: ListingSnapshot; onViewClient: PropertyDetailProps['onViewClient']; viewingRecords: ViewingRecord[] }) {
  const { requirement, result, budget } = client.primary;
  const viewed = viewingRecords.filter(record => record.client_id === client.client_id && record.listing_id === listing.listing_id).sort((a, b) => b.viewed_at.localeCompare(a.viewed_at))[0];
  const question = result.unknowns[0] || result.conflicts[0] || requirement.missing_questions;
  return <article className={'pd-client pd-client-' + client.status} aria-label={'Client match for ' + client.client_alias} data-client-id={client.client_id}>
    <header className="pd-client-heading"><div><h3>{client.client_alias}</h3><span className="pd-muted">{client.client_id}</span></div><Tag className={'pd-status-' + client.status}>{client.status === 'match' ? 'Condition Met' : 'Needs Clarification'}</Tag></header>
    <div className="pd-client-key-facts"><div><span>Core Needs</span><strong>{[requirement.preferred_areas?.join(', '), requirement.property_types?.map(label).join(', '), requirement.bedrooms_min !== null ? requirement.bedrooms_min + '+ bedrooms' : null].filter(Boolean).join(' · ') || 'To confirm'}</strong></div><div><span>Budget</span><strong>{budget.range_label}</strong><small>{budget.label}</small></div>{requirement.purchase_by && <div><span>Purchase By</span><strong>{requirement.purchase_by}</strong></div>}<div><span>Viewing</span><strong>{viewed ? 'Viewed ' + date(viewed.viewed_at) : 'No viewing recorded'}</strong></div></div>
    {result.matched.length > 0 && <div className="pd-reason-group pd-reason-matched"><h4>Conditions Met</h4><ul>{result.matched.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
    {question && <p className="pd-client-open-question"><strong>To Clarify: </strong>{question}</p>}
    {requirement.intent_evidence && <p><strong>Stated Interest: </strong>{requirement.intent_evidence}</p>}
    <p className="pd-field-note">Source: <SourceReference value={requirement.source_ref} /></p>
    <footer className="pd-client-next"><p><strong>Next Action: </strong>{question ? 'Confirm this point with the client before recommending a viewing.' : 'Confirm current availability and discuss a viewing with the client.'}</p><Button onClick={() => onViewClient(requirement)}>View Client Details</Button></footer>
    {result.unknowns.length + result.conflicts.length > 1 && <details className="pd-source-details"><summary>Other Questions to Clarify</summary><ul>{[...result.unknowns, ...result.conflicts].filter(value => value !== question).map(value => <li key={value}>{value}</li>)}</ul></details>}
  </article>;
}
function PotentialClients({ listing, requirements, onViewClient, viewingRecords = [] }: Pick<PropertyDetailProps, 'requirements' | 'onViewClient' | 'viewingRecords'> & { listing: ListingSnapshot }) {
  const clients = buildClientGroups(listing, requirements).filter(client => client.status !== 'excluded');
  return <div className="pd-tab-content">{(['match', 'review'] as const).map(status => {
    const group = clients.filter(client => client.status === status);
    return <section className="pd-client-group" key={status} aria-label={status === 'match' ? 'Customers with conditions met' : 'Customers needing clarification'}><h3>{status === 'match' ? 'Condition Met' : 'Needs Clarification'} ({group.length})</h3>{group.length ? group.map(client => <ClientCard key={client.client_id} client={client} listing={listing} onViewClient={onViewClient} viewingRecords={viewingRecords} />) : <p className="pd-field-note">No clients in this group.</p>}</section>;
  })}</div>;
}
export function PropertyDetail({ listing, dataset, requirements, onClose, onViewClient, salesId = null, storageScope = null, viewingRecords = [] }: PropertyDetailProps) {
  const [activeTab, setActiveTab] = useState('overview');
  useEffect(() => { setActiveTab('overview'); }, [listing?.snapshot_id]);
  return <Drawer rootClassName="property-detail" width="min(900px, 96vw)" open={listing !== null} onClose={onClose} destroyOnClose title={listing ? <div className="pd-drawer-title"><div><span className="pd-eyebrow">Property Details</span><h2>{propertyDisplayName(listing)}</h2></div>{listing.data_kind === 'demo' && <Tag className="pd-demo-tag">Demo data</Tag>}</div> : 'Property Details'}>
    {listing && <><div className="pd-location"><span>{listing.area_name || 'Location not supplied'}</span><Space size={4} wrap><Tag>{label(listing.market_segment)}</Tag><Tag>{label(listing.listing_status)}</Tag></Space></div>
      {listing.data_kind === 'demo' && <div className="pd-demo-notice" role="note">Illustrative demo property, prices and sources.</div>}
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        { key: 'overview', label: 'Overview', children: <Overview listing={listing} salesId={salesId} scope={storageScope || dataset.meta.storage_namespace || null} /> },
        { key: 'evidence', label: 'Price evidence', children: <PriceEvidence key={listing.snapshot_id} listing={listing} dataset={dataset} /> },
        { key: 'clients', label: 'Potential clients', children: <PotentialClients key={listing.snapshot_id} listing={listing} requirements={requirements} onViewClient={onViewClient} viewingRecords={viewingRecords} /> },
      ]} />
    </>}
  </Drawer>;
}
