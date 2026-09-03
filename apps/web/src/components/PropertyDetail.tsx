import { useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Drawer, Empty, Space, Tabs, Tag } from 'antd';
import type {
  ClientRequirement,
  Dataset,
  ListingSnapshot,
  ListingTransactionLink,
  SourceRecord,
  Transaction,
} from '../../../../shared/types';
import { evaluateMatch } from '../../../../shared/matching';
import { getPriceEvidence } from '../../../../shared/pricing';
import './PropertyDetail.css';

interface PropertyDetailProps {
  listing: ListingSnapshot | null;
  dataset: Dataset;
  requirements: ClientRequirement[];
  onClose: () => void;
  onViewClient: (requirement: ClientRequirement) => void;
}

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const labels: Record<string, string> = {
  ready: 'Ready', off_plan: 'Off-plan', active: 'Active listing', withdrawn: 'Withdrawn listing',
  sold: 'Marked sold by source', unknown: 'Unknown', needs_review: 'Needs review',
  verified: 'Verified', conflict: 'Conflicting evidence', internal: 'Internal area',
  gross: 'Gross area', built_up: 'Built-up area', land: 'Land area',
  real_public: 'Public source data', real_authorized: 'Authorized data', demo: 'Demo data',
  whole_unit: 'Whole unit', partial_share: 'Partial share', bulk: 'Bulk transaction',
  self_use: 'Own use', investment: 'Investment', mixed: 'Mixed purpose',
  contract: 'Contract date', registration: 'Registration date',
};

function label(value: string | null | undefined): string {
  if (!value) return 'Not supplied';
  return labels[value] ?? value.replaceAll('_', ' ');
}

function money(value: number | null, currency: string | null): string {
  if (value === null || !Number.isFinite(value)) return 'Price not supplied';
  return `${currency && currency !== 'other' ? currency : 'Currency not specified'} ${numberFormatter.format(value)}`;
}

function area(value: number | null, unit: string | null): string {
  if (value === null || !Number.isFinite(value)) return 'Area not supplied';
  return `${numberFormatter.format(value)} ${unit === 'sqm' ? 'm²' : unit === 'sqft' ? 'sq ft' : '(unit not supplied)'}`;
}

function bedrooms(value: number | null): string {
  return value === null ? 'Bedrooms not supplied' : value === 0 ? 'Studio' : `${value} bedroom${value === 1 ? '' : 's'}`;
}

function date(value: string | null): string {
  if (!value) return 'Not supplied';
  // Date-only facts retain their recorded calendar day. Timestamp facts retain the time and zone.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

function SourceReference({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="pd-muted">Not supplied</span>;
  let safeUrl: string | null = null;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') safeUrl = url.href;
  } catch {
    // Evidence IDs and local references remain plain text; they are not navigable URLs.
  }
  return safeUrl
    ? <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="pd-source-ref">{value}</a>
    : <span className="pd-source-ref">{value}</span>;
}

function DataTag({ kind }: { kind: SourceRecord['data_kind'] }) {
  return <Tag className={kind === 'demo' ? 'pd-demo-tag' : 'pd-data-tag'}>{label(kind)}</Tag>;
}

function SourceDetails({ source }: { source: SourceRecord }) {
  return (
    <Descriptions className="pd-descriptions" size="small" column={{ xs: 1, sm: 2 }} layout="vertical">
      <Descriptions.Item label="Source">{source.source_name || 'Not supplied'}</Descriptions.Item>
      <Descriptions.Item label="Source reference"><SourceReference value={source.source_ref} /></Descriptions.Item>
      <Descriptions.Item label="Source date">{date(source.source_date)}</Descriptions.Item>
      <Descriptions.Item label="Snapshot captured">{date(source.captured_at)}</Descriptions.Item>
      <Descriptions.Item label="Verification">{label(source.verification_status)}</Descriptions.Item>
      <Descriptions.Item label="Usage review">{label(source.usage_status)}</Descriptions.Item>
      <Descriptions.Item label="Reviewed by">{source.reviewed_by || 'Not supplied'}</Descriptions.Item>
      <Descriptions.Item label="Data nature"><DataTag kind={source.data_kind} /></Descriptions.Item>
    </Descriptions>
  );
}

function EvidenceNote({ excerpt, notes }: { excerpt: string | null; notes: string | null }) {
  if (!excerpt && !notes) return null;
  return (
    <div className="pd-evidence-note">
      {excerpt && <div><h4>Source evidence</h4><blockquote>{excerpt}</blockquote></div>}
      {notes && <div><h4>Record notes</h4><p>{notes}</p></div>}
    </div>
  );
}

function Overview({ listing }: { listing: ListingSnapshot }) {
  const pricePerArea = listing.asking_price !== null && listing.area_value !== null && listing.area_value > 0 && listing.area_unit
    ? listing.asking_price / listing.area_value
    : null;
  return (
    <div className="pd-tab-content">
      <section className="pd-price-block" aria-label="Asking price">
        <div>
          <span className="pd-eyebrow">{listing.listing_status === 'active' ? 'Current asking price' : 'Recorded asking price'}</span>
          <div className="pd-price">{money(listing.asking_price, listing.currency)}</div>
          <p className="pd-price-note">Asking price from this listing snapshot · not a completed sale price.</p>
        </div>
        {pricePerArea !== null && (
          <div className="pd-unit-price">
            <strong>{money(pricePerArea, listing.currency)} / {listing.area_unit === 'sqm' ? 'm²' : 'sq ft'}</strong>
            <span>{label(listing.area_basis)} · calculated from this snapshot</span>
          </div>
        )}
      </section>

      {listing.listing_status === 'withdrawn' && (
        <Alert type="warning" showIcon message="This listing is withdrawn." description="Withdrawal does not establish a completed sale. The price above is the retained asking price from this snapshot." />
      )}
      {listing.listing_status === 'sold' && (
        <Alert type="info" showIcon message="The source marks this listing as sold." description="The asking price is not the transaction amount. Check Price evidence for an eligible linked sale record." />
      )}

      <section className="pd-section" aria-labelledby="pd-property-facts">
        <h3 id="pd-property-facts">Property facts</h3>
        <div className="pd-fact-strip">
          <div><span>Property type</span><strong>{label(listing.property_type)}</strong></div>
          <div><span>Bedrooms</span><strong>{bedrooms(listing.bedrooms)}</strong></div>
          <div><span>Recorded area</span><strong>{area(listing.area_value, listing.area_unit)}</strong><small>{label(listing.area_basis)}</small></div>
        </div>
        <Descriptions className="pd-descriptions" size="small" column={{ xs: 1, sm: 2 }} layout="vertical">
          <Descriptions.Item label="Area">{listing.area_name || 'Not supplied'}</Descriptions.Item>
          <Descriptions.Item label="Building">{listing.building_name || 'Not supplied'}</Descriptions.Item>
          <Descriptions.Item label="Unit reference">{listing.unit_ref || 'Not supplied'}</Descriptions.Item>
          <Descriptions.Item label="Completion segment">{label(listing.market_segment)}</Descriptions.Item>
          <Descriptions.Item label="Listing status">{label(listing.listing_status)}</Descriptions.Item>
          <Descriptions.Item label="Available from">{date(listing.availability_date)}</Descriptions.Item>
          <Descriptions.Item label="First listed">{date(listing.listed_at)}</Descriptions.Item>
          <Descriptions.Item label="Snapshot captured">{date(listing.captured_at)}</Descriptions.Item>
        </Descriptions>
        <p className="pd-field-note">Ready / off-plan describes the completion segment. Active / withdrawn / sold describes the listing status.</p>
        <div className="pd-amenities"><h4>Disclosed amenities</h4>{listing.amenities?.length
          ? <Space size={[4, 6]} wrap>{[...new Set(listing.amenities)].map((amenity) => <Tag key={amenity}>{label(amenity)}</Tag>)}</Space>
          : <p className="pd-muted">No amenities supplied. Absence from this record does not mean an amenity is unavailable.</p>}
        </div>
      </section>

      <section className="pd-section" aria-labelledby="pd-record-source">
        <h3 id="pd-record-source">Record & source</h3>
        <div className="pd-identity-grid">
          <div><span>Listing ID</span><code>{listing.listing_id}</code></div>
          <div><span>Property ID</span><code>{listing.property_id || 'Not established'}</code></div>
          <div><span>Snapshot ID</span><code>{listing.snapshot_id}</code></div>
        </div>
        <SourceDetails source={listing} />
        <EvidenceNote excerpt={listing.evidence_excerpt} notes={listing.notes} />
      </section>
    </div>
  );
}

function TransactionEvidence({ transaction, link, comparable }: {
  transaction: Transaction;
  link: ListingTransactionLink;
  comparable: boolean;
}) {
  return (
    <article className="pd-transaction" aria-label={`${comparable ? 'Comparable transaction' : 'Same-property transaction'} ${transaction.transaction_id}`}>
      <header className="pd-transaction-heading">
        <div><span className="pd-eyebrow">{label(transaction.date_basis)}</span><h4>{date(transaction.transaction_date)}</h4></div>
        <div className="pd-transaction-amount"><strong>{money(transaction.amount, transaction.currency)}</strong><DataTag kind={transaction.data_kind} /></div>
      </header>
      <div className="pd-transaction-context">
        {[transaction.area_name, transaction.building_name].filter(Boolean).join(' · ') || 'Location not supplied'}
        {' · '}{bedrooms(transaction.bedrooms)}{' · '}{area(transaction.area_value, transaction.area_unit)}
        {' · '}{label(transaction.area_basis)}
      </div>
      <Descriptions className="pd-descriptions" size="small" column={{ xs: 1, sm: 2 }} layout="vertical">
        <Descriptions.Item label="Record type / scope">{label(transaction.record_type)} / {label(transaction.transaction_scope)}</Descriptions.Item>
        <Descriptions.Item label="Registration segment">{label(transaction.registration_segment)}</Descriptions.Item>
        <Descriptions.Item label="Transaction ID"><code>{transaction.transaction_id}</code></Descriptions.Item>
        <Descriptions.Item label="Property ID"><code>{transaction.property_id || 'Not established'}</code></Descriptions.Item>
        <Descriptions.Item label="Original source record ID"><code>{transaction.source_record_id || 'Not supplied'}</code></Descriptions.Item>
        <Descriptions.Item label="Unit reference">{transaction.unit_ref || 'Not supplied'}</Descriptions.Item>
      </Descriptions>
      <div className="pd-link-evidence">
        <h4>{comparable ? 'Why this is a comparable' : 'Same-property association'}</h4>
        <p>{link.match_basis || 'Association basis not supplied'}</p>
        <div className="pd-differences"><strong>Recorded differences</strong><span>{link.differences || 'No differences documented in the supplied link.'}</span></div>
        <dl>
          <div><dt>Link ID</dt><dd><code>{link.link_id}</code></dd></div>
          <div><dt>Evidence reference</dt><dd><SourceReference value={link.evidence_refs} /></dd></div>
          <div><dt>Link verification</dt><dd>{label(link.verification_status)} · {label(link.data_kind)}</dd></div>
          <div><dt>Link review</dt><dd>{link.reviewed_by || 'Reviewer not supplied'} · {date(link.reviewed_at)}</dd></div>
        </dl>
        {link.notes && <p className="pd-field-note">{link.notes}</p>}
      </div>
      <details className="pd-source-details">
        <summary>Transaction source & evidence</summary>
        <SourceDetails source={transaction} />
        <EvidenceNote excerpt={transaction.evidence_excerpt} notes={transaction.notes} />
      </details>
    </article>
  );
}

function PriceEvidence({ listing, dataset }: { listing: ListingSnapshot; dataset: Dataset }) {
  const evidence = getPriceEvidence(listing, dataset);
  return (
    <div className="pd-tab-content">
      <p className="pd-intro">Recorded sale evidence is shown in its original currency, area unit and date basis. These records do not establish a valuation or a future sale price.</p>
      <section className="pd-section pd-history-section" aria-labelledby="pd-same-property-history">
        <div className="pd-section-heading"><h3 id="pd-same-property-history">Same-property history</h3><Tag>{evidence.history.length} record{evidence.history.length === 1 ? '' : 's'}</Tag></div>
        <p className="pd-field-note">Eligible sale records with a verified association to this same property. A transaction ID alone does not identify a property.</p>
        {evidence.history.length ? evidence.history.map(({ transaction, link }) => (
          <TransactionEvidence key={link.link_id} transaction={transaction} link={link} comparable={false} />
        )) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span>No verified same-property sale history.<br /><span className="pd-muted">A reviewed sale record and property-identity evidence are needed.</span></span>} />
        )}
      </section>
      <section className="pd-section pd-comparable-section" aria-labelledby="pd-comparable-transactions">
        <div className="pd-section-heading"><h3 id="pd-comparable-transactions">Comparable transactions</h3><Tag>{evidence.comparables.length} record{evidence.comparables.length === 1 ? '' : 's'}</Tag></div>
        <p className="pd-field-note">Nearby or similar properties, shown separately from this property's history. Review the supplied association basis and differences before using a comparison.</p>
        {evidence.comparables.length ? evidence.comparables.map(({ transaction, link }) => (
          <TransactionEvidence key={link.link_id} transaction={transaction} link={link} comparable />
        )) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span>No eligible comparable sale records.<br /><span className="pd-muted">Reviewed comparable sales and documented differences are needed.</span></span>} />
        )}
      </section>
      {evidence.excluded_count > 0 && <Alert type="info" showIcon message={`${evidence.excluded_count} linked record${evidence.excluded_count === 1 ? '' : 's'} not eligible for these price-evidence sections.`} description="Unresolved associations and records without the required verification, permissions or sale details are withheld from the price evidence above." />}
    </div>
  );
}

function ReasonList({ title, reasons, empty, tone }: { title: string; reasons: string[]; empty: string; tone: string }) {
  return (
    <div className={`pd-reason-group pd-reason-${tone}`}>
      <h4>{title}</h4>
      {reasons.length ? <ul>{reasons.map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}</ul> : <p className="pd-muted">{empty}</p>}
    </div>
  );
}

function PotentialClients({ listing, requirements, onViewClient }: Pick<PropertyDetailProps, 'requirements' | 'onViewClient'> & { listing: ListingSnapshot }) {
  const order = { match: 0, review: 1, excluded: 2 };
  const clients = requirements.map((requirement) => ({ requirement, result: evaluateMatch(listing, requirement) }))
    .sort((a, b) => order[a.result.status] - order[b.result.status] || a.requirement.client_alias.localeCompare(b.requirement.client_alias));
  return (
    <div className="pd-tab-content">
      <p className="pd-intro">Compare this property with the recorded client requirements. Conditions and open questions support a sales conversation; they do not estimate a client's assets or chance of purchase.</p>
      {!clients.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No client requirements available. Add or import a sales-reviewed requirement to compare." />}
      {clients.map(({ requirement, result }) => (
        <article className={`pd-client pd-client-${result.status}`} key={requirement.requirement_id} aria-label={`Client match for ${requirement.client_alias}`}>
          <header className="pd-client-heading">
            <div><span className="pd-eyebrow">{label(requirement.purchase_purpose)}</span><h3>{requirement.client_alias}</h3><span className="pd-muted">{requirement.sales_owner ? `Sales owner: ${requirement.sales_owner}` : 'Sales owner not supplied'}</span></div>
            <div className="pd-client-tags"><DataTag kind={requirement.data_kind} /><Tag className={`pd-status-${result.status}`}>{result.status === 'match' ? 'Conditions met' : result.status === 'review' ? 'Needs clarification' : 'Hard condition conflict'}</Tag></div>
          </header>
          <div className="pd-client-summary">
            <div><span>Budget fit</span><strong>{result.budget_fit}</strong></div>
            <div><span>Known purchase date</span><strong>{result.purchase_by || 'To be confirmed'}</strong></div>
          </div>
          <div className="pd-reasons-grid">
            <ReasonList title="Matched conditions" reasons={result.matched} empty="No confirmed conditions yet." tone="matched" />
            <ReasonList title="Conflicts & differences" reasons={result.conflicts} empty="No conflicts identified in the supplied fields." tone="conflict" />
          </div>
          <ReasonList title="Information to confirm" reasons={result.unknowns} empty="No additional gaps identified by this rule comparison." tone="unknown" />
          <div className="pd-intent-evidence"><h4>Stated intent evidence</h4><p>{result.intent_evidence || 'No intent evidence supplied.'}</p><span className="pd-field-note">Client or sales statements only. No probability or purchasing-power assessment.</span></div>
          <details className="pd-source-details">
            <summary>Client requirement & source</summary>
            <div className="pd-identity-grid pd-identity-grid-two">
              <div><span>Client ID</span><code>{requirement.client_id}</code></div>
              <div><span>Requirement ID</span><code>{requirement.requirement_id}</code></div>
            </div>
            <h4>Recorded request</h4><blockquote className="pd-raw-request">{requirement.raw_request || 'Not supplied'}</blockquote>
            <SourceDetails source={requirement} />
            {requirement.notes && <p className="pd-field-note">{requirement.notes}</p>}
          </details>
          <footer className="pd-client-footer"><div><h4>Next step</h4><p>{result.next_action}</p></div><Button onClick={() => onViewClient(requirement)}>View properties for {requirement.client_alias}</Button></footer>
        </article>
      ))}
    </div>
  );
}

export function PropertyDetail({ listing, dataset, requirements, onClose, onViewClient }: PropertyDetailProps) {
  const [activeTab, setActiveTab] = useState('overview');
  useEffect(() => { setActiveTab('overview'); }, [listing?.snapshot_id]);
  return (
    <Drawer rootClassName="property-detail" width="min(900px, 96vw)" open={listing !== null} onClose={onClose} destroyOnClose title={listing ? (
      <div className="pd-drawer-title"><div><span className="pd-eyebrow">Property detail</span><h2>{listing.title}</h2></div><DataTag kind={listing.data_kind} /></div>
    ) : 'Property detail'}>
      {listing && (
        <>
          <div className="pd-location"><span>{[listing.area_name, listing.building_name].filter(Boolean).join(' / ') || 'Location not supplied'}</span><Space size={4} wrap><Tag>{label(listing.market_segment)}</Tag><Tag>{label(listing.listing_status)}</Tag></Space></div>
          {listing.data_kind === 'demo' && <div className="pd-demo-notice" role="note">Illustrative demo property, prices and evidence. Not a real BHHS listing or verified market information.</div>}
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
            { key: 'overview', label: 'Overview', children: <Overview listing={listing} /> },
            { key: 'evidence', label: 'Price evidence', children: <PriceEvidence listing={listing} dataset={dataset} /> },
            { key: 'clients', label: `Potential clients (${requirements.length})`, children: <PotentialClients listing={listing} requirements={requirements} onViewClient={onViewClient} /> },
          ]} />
        </>
      )}
    </Drawer>
  );
}
