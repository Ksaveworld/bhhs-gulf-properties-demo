import { useMemo, useState, type ReactNode } from 'react';
import { Alert, Button, Empty, Input, InputNumber, Radio, Select, Tag } from 'antd';
import { ArrowRightOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import {
  CLIENT_VISIBILITY_LABELS, EMPTY_CLIENT_DIRECTORY_FILTERS, clientDirectoryBudgetError,
  filterClientDirectory, hasClientDirectoryFilters,
  type ClientDirectoryFilters, type ClientVisibility,
} from '../../../../shared/client-directory';
import { requirementTextReview } from '../../../../shared/matching';
import { requirementAreaWarnings } from '../../../../shared/requirement-area';
import { clientDisplayName } from '../../../../shared/property-presentation';
import type { ClientRequirement, ListingSnapshot } from '../../../../shared/types';
import '../client-directory.css';

export interface ClientDirectoryProps {
  requirements: ClientRequirement[];
  listings: ListingSnapshot[];
  getVisibility: (requirementId: string) => ClientVisibility;
  onView: (requirement: ClientRequirement) => void;
  onAddPrivate: () => void;
  canAddPrivate: boolean;
  renderLocalControls: (requirement: ClientRequirement) => ReactNode;
  filters?: ClientDirectoryFilters;
  onFiltersChange?: (filters: ClientDirectoryFilters) => void;
}

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
export function clientBudgetLabel(requirement: ClientRequirement): string {
  if (clientDirectoryBudgetError(requirement)) return 'Budget needs review';
  const { budget_min: min, budget_max: max, currency } = requirement;
  if (min === null && max === null) return 'Not supplied';
  const unit = currency && currency !== 'other' ? currency : 'Currency unknown';
  if (min !== null && max !== null) return `${unit} ${number.format(min)} – ${number.format(max)}`;
  return min !== null ? `From ${unit} ${number.format(min)}` : `Up to ${unit} ${number.format(max!)}`;
}

export function ClientDirectory({ requirements, getVisibility, onView, onAddPrivate, filters: externalFilters, onFiltersChange }: ClientDirectoryProps) {
  const [localFilters, setLocalFilters] = useState<ClientDirectoryFilters>({ ...EMPTY_CLIENT_DIRECTORY_FILTERS });
  const filters = externalFilters ?? localFilters;
  const setFilters = (next: ClientDirectoryFilters) => { setLocalFilters(next); onFiltersChange?.(next); };
  const update = <K extends keyof ClientDirectoryFilters>(key: K, value: ClientDirectoryFilters[K]) => setFilters({ ...filters, [key]: value });
  const legacyCount = requirements.filter(row => getVisibility(row.requirement_id) === 'legacy').length;
  const groups = useMemo(() => filterClientDirectory(requirements.filter(row => filters.visibility === 'legacy' || getVisibility(row.requirement_id) !== 'legacy'), filters, getVisibility), [requirements, filters, getVisibility]);
  const budgetError = clientDirectoryBudgetError(filters);
  const filtered = hasClientDirectoryFilters(filters);

  return <section className="client-directory" aria-label="Client directory">
    <div className="client-directory-heading">
      <div><h2>Clients and Needs</h2><p>Review current needs, recommended properties and viewing feedback.</p></div>
      <div className="client-directory-add"><Button type="primary" icon={<PlusOutlined />} onClick={onAddPrivate}>Add Private Client</Button></div>
    </div>
    <div className="client-directory-filters" role="search" aria-label="Filter clients">
      <div className="client-directory-fields">
        <label className="client-directory-field" htmlFor="client-directory-name"><span>Client Name</span><Input id="client-directory-name" aria-label="Client Name" value={filters.name} allowClear prefix={<SearchOutlined />} placeholder="Search client name" onChange={event => update('name', event.target.value)} /></label>
        <label className="client-directory-field" htmlFor="client-directory-location"><span>Preferred Location</span><Input id="client-directory-location" aria-label="Preferred Location" value={filters.preferred_location} allowClear placeholder="Search preferred area" onChange={event => update('preferred_location', event.target.value)} /></label>
        <div className="client-directory-field"><span id="client-directory-budget-label">Budget Range <small>AED</small></span><div className={`client-directory-range${budgetError ? ' has-error' : ''}`} role="group" aria-labelledby="client-directory-budget-label">
          <InputNumber aria-label="Minimum client budget" value={filters.budget_min} min={0} controls={false} placeholder="Min" aria-invalid={Boolean(budgetError)} onChange={value => update('budget_min', value)} /><span aria-hidden="true">–</span><InputNumber aria-label="Maximum client budget" value={filters.budget_max} min={0} controls={false} placeholder="Max" aria-invalid={Boolean(budgetError)} onChange={value => update('budget_max', value)} />
        </div></div>
        <label className="client-directory-field" htmlFor="client-directory-property-type"><span>Property Type</span><Select id="client-directory-property-type" aria-label="Client Property Type" value={filters.property_type || undefined} allowClear placeholder="Any type" onChange={value => update('property_type', value ?? '')} options={['apartment', 'villa', 'townhouse', 'penthouse', 'land', 'other'].map(value => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }))} /></label>
      </div>
      <div className="client-directory-scope-row"><Radio.Group aria-label="Client visibility" value={filters.visibility} optionType="button" buttonStyle="solid" onChange={event => update('visibility', event.target.value)} options={[
        { label: 'All Clients', value: 'all' }, { label: 'Company Clients', value: 'company' }, { label: 'Private Clients', value: 'private' }, { label: 'Unassigned', value: 'unassigned' },
      ]} /><Button type="link" disabled={!filtered} onClick={() => setFilters({ ...EMPTY_CLIENT_DIRECTORY_FILTERS })}>Clear filters</Button></div>
      {budgetError && <Alert id="client-directory-budget-error" type="error" showIcon message={budgetError} />}
    </div>
    <div className="client-directory-results" role="status" aria-live="polite"><strong>{groups.length} client{groups.length === 1 ? '' : 's'}</strong>{filtered && <span>Matching your filters</span>}</div>
    {groups.length === 0 ? <div className="client-directory-empty"><Empty description={budgetError ? 'Correct the budget range to see clients.' : 'No clients match these filters.'} /></div> : <div className="client-directory-list">{groups.map(group => {
      const requirement = [...group.requirements].sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at) || b.requirement_id.localeCompare(a.requirement_id))[0];
      const name = clientDisplayName(requirement);
      const visibility = getVisibility(requirement.requirement_id);
      const areaNeedsReview = requirementAreaWarnings(requirement).length > 0;
      const needsReview = requirementTextReview(requirement).warnings.length > 0 || !!requirement.missing_questions;
      const unassigned = visibility === 'company' && !requirements.some(row => row.client_id === group.client_id && getVisibility(row.requirement_id) === 'company' && row.sales_owner?.trim());
      return <article key={group.client_id} className="client-directory-client" data-client-id={group.client_id} data-requirement-id={requirement.requirement_id}>
        <div className="client-directory-client-heading"><span className="client-directory-avatar" aria-hidden="true">{name.split(/\s+/).filter(Boolean).map(word => word[0]).slice(0, 2).join('')}</span><div className="client-directory-client-name"><strong>{name}</strong><span>{group.client_id}</span></div><Tag>{CLIENT_VISIBILITY_LABELS[visibility]}</Tag>{unassigned && <Tag>Unassigned</Tag>}</div>
        <div className="client-directory-card-body"><dl className="client-directory-facts"><div><dt>Budget Range</dt><dd>{clientBudgetLabel(requirement)}</dd></div><div><dt>Preferred Location</dt><dd>{requirement.preferred_areas?.join(', ') || 'Not supplied'}</dd></div><div><dt>Property Type</dt><dd>{requirement.property_types?.map(value => value.replaceAll('_', ' ')).join(', ') || 'Not supplied'}</dd></div><div><dt>Purchase By</dt><dd>{requirement.purchase_by || 'Not confirmed'}</dd></div></dl>
          <div className="client-directory-card-footer"><div>{areaNeedsReview && <Tag color="gold">Area basis needs confirmation</Tag>}{needsReview && <Tag color="gold">Details to clarify</Tag>}{group.total_requirements > 1 && <span className="client-directory-plan-note">{group.total_requirements} independent plans</span>}</div><Button onClick={() => onView(requirement)}>View Client Details <ArrowRightOutlined /></Button></div>
        </div>
      </article>;
    })}</div>}
    {legacyCount > 0 && <details className="client-directory-data-notes"><summary>Local data notes</summary><p>{legacyCount} older local copies have no assigned browser Sales ID. They retain their original ownership and have not been converted into unassigned company clients.</p><Button onClick={() => setFilters({ ...EMPTY_CLIENT_DIRECTORY_FILTERS, visibility: 'legacy' })}>Review legacy local copies</Button></details>}
  </section>;
}
