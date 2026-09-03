import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, Tabs, Tag } from 'antd';
import type { ClientRequirement, Dataset, ListingSnapshot } from '../../../../shared/types';
import {
  buildBudgetCohort, createFictionalViewingExamples, createViewingRecord, listingViewingDimensions,
  loadViewingRecords, saveViewingRecords, sortViewingRecords, summarizeViewingEvidence, viewingStorageKey,
  type StoredViewingRecords, type ViewingAccess, type ViewingDimension, type ViewingFeedbackSignal,
  type ViewingRecord, type ViewingSummary,
} from '../../../../shared/viewing-records';
import { PriceEvidence } from './PropertyDetail';
import '../reports.css';

export interface ReportsProps {
  dataset: Dataset;
  listings: ListingSnapshot[];
  requirements: ClientRequirement[];
  salesId: string | null;
  storageScope: string | null;
  onOpenProperty: (id: string) => void;
}
const pretty = (value: string | null | undefined) => value ? value.replaceAll('_', ' ') : 'Not supplied';
const money = (value: number | null, currency: string | null) => value === null ? 'Not supplied' : `${currency && currency !== 'other' ? currency : 'Currency unknown'} ${value.toLocaleString('en-US')}`;
const localDate = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const displayedDate = (value: string) => new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

function SourceRef({ value }: { value: string | null }) {
  try {
    const url = new URL(value || '');
    if (['https:', 'http:'].includes(url.protocol)) return <a href={url.href} target="_blank" rel="noopener noreferrer">{value}</a>;
  } catch { /* Local source IDs remain plain evidence references. */ }
  return <span>{value || 'Not supplied'}</span>;
}

function ObservationTable({ summary }: { summary: ViewingSummary }) {
  if (!summary.viewing_count) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No viewing observations have been recorded." />;
  return <div className="report-observations">
    <p className="report-note">Observed viewings count visits to properties with these recorded dimensions. Stated preferences count explicit tags entered by sales. Positive visit feedback describes the visit as a whole; it does not establish a preference for every dimension. Unknown sizes or measurement bases are omitted.</p>
    <div className="report-table-scroll"><table className="report-evidence-table">
      <caption>Rule summary · {summary.viewing_count} recorded viewings · {summary.client_count} clients · {summary.demo_count} demonstration records ({summary.fictional_count} fictional examples)</caption>
      <thead><tr><th>Observed dimension</th><th>Observed viewings</th><th>Stated preference tags</th><th>Positive visit feedback</th></tr></thead>
      <tbody>{summary.observations.map(observation => <tr key={`${observation.dimension}:${observation.value}`}>
        <th scope="row"><span className="report-dimension">{pretty(observation.dimension)}</span>{pretty(observation.value)}<details><summary>Counted records</summary><ul>{observation.record_ids.map(id => <li key={id}><code>{id}</code></li>)}</ul></details></th>
        <td>{observation.observed_count}</td><td>{observation.stated_tag_count}</td><td>{observation.positive_visit_count}</td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}

function PropertyScan({ dataset, listings, onOpenProperty }: Pick<ReportsProps, 'dataset' | 'listings' | 'onOpenProperty'>) {
  const [listingId, setListingId] = useState(listings[0]?.listing_id ?? '');
  const listing = listings.find(item => item.listing_id === listingId) ?? listings[0];
  return <section className="report-tab" aria-label="Property scan report">
    <div className="report-section-heading"><div><p className="report-eyebrow">Property evidence</p><h2>Property scan report</h2><p>One property, its current listing snapshot and the available transaction evidence.</p></div>
      <label className="report-field report-picker"><span>Report property</span><select aria-label="Report property" value={listing?.listing_id ?? ''} onChange={event => setListingId(event.target.value)} disabled={!listings.length}>{listings.map(item => <option key={item.listing_id} value={item.listing_id}>{item.title} · {item.listing_id}</option>)}</select></label>
    </div>
    {!listing ? <Empty description="No properties are available for a report." /> : <>
      <section className="report-property-card" data-testid="property-scan-summary">
        <div><Tag>{listing.data_kind === 'demo' ? 'Demonstration property' : 'Source property record'}</Tag><h3>{listing.title}</h3><p>{listing.area_name} · {pretty(listing.property_type)} · {listing.bedrooms === null ? 'Bedrooms not supplied' : `${listing.bedrooms} bedrooms`}</p><p>{listingViewingDimensions(listing).size ? pretty(listingViewingDimensions(listing).size) : 'Area or measurement basis not supplied'} · {pretty(listing.market_segment)}</p><code>{listing.listing_id} · {listing.snapshot_id}</code></div>
        <div className="report-current-price"><span>{listing.listing_status === 'active' ? 'Current asking price' : 'Recorded asking price'}</span><strong>{money(listing.asking_price, listing.currency)}</strong><small>{pretty(listing.listing_status)} · Asking price is not a completed sale.</small><Button onClick={() => onOpenProperty(listing.listing_id)}>Open property details</Button></div>
      </section>
      <details className="report-listing-source"><summary>Listing source and update time</summary><dl><dt>Source</dt><dd>{listing.source_name}</dd><dt>Source reference</dt><dd><SourceRef value={listing.source_ref} /></dd><dt>Source date</dt><dd>{listing.source_date || 'Not supplied'}</dd><dt>Snapshot captured</dt><dd>{listing.captured_at}</dd><dt>Verification</dt><dd>{pretty(listing.verification_status)} · Usage: {pretty(listing.usage_status)}</dd></dl>{listing.evidence_excerpt && <blockquote>{listing.evidence_excerpt}</blockquote>}{listing.notes && <p>{listing.notes}</p>}</details>
      <div className="reports-price-evidence"><PriceEvidence key={listing.snapshot_id} listing={listing} dataset={dataset} /></div>
    </>}
  </section>;
}

function ViewingTimeline({ records, listings, onOpenProperty }: { records: ViewingRecord[]; listings: ListingSnapshot[]; onOpenProperty: ReportsProps['onOpenProperty'] }) {
  if (!records.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No viewing history recorded for this client. Add a record after a viewing." />;
  return <ol className="report-viewing-timeline" aria-label="Client viewing timeline">{sortViewingRecords(records).map(record => {
    const listing = listings.find(item => item.listing_id === record.listing_id);
    return <li key={record.record_id} data-viewing-id={record.record_id}>
      <div className="report-timeline-heading"><time dateTime={record.viewed_at}>{displayedDate(record.viewed_at)}</time><Tag>{record.source_kind === 'fictional_example' ? 'Fictional example' : record.data_kind === 'demo' ? 'Demonstration record' : 'Sales-entered · Unverified'}</Tag></div>
      <Button type="link" onClick={() => onOpenProperty(record.listing_id)}>{listing?.title || record.listing_id}</Button>
      <p><strong>Visit feedback:</strong> {pretty(record.feedback_signal)}</p><p className="report-feedback">{record.feedback || 'No written feedback supplied.'}</p>
      <p><strong>Stated preferences:</strong> {record.preference_tags.length ? record.preference_tags.map(tag => `${pretty(tag.dimension)}: ${pretty(tag.value)}`).join(' · ') : 'None explicitly tagged.'}</p>
      <details><summary>Record source</summary><dl><dt>Record ID</dt><dd><code>{record.record_id}</code></dd><dt>Source</dt><dd>{record.source_kind === 'fictional_example' ? 'Generated only after explicit fictional-example action' : 'Entered by sales in this browser; not independently verified'}</dd><dt>Source reference</dt><dd>{record.source_ref}</dd><dt>Sales ID</dt><dd>{record.sales_id}</dd><dt>Client / property</dt><dd>{record.client_id} / {record.listing_id}</dd><dt>Captured</dt><dd>{record.created_at}</dd></dl></details>
    </li>;
  })}</ol>;
}

function ClientProfiles({ requirements, listings, salesId, storageScope, onOpenProperty }: Omit<ReportsProps, 'dataset'>) {
  const access = useMemo<ViewingAccess>(() => ({ scope: storageScope, salesId, requirements, listings }), [storageScope, salesId, requirements, listings]);
  const groups = useMemo(() => {
    const clients = new Map<string, ClientRequirement[]>();
    for (const requirement of requirements) clients.set(requirement.client_id, [...(clients.get(requirement.client_id) ?? []), requirement]);
    return [...clients.entries()];
  }, [requirements]);
  const [clientId, setClientId] = useState(groups[0]?.[0] ?? '');
  const selectedClient = groups.find(([id]) => id === clientId) ?? groups[0];
  const currentClientId = selectedClient?.[0] ?? '';
  const [requirementId, setRequirementId] = useState('');
  const requirement = selectedClient?.[1].find(row => row.requirement_id === requirementId) ?? selectedClient?.[1][0] ?? null;
  const [stored, setStored] = useState<StoredViewingRecords | null>(null);
  const [storageError, setStorageError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [saveError, setSaveError] = useState('');
  const [listingId, setListingId] = useState(listings[0]?.listing_id ?? '');
  const [viewedAt, setViewedAt] = useState(localDate);
  const [feedback, setFeedback] = useState('');
  const [signal, setSignal] = useState<ViewingFeedbackSignal>('not_recorded');
  const [tagDimensions, setTagDimensions] = useState<ViewingDimension[]>([]);
  const [writing, setWriting] = useState(false);
  const selectedListing = listings.find(listing => listing.listing_id === listingId) ?? listings[0];
  const dimensionValues = selectedListing ? listingViewingDimensions(selectedListing) : null;
  const records = stored?.records ?? [];
  const currentRecords = records.filter(record => record.client_id === currentClientId);
  const summary = summarizeViewingEvidence(currentRecords, access);
  const cohort = buildBudgetCohort(requirement, records, access);
  const canWrite = !!salesId && !!storageScope && !!stored && !storageError;
  const hasExamples = records.some(record => record.source_kind === 'fictional_example');

  function reloadRecords() {
    if (!salesId || !storageScope) { setStored(null); setStorageError(''); return; }
    try { setStored(loadViewingRecords(window.localStorage, access)); setStorageError(''); }
    catch (error) { setStored(null); setStorageError(error instanceof Error ? error.message : 'Viewing records could not be loaded.'); }
  }
  useEffect(() => {
    reloadRecords();
    if (!salesId || !storageScope) return;
    let key: string;
    try { key = viewingStorageKey(access); } catch { return; }
    const onStorage = (event: StorageEvent) => { if (event.key === key || event.key === null) { setSaveStatus(''); reloadRecords(); } };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [access]);
  useEffect(() => { setFeedback(''); setSignal('not_recorded'); setTagDimensions([]); setSaveStatus(''); setSaveError(''); }, [currentClientId]);

  function persist(additions: ViewingRecord[]) {
    if (!stored || !canWrite) throw new Error('Select a Sales ID and load browser records before saving.');
    const next = saveViewingRecords(window.localStorage, access, additions, stored.revision);
    setStored(next);
    setSaveStatus(`${additions.length === 1 ? 'Viewing record' : `${additions.length} fictional viewing records`} saved in this browser.`);
  }
  function saveViewing(event: React.FormEvent) {
    event.preventDefault(); setSaveError(''); setSaveStatus(''); setWriting(true);
    try {
      if (!selectedListing || !currentClientId || !viewedAt) throw new Error('Choose a client, property and viewing date.');
      const isoDate = new Date(viewedAt).toISOString();
      const preferenceTags = tagDimensions.flatMap(dimension => dimensionValues?.[dimension] ? [{ dimension, value: dimensionValues[dimension]! }] : []);
      const record = createViewingRecord(access, { client_id: currentClientId, listing_id: selectedListing.listing_id, viewed_at: isoDate, feedback, feedback_signal: signal, preference_tags: preferenceTags });
      persist([record]); setFeedback(''); setSignal('not_recorded'); setTagDimensions([]);
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'Saving could not be confirmed.'); }
    finally { setWriting(false); }
  }
  function examples() {
    setSaveError(''); setSaveStatus(''); setWriting(true);
    try { persist(createFictionalViewingExamples(access)); }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'Examples could not be saved.'); }
    finally { setWriting(false); }
  }

  return <section className="report-tab" aria-label="Client profile report">
    <div className="report-section-heading"><div><p className="report-eyebrow">Recorded needs & viewings</p><h2>Client profile report</h2><p>Visible clients for {salesId || 'the selected Sales ID'} · Rule summary, no language model or trained preference model.</p></div><Tag>Rule summary</Tag></div>
    {!salesId && <Alert type="info" showIcon message="Select a Sales ID to view client reports and record viewings." />}
    {salesId && !storageScope && <Alert type="info" message="Preparing the data scope. Viewing records cannot be saved yet." />}
    {storageError && <Alert data-testid="viewing-storage-error" type="error" showIcon message="Browser viewing records need attention" description={storageError} action={<Button onClick={reloadRecords}>Reload viewing records</Button>} />}
    {saveError && <Alert data-testid="viewing-save-error" type="error" showIcon message="Saving could not be confirmed" description={saveError} action={<Button onClick={reloadRecords}>Reload viewing records</Button>} />}
    {saveStatus && <Alert data-testid="viewing-save-status" type="success" showIcon message={saveStatus} />}
    {!salesId || !selectedClient || !requirement ? <Empty description="No visible client requirements are available for this report." /> : <>
      <div className="report-selectors"><label className="report-field"><span>Report client</span><select aria-label="Report client" value={currentClientId} onChange={event => { setClientId(event.target.value); setRequirementId(''); }}>{groups.map(([id, rows]) => <option key={id} value={id}>{rows[0].client_alias} · {id}</option>)}</select></label><label className="report-field"><span>Client requirement</span><select aria-label="Client report requirement" value={requirement.requirement_id} onChange={event => setRequirementId(event.target.value)}>{selectedClient[1].map(row => <option key={row.requirement_id} value={row.requirement_id}>{row.requirement_id}</option>)}</select></label></div>
      <section className="report-client-brief"><div><Tag>{requirement.data_kind === 'demo' ? 'Demonstration client' : 'Recorded client requirement'}</Tag><h3>{requirement.client_alias}</h3><p>{selectedClient[1].length} independently recorded requirement{selectedClient[1].length === 1 ? '' : 's'} · {currentRecords.length} viewing record{currentRecords.length === 1 ? '' : 's'}</p></div><dl><dt>Stated budget</dt><dd>{money(requirement.budget_min, requirement.currency)} – {money(requirement.budget_max, requirement.currency)} ({pretty(requirement.budget_constraint)})</dd><dt>Areas / types</dt><dd>{requirement.preferred_areas?.join(', ') || 'Not supplied'} / {requirement.property_types?.map(pretty).join(', ') || 'Not supplied'}</dd><dt>Purchase by</dt><dd>{requirement.purchase_by || 'Not confirmed'}</dd><dt>Stated preferences</dt><dd>{requirement.soft_preferences || 'Not supplied'}</dd></dl><details><summary>Original request and source</summary><blockquote>{requirement.raw_request}</blockquote><p><strong>Hard restrictions:</strong> {requirement.hard_constraints || 'Not supplied'}</p><p><SourceRef value={requirement.source_ref} /> · {requirement.captured_at}</p><p>{pretty(requirement.verification_status)} · {requirement.missing_questions || 'Confirm outstanding conditions with the client.'}</p></details></section>
      <div className="report-client-layout">
        <section className="report-panel"><div className="report-section-heading"><h3>Viewing history</h3><span data-testid="client-viewing-count">{currentRecords.length} recorded viewings</span></div><p className="report-note">Newest viewing first. These records stay in this browser, for this Sales ID and data version. They do not update the original client records.</p><ViewingTimeline records={currentRecords} listings={listings} onOpenProperty={onOpenProperty} /></section>
        <section className="report-panel"><h3>Add a viewing record</h3><p className="report-note">Record what sales observed or what the client explicitly said. Saving does not verify a real-world viewing.</p>
          <form onSubmit={saveViewing} className="report-viewing-form">
            <label className="report-field"><span>Viewed property</span><select aria-label="Viewed property" value={selectedListing?.listing_id ?? ''} onChange={event => { setListingId(event.target.value); setTagDimensions([]); }} required disabled={!listings.length}>{listings.map(listing => <option key={listing.listing_id} value={listing.listing_id}>{listing.title} · {listing.listing_id}</option>)}</select></label>
            <label className="report-field"><span>Viewed at (your local time)</span><input aria-label="Viewed at" type="datetime-local" value={viewedAt} required onChange={event => setViewedAt(event.target.value)} /></label>
            <label className="report-field"><span>Visit feedback signal</span><select aria-label="Visit feedback signal" value={signal} onChange={event => setSignal(event.target.value as ViewingFeedbackSignal)}>{(['not_recorded', 'positive', 'mixed', 'negative'] as const).map(value => <option key={value} value={value}>{pretty(value)}</option>)}</select></label>
            <label className="report-field"><span>Viewing feedback</span><textarea aria-label="Viewing feedback" rows={3} maxLength={4000} value={feedback} onChange={event => setFeedback(event.target.value)} placeholder="Record the client's words or your observation, without inferring buying power." /></label>
            <fieldset><legend>Explicitly stated preferences</legend><p className="report-note">Select only dimensions the client explicitly said they liked. Positive feedback alone does not select these tags.</p>{(['area', 'type', 'size'] as const).map(dimension => <label className="report-checkbox" key={dimension}><input type="checkbox" aria-label={`Stated ${dimension} preference`} checked={tagDimensions.includes(dimension)} disabled={!dimensionValues?.[dimension]} onChange={event => setTagDimensions(previous => event.target.checked ? [...previous, dimension] : previous.filter(value => value !== dimension))} /><span>{pretty(dimension)}: {pretty(dimensionValues?.[dimension])}</span></label>)}</fieldset>
            <Button type="primary" htmlType="submit" loading={writing} disabled={!canWrite || !selectedListing}>Save viewing record</Button><span className="report-note">{selectedListing?.data_kind === 'demo' || requirement.data_kind === 'demo' ? 'Will be marked as a demonstration record.' : 'Will be marked sales-entered and unverified.'}</span>
          </form>
        </section>
      </div>
      <section className="report-panel"><div className="report-section-heading"><h3>Observed viewings for this client</h3><Tag>Rule summary</Tag></div><ObservationTable summary={summary} /></section>
      <section className="report-panel" data-testid="budget-cohort"><div className="report-section-heading"><h3>Clients with overlapping stated budgets</h3><Tag>Observed viewings</Tag></div><p className="report-note">Other visible clients under this Sales ID only. Each qualifying requirement must have the same known currency and both finite budget bounds. Closed intervals overlap when max(minimums) ≤ min(maximums), including a shared endpoint. Requirements are checked independently; a client's budgets are never merged. Each client is counted once. Group observations require at least two other clients with recorded viewings.</p>
        {cohort.members.length > 0 && <ul className="report-cohort-members">{cohort.members.map(member => <li key={member.client_id}><strong>{member.client_alias}</strong> · {member.client_id} · {member.viewing_count} viewing{member.viewing_count === 1 ? '' : 's'}<small>Qualifying requirement: {member.requirement_ids.join(', ')}</small></li>)}</ul>}
        {!cohort.available ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={cohort.reason} /> : <ObservationTable summary={cohort.summary} />}
        <p className="report-note">This is a count of the supplied observations, not a claim about group preferences, buying power or likelihood of closing.</p>
      </section>
      <section className="report-fictional-tools"><div><Tag>Demonstration records</Tag><h3>Explore with fictional viewing examples</h3><p>Explicitly adds up to six invented viewings for currently visible demonstration clients and properties. No history is added to real client records.</p></div><Button onClick={examples} disabled={!canWrite || writing || hasExamples}>{hasExamples ? 'Fictional examples already loaded' : 'Load fictional viewing examples'}</Button></section>
    </>}
  </section>;
}

function ReportsWorkspace(props: ReportsProps) {
  return <div className="reports-workspace"><Tabs defaultActiveKey="property" items={[
    { key: 'property', label: 'Property scan report', children: <PropertyScan dataset={props.dataset} listings={props.listings} onOpenProperty={props.onOpenProperty} /> },
    { key: 'client', label: 'Client profile report', children: <ClientProfiles requirements={props.requirements} listings={props.listings} salesId={props.salesId} storageScope={props.storageScope} onOpenProperty={props.onOpenProperty} /> },
  ]} /></div>;
}

/** Remount synchronously on identity/scope changes so the previous sales report never flashes. */
export function Reports(props: ReportsProps) {
  return <ReportsWorkspace key={`${props.salesId ?? 'signed-out'}:${props.storageScope ?? 'pending'}`} {...props} />;
}
