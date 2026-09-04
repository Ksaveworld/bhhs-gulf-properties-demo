import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Button, Drawer, Empty, Tabs, Tag } from 'antd';
import type { ClientRequirement, ListingSnapshot } from '../../../../shared/types';
import type { LocalRequirementCopy } from '../../../../shared/local-requirements';
import { clientRequirementHistory, companyAssignment } from '../../../../shared/client-requirement-history';
import { CLIENT_VISIBILITY_LABELS, type ClientVisibility } from '../../../../shared/client-directory';
import { evaluateMatch, latestListings, requirementTextReview } from '../../../../shared/matching';
import { requirementAreaWarnings, resolveRequirementArea } from '../../../../shared/requirement-area';
import { clientDisplayName, propertyAreaSqft, propertyDisplayName } from '../../../../shared/property-presentation';
import {
  createFictionalViewingExamples, createViewingRecord, listingViewingDimensions, loadViewingRecords,
  saveViewingRecords, sortViewingRecords, viewingStorageKey,
  type StoredViewingRecords, type ViewingAccess, type ViewingDimension, type ViewingFeedbackSignal, type ViewingRecord,
} from '../../../../shared/viewing-records';
import { clientBudgetLabel } from './ClientDirectory';
import { EnglishDateInput, isValidEnglishDateValue } from './EnglishDateInput';
import '../client-detail.css';

export interface ClientDetailProps {
  clientId: string | null;
  open?: boolean;
  requirements: ClientRequirement[];
  originals: ClientRequirement[];
  copies: LocalRequirementCopy[];
  listings: ListingSnapshot[];
  viewingListings?: ListingSnapshot[];
  salesId: string | null;
  storageScope: string | null;
  onClose: () => void;
  onOpenProperty: (id: string) => void;
  onEdit: (requirement: ClientRequirement) => void;
  onExport: (clientId: string, requirementId?: string) => void;
  renderLocalControls: (requirement: ClientRequirement) => ReactNode;
  onUseFeedback?: (requirement: ClientRequirement, feedback: string) => void;
  getVisibility?: (requirementId: string) => ClientVisibility;
}
const pretty = (value: string | null | undefined) => value ? value.replaceAll('_', ' ') : 'Not supplied';
const money = (value: number | null, currency: string | null) => value === null ? 'Price not supplied' : `${currency && currency !== 'other' ? currency : 'Currency unknown'} ${value.toLocaleString('en-US')}`;
const dateLabel = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Date not supplied';
const localDate = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

function SourceLink({ value }: { value: string }) {
  try { const url = new URL(value); if (['http:', 'https:'].includes(url.protocol)) return <a href={url.href} target="_blank" rel="noopener noreferrer">View Source</a>; } catch { /* Retain non-URL references as text. */ }
  return <span>{value || 'Source not supplied'}</span>;
}

function CurrentNeed({ requirement }: { requirement: ClientRequirement }) {
  const area = resolveRequirementArea(requirement);
  const size = [requirement.area_min === null ? null : `Min ${requirement.area_min.toLocaleString('en-US')}`, requirement.area_max == null ? null : `Max ${requirement.area_max.toLocaleString('en-US')}`].filter(Boolean).join(' / ');
  return <dl className="client-detail-facts">
    <div><dt>Budget Range</dt><dd>{clientBudgetLabel(requirement)}</dd></div><div><dt>Preferred Location</dt><dd>{requirement.preferred_areas?.join(', ') || 'Not supplied'}</dd></div>
    <div><dt>Property Type</dt><dd>{requirement.property_types?.map(pretty).join(', ') || 'Not supplied'}</dd></div><div><dt>Bedrooms</dt><dd>{requirement.bedrooms_min === null ? 'Not supplied' : `${requirement.bedrooms_min}+`}</dd></div>
    <div><dt>Size Range</dt><dd>{size ? `${size} ${requirement.area_unit === 'sqft' ? 'sq ft' : requirement.area_unit === 'sqm' ? 'sq m' : '(unit not confirmed)'} · ${area.basis && area.basis !== 'unknown' ? pretty(area.basis) : 'Area basis needs confirmation'}` : 'Not supplied'}</dd></div><div><dt>Completion Preference</dt><dd>{pretty(requirement.market_preference)}</dd></div>
    <div><dt>Purchase By</dt><dd>{requirement.purchase_by || 'Not confirmed'}</dd></div><div><dt>Available / Move-in By</dt><dd>{requirement.move_in_by || 'Not confirmed'}</dd></div>
    {requirement.purchase_purpose !== 'unknown' && <div><dt>Purchase Purpose</dt><dd>{pretty(requirement.purchase_purpose)}</dd></div>}
    {requirement.soft_preferences && <div className="client-detail-wide"><dt>Preferences / Notes</dt><dd>{requirement.soft_preferences}</dd></div>}
  </dl>;
}

function ClientDetailWorkspace(props: ClientDetailProps) {
  const { clientId, requirements, originals, copies, listings, viewingListings = listings, salesId, storageScope, onClose, onOpenProperty, onEdit, onExport, renderLocalControls, onUseFeedback, getVisibility } = props;
  const plans = useMemo(() => requirements.filter(row => row.client_id === clientId).sort((a, b) => {
    const time = (row: ClientRequirement) => Date.parse(copies.find(copy => copy.requirement.requirement_id === row.requirement_id)?.saved_at ?? row.captured_at);
    return time(b) - time(a) || b.requirement_id.localeCompare(a.requirement_id);
  }), [requirements, copies, clientId]);
  const [planId, setPlanId] = useState('');
  const requirement = plans.find(row => row.requirement_id === planId) ?? plans[0];
  const visibility = requirement ? getVisibility?.(requirement.requirement_id) ?? (originals.some(row => row.client_id === clientId) ? 'company' : salesId ? 'private' : 'legacy') : 'company';
  const access = useMemo<ViewingAccess>(() => ({ scope: storageScope, salesId, requirements, listings: viewingListings }), [storageScope, salesId, requirements, viewingListings]);
  const [stored, setStored] = useState<StoredViewingRecords | null>(null);
  const [storageError, setStorageError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [listingId, setListingId] = useState(viewingListings[0]?.listing_id ?? '');
  const [viewedAt, setViewedAt] = useState(localDate);
  const [feedback, setFeedback] = useState('');
  const [signal, setSignal] = useState<ViewingFeedbackSignal>('not_recorded');
  const [tagDimensions, setTagDimensions] = useState<ViewingDimension[]>([]);
  const [writing, setWriting] = useState(false);
  const selectedListing = viewingListings.find(row => row.listing_id === listingId) ?? viewingListings[0];
  const dimensions = selectedListing ? listingViewingDimensions(selectedListing) : null;
  const records = (stored?.records ?? []).filter(row => row.client_id === clientId);
  const canWrite = !!salesId && !!storageScope && !!stored && !storageError;
  const history = requirement ? clientRequirementHistory(requirement, originals, copies) : [];
  const matches = requirement ? latestListings(listings).map(listing => ({ listing, result: evaluateMatch(listing, requirement) })) : [];

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

  function persist(additions: ViewingRecord[]) {
    if (!stored || !canWrite) throw new Error('Sign in and load browser records before saving.');
    const next = saveViewingRecords(window.localStorage, access, additions, stored.revision);
    setStored(next); setSaveStatus('Saved to this browser.');
    window.dispatchEvent(new Event('bhhs:viewings-changed'));
  }
  function saveViewing(event: React.FormEvent) {
    event.preventDefault(); setSaveError(''); setSaveStatus(''); setWriting(true);
    try {
      if (!selectedListing || !clientId || !viewedAt) throw new Error('Choose a property and viewing date.');
      if (!isValidEnglishDateValue(viewedAt, 'datetime-local')) throw new Error('Choose a valid viewing date and time.');
      const record = createViewingRecord(access, { client_id: clientId, listing_id: selectedListing.listing_id, viewed_at: new Date(viewedAt).toISOString(), feedback, feedback_signal: signal,
        preference_tags: tagDimensions.flatMap(dimension => dimensions?.[dimension] ? [{ dimension, value: dimensions[dimension]! }] : []),
      });
      persist([record]); setFeedback(''); setSignal('not_recorded'); setTagDimensions([]);
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'Saving could not be confirmed.'); }
    finally { setWriting(false); }
  }
  function examples() {
    setSaveError(''); setSaveStatus('');
    try { persist(createFictionalViewingExamples({ ...access, requirements: requirements.filter(row => row.client_id === clientId) })); }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'Examples could not be saved.'); }
  }

  const recommendationTab = requirement ? <div className="client-detail-recommendations">
    {visibility === 'company' && companyAssignment(originals, requirement.client_id).needs_confirmation && <Alert type="warning" message="Company assignment needs confirmation" description="Imported records name different sales owners. Confirm the assignment before updating the source data." />}
    <section className="client-detail-current" data-requirement-id={requirement.requirement_id}>
      <div className="client-detail-section-heading"><h3>Current Needs</h3><Button disabled={!salesId} onClick={() => onEdit(requirement)}>Edit Current Needs</Button></div>
      {plans.length > 1 && <label className="client-detail-plan"><span>Independent plan</span><select aria-label="Independent client plan" value={requirement.requirement_id} onChange={event => setPlanId(event.target.value)}>{plans.map((row, index) => <option key={row.requirement_id} value={row.requirement_id}>{row.preferred_areas?.join(', ') || 'Location to confirm'} · {clientBudgetLabel(row)} · Plan {index + 1}</option>)}</select></label>}
      <CurrentNeed requirement={requirement} />
      {requirementAreaWarnings(requirement).length > 0 && <Alert type="warning" showIcon message="Area basis needs confirmation" description="Confirm the measurement basis before comparing the requested size with properties." />}
      {(requirementTextReview(requirement).warnings.length > 0 || requirement.missing_questions) && <Alert type="warning" showIcon message="Details to clarify" description={requirement.missing_questions || 'Review the original wording and structured needs with the client.'} />}
      <details className="client-detail-source"><summary>Original request and source</summary><blockquote>{requirement.raw_request || 'Not supplied'}</blockquote><p><strong>Required conditions:</strong> {requirement.hard_constraints || 'Not supplied'}</p><p>{requirement.source_name} · <SourceLink value={requirement.source_ref} /></p>{requirementTextReview(requirement).warnings.length > 0 && <ul>{requirementTextReview(requirement).warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}</details>
      <details className="client-detail-history"><summary>Requirement History · {history.length} version{history.length === 1 ? '' : 's'}</summary><ol>{history.map(entry => <li key={entry.requirement.requirement_id}><div><time dateTime={entry.recorded_at}>{dateLabel(entry.recorded_at)}</time> <Tag>{entry.is_current ? 'Current version' : entry.kind === 'original' ? 'Imported version' : 'Previous version'}</Tag></div>{entry.parent_missing && <p>The previous local version is no longer available.</p>}{entry.kind === 'revision' && !entry.parent_missing ? entry.changes.length > 0 ? <ul>{entry.changes.map(change => <li key={change.field}><strong>{change.label}</strong>: {change.kind === 'added' ? `Added ${change.after}` : change.kind === 'removed' ? `Removed ${change.before}` : `${change.before} → ${change.after}`}</li>)}</ul> : <p>No changes to the recorded needs.</p> : <p>{entry.kind === 'original' ? 'Original imported needs.' : 'Independent locally saved needs.'}</p>}<details><summary>Needs at this date</summary><CurrentNeed requirement={entry.requirement} /></details></li>)}</ol></details>
      <div className="client-detail-local-controls">{renderLocalControls(requirement)}</div>
    </section>
    {([{ status: 'match', title: 'Best Matches' }, { status: 'review', title: 'Worth Considering' }] as const).map(group => {
      const rows = matches.filter(item => item.result.status === group.status);
      return <section key={group.status} className="client-detail-match-group" data-match-group={group.status}><div className="client-detail-section-heading"><h3>{group.title}</h3><span>{rows.length} properties</span></div>{!rows.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={group.status === 'match' ? 'No properties currently meet all recorded conditions.' : 'No further properties available for review.'} /> : rows.map(({ listing, result }) => <article key={listing.listing_id} className="client-detail-property" data-listing-id={listing.listing_id}>
        <div className="client-detail-section-heading"><Button type="link" onClick={() => onOpenProperty(listing.listing_id)}>{propertyDisplayName(listing)}</Button><strong>{money(listing.asking_price, listing.currency)}</strong></div><p>{listing.area_name} · {pretty(listing.property_type)} · {listing.bedrooms === null ? 'Bedrooms not supplied' : `${listing.bedrooms} bedrooms`} · {propertyAreaSqft(listing)?.toLocaleString('en-US', { maximumFractionDigits: 0 }) ?? 'Size unknown'}{propertyAreaSqft(listing) !== null ? ' sq ft' : ''}</p>
        <p className="client-detail-match-reasons">{result.matched.slice(0, 3).join(' · ') || 'Needs a sales review.'}</p>{group.status === 'review' && <p className="client-detail-review-reasons">{[...result.conflicts, ...result.unknowns].slice(0, 2).join(' ')}</p>}<div className="client-detail-property-footer"><span>{records.some(record => record.listing_id === listing.listing_id) ? 'Previously viewed' : 'No viewing recorded'}</span><Button size="small" onClick={() => onOpenProperty(listing.listing_id)}>View Property Details</Button></div>
      </article>)}</section>;
    })}
  </div> : <Empty description="This client is not available in the current data and Sales ID." />;

  const viewingTab = <section className="client-detail-viewings">
    {!salesId && <Alert type="info" showIcon message="Sign in to view and record viewing feedback." />}
    {salesId && !storageScope && <Alert type="info" message="Preparing local records…" />}
    {storageError && <Alert type="error" data-testid="viewing-storage-error" message="Viewing records could not be loaded" description={storageError} action={<Button onClick={reloadRecords}>Reload Records</Button>} />}
    {saveError && <Alert type="error" data-testid="viewing-save-error" message="Saving could not be confirmed" description={saveError} action={<Button onClick={reloadRecords}>Reload Records</Button>} />}
    {saveStatus && <Alert type="success" data-testid="viewing-save-status" message={saveStatus} />}
    <div className="client-detail-section-heading"><h3>Viewing History</h3><span data-testid="client-viewing-count">{records.length} recorded viewings</span></div>
    {!records.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No viewing history recorded for this client." /> : <ol className="client-detail-viewing-timeline" aria-label="Client viewing timeline">{sortViewingRecords(records).map(record => {
      const listing = viewingListings.find(row => row.listing_id === record.listing_id);
      const reviewFeedback = [record.feedback, ...record.preference_tags.map(tag => `Explicit preference: ${pretty(tag.dimension)} — ${pretty(tag.value)}`)].filter(Boolean).join('\n');
      return <li key={record.record_id} data-viewing-id={record.record_id}><div><time dateTime={record.viewed_at}>{dateLabel(record.viewed_at)}</time> {record.source_kind === 'fictional_example' && <Tag>Fictional example</Tag>}</div><Button type="link" onClick={() => onOpenProperty(record.listing_id)}>{listing ? propertyDisplayName(listing) : 'Viewed property'}</Button><p><strong>Feedback:</strong> {pretty(record.feedback_signal)}</p><p>{record.feedback || 'No written feedback.'}</p>{record.preference_tags.length > 0 && <p><strong>Stated preferences:</strong> {record.preference_tags.map(tag => `${pretty(tag.dimension)}: ${pretty(tag.value)}`).join(' · ')}</p>}{onUseFeedback && requirement && reviewFeedback && <Button size="small" onClick={() => onUseFeedback(requirement, reviewFeedback)}>Review as Preference Update</Button>}<small>Recorded by {record.sales_id} · Saved in this browser</small></li>;
    })}</ol>}
    {salesId && requirement && <details className="client-detail-viewing-entry"><summary>Add a Viewing Record</summary><form className="client-detail-viewing-form" onSubmit={saveViewing}>
      <label><span>Viewed Property</span><select aria-label="Viewed property" value={selectedListing?.listing_id ?? ''} onChange={event => { setListingId(event.target.value); setTagDimensions([]); }} required>{viewingListings.map(listing => <option key={listing.listing_id} value={listing.listing_id}>{propertyDisplayName(listing)} · {listing.area_name}{listing.currency && listing.currency !== 'AED' ? ` · ${listing.currency}` : ''}</option>)}</select></label>
      <label><span>Viewed At (local time)</span><EnglishDateInput label="Viewed at" kind="datetime-local" value={viewedAt} onChange={setViewedAt} /></label>
      <label><span>Visit Feedback</span><select aria-label="Visit feedback signal" value={signal} onChange={event => setSignal(event.target.value as ViewingFeedbackSignal)}>{(['not_recorded', 'positive', 'mixed', 'negative'] as const).map(value => <option key={value} value={value}>{pretty(value)}</option>)}</select></label>
      <label className="client-detail-wide"><span>Viewing Feedback</span><textarea aria-label="Viewing feedback" rows={3} maxLength={4000} value={feedback} onChange={event => setFeedback(event.target.value)} placeholder="Record the client's comments." /></label>
      <fieldset className="client-detail-wide"><legend>Explicitly Stated Preferences</legend><p>Select only what the client said they liked.</p>{(['area', 'type', 'size'] as const).map(dimension => <label className="client-detail-checkbox" key={dimension}><input type="checkbox" aria-label={`Stated ${dimension} preference`} checked={tagDimensions.includes(dimension)} disabled={!dimensions?.[dimension]} onChange={event => setTagDimensions(previous => event.target.checked ? [...previous, dimension] : previous.filter(value => value !== dimension))} /><span>{pretty(dimension)}: {pretty(dimensions?.[dimension])}</span></label>)}</fieldset>
      <div className="client-detail-wide"><Button type="primary" htmlType="submit" loading={writing} disabled={!canWrite || !selectedListing}>Save Viewing Record</Button><small>Saved to this browser.</small></div>
    </form></details>}
    {requirement?.data_kind === 'demo' && <details className="client-detail-demo-tools"><summary>Viewing Examples</summary><p>Optional fictional viewing records for this client.</p><Button disabled={!canWrite || records.some(row => row.source_kind === 'fictional_example')} onClick={examples}>Load Fictional Viewings</Button></details>}
  </section>;

  return <Drawer open={props.open ?? !!clientId} onClose={onClose} width={840} rootClassName="client-detail-drawer" title={<div className="client-detail-title"><strong>{requirement ? clientDisplayName(requirement) : 'Client Details'}</strong><div><span>{clientId}</span><Tag>{CLIENT_VISIBILITY_LABELS[visibility]}</Tag>{visibility === 'private' && <span>Sales ID: {salesId || 'Not supplied'}</span>}</div></div>} extra={<Button disabled={!requirement || !clientId} onClick={() => clientId && requirement && onExport(clientId, requirement.requirement_id)}>Export Report</Button>}>
    <Tabs defaultActiveKey="recommended" items={[{ key: 'recommended', label: 'Recommended Properties', children: recommendationTab }, { key: 'viewings', label: 'Viewing History', children: viewingTab }]} />
  </Drawer>;
}

/** Scope and identity changes discard the previous client's viewing drafts synchronously. */
export function ClientDetail(props: ClientDetailProps) {
  return <ClientDetailWorkspace key={`${props.storageScope ?? 'pending'}:${props.salesId ?? 'signed-out'}:${props.clientId ?? 'closed'}`} {...props} />;
}
