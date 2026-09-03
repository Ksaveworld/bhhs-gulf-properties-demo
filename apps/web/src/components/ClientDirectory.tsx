import { useMemo, useState, type ReactNode } from 'react';
import { Alert, Button, Empty, Input, InputNumber, Radio, Tag } from 'antd';
import { ArrowRightOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import {
  CLIENT_VISIBILITY_LABELS, EMPTY_CLIENT_DIRECTORY_FILTERS, clientDirectoryBudgetError,
  filterClientDirectory, hasClientDirectoryFilters,
  type ClientDirectoryFilters, type ClientVisibility,
} from '../../../../shared/client-directory';
import { filterListings, requirementsToFilters, requirementTextReview } from '../../../../shared/matching';
import { requirementAreaWarnings } from '../../../../shared/requirement-area';
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
}

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function budgetLabel(requirement: ClientRequirement): string {
  if (clientDirectoryBudgetError(requirement)) return 'Budget needs review';
  const { budget_min: min, budget_max: max, currency } = requirement;
  if (min === null && max === null) return 'Budget not supplied';
  const unit = currency && currency !== 'other' ? currency : 'Currency unknown';
  if (min !== null && max !== null) return `${unit} ${number.format(min)} – ${number.format(max)}`;
  return min !== null ? `From ${unit} ${number.format(min)}` : `Up to ${unit} ${number.format(max!)}`;
}

function VisibilityTag({ value }: { value: ClientVisibility }) {
  return <Tag className={`client-directory-visibility client-directory-visibility-${value}`}>{CLIENT_VISIBILITY_LABELS[value]}</Tag>;
}

export function ClientDirectory({
  requirements, listings, getVisibility, onView, onAddPrivate, canAddPrivate, renderLocalControls,
}: ClientDirectoryProps) {
  const [filters, setFilters] = useState<ClientDirectoryFilters>({ ...EMPTY_CLIENT_DIRECTORY_FILTERS });
  const update = <K extends keyof ClientDirectoryFilters>(key: K, value: ClientDirectoryFilters[K]) => {
    setFilters(current => ({ ...current, [key]: value }));
  };
  const groups = useMemo(() => filterClientDirectory(requirements, filters, getVisibility), [requirements, filters, getVisibility]);
  const requirementInfo = useMemo(() => new Map(requirements.map(requirement => [requirement.requirement_id, {
    candidates: filterListings(listings, requirementsToFilters(requirement)).length,
    areaNeedsReview: requirementAreaWarnings(requirement).length > 0,
    textNeedsReview: requirementTextReview(requirement).warnings.length > 0,
  }])), [requirements, listings]);
  const budgetError = clientDirectoryBudgetError(filters);
  const filtered = hasClientDirectoryFilters(filters);
  const matchingRequirements = groups.reduce((count, group) => count + group.requirements.length, 0);

  return <section className="client-directory" aria-label="Client directory">
    <div className="client-directory-heading">
      <div><h2>Clients</h2><p>Find a client, then choose the requirement you want to work with.</p></div>
      <div className="client-directory-add">
        <Button type="primary" icon={<PlusOutlined />} disabled={!canAddPrivate} onClick={onAddPrivate}>Add Private Client</Button>
        {!canAddPrivate && <span>Sign in to add a private client.</span>}
      </div>
    </div>

    <div className="client-directory-filters" role="search" aria-label="Filter clients">
      <div className="client-directory-fields">
        <label className="client-directory-field" htmlFor="client-directory-name"><span className="client-directory-field-label">Name</span>
          <Input id="client-directory-name" aria-label="Name" value={filters.name} allowClear prefix={<SearchOutlined />} placeholder="Search client name" onChange={event => update('name', event.target.value)} />
        </label>
        <label className="client-directory-field" htmlFor="client-directory-min-budget"><span className="client-directory-field-label">Min. budget <small>AED</small></span>
          <InputNumber id="client-directory-min-budget" aria-label="Min. budget" value={filters.budget_min} min={0} controls={false} placeholder="No minimum" status={budgetError ? 'error' : undefined} aria-invalid={Boolean(budgetError)} aria-describedby={budgetError ? 'client-directory-budget-error' : 'client-directory-budget-help'} onChange={value => update('budget_min', value)} />
        </label>
        <label className="client-directory-field" htmlFor="client-directory-max-budget"><span className="client-directory-field-label">Max. budget <small>AED</small></span>
          <InputNumber id="client-directory-max-budget" aria-label="Max. budget" value={filters.budget_max} min={0} controls={false} placeholder="No maximum" status={budgetError ? 'error' : undefined} aria-invalid={Boolean(budgetError)} aria-describedby={budgetError ? 'client-directory-budget-error' : 'client-directory-budget-help'} onChange={value => update('budget_max', value)} />
        </label>
        <label className="client-directory-field" htmlFor="client-directory-location"><span className="client-directory-field-label">Preferred location</span>
          <Input id="client-directory-location" aria-label="Preferred location" value={filters.preferred_location} allowClear placeholder="Search preferred area" onChange={event => update('preferred_location', event.target.value)} />
        </label>
      </div>
      <div className="client-directory-scope-row">
        <Radio.Group aria-label="Client visibility" value={filters.visibility} optionType="button" buttonStyle="solid" onChange={event => update('visibility', event.target.value)} options={[
          { label: 'All', value: 'all' }, { label: 'Company', value: 'company' }, { label: 'Private', value: 'private' },
          { label: 'Unassigned browser review', value: 'legacy' },
        ]} />
        <Button type="link" disabled={!filtered} onClick={() => setFilters({ ...EMPTY_CLIENT_DIRECTORY_FILTERS })}>Clear filters</Button>
      </div>
      <p id="client-directory-budget-help" className="client-directory-filter-help">Budget filters find overlapping stated AED ranges. Unknown budgets and other currencies are excluded when a budget limit is set.</p>
      {budgetError && <Alert id="client-directory-budget-error" type="error" showIcon message={budgetError} />}
    </div>

    <div className="client-directory-results" role="status" aria-live="polite">
      <strong>{groups.length} client{groups.length === 1 ? '' : 's'}</strong>
      <span>{matchingRequirements} {filtered ? 'matching ' : ''}requirement{matchingRequirements === 1 ? '' : 's'}{filtered ? ' · All filters apply to the same requirement.' : ''}</span>
    </div>

    {groups.length === 0 ? <div className="client-directory-empty"><Empty description={budgetError ? 'Correct the budget range to see clients.' : requirements.length === 0 ? 'No client requirements are available.' : 'No clients match these filters. Try another name, location or budget.'} /></div> :
      <div className="client-directory-list">{groups.map(group => {
        const visibilities = [...new Set(group.requirements.map(requirement => getVisibility(requirement.requirement_id)))];
        return <details key={group.client_id} className="client-directory-client" data-client-id={group.client_id} open>
          <summary className="client-directory-client-heading">
            <span className="client-directory-avatar" aria-hidden="true">{group.client_alias.split(/\s+/).filter(Boolean).map(word => word[0]).slice(0, 2).join('')}</span>
            <span className="client-directory-client-name"><strong>{group.client_alias}</strong><span>{group.client_id}</span></span>
            <span className="client-directory-client-tags">{visibilities.map(visibility => <VisibilityTag key={visibility} value={visibility} />)}</span>
            <span className="client-directory-requirement-count">{filtered ? `${group.requirements.length} matching of ${group.total_requirements}` : group.total_requirements} requirement{group.total_requirements === 1 ? '' : 's'}</span>
            <span className="client-directory-disclosure" aria-hidden="true">⌄</span>
          </summary>
          <div className="client-directory-requirements">{group.requirements.map(requirement => {
            const info = requirementInfo.get(requirement.requirement_id)!;
            return <article key={requirement.requirement_id} className="client-row client-directory-requirement" data-requirement-id={requirement.requirement_id} aria-label={`Requirement ${requirement.requirement_id} for ${requirement.client_alias}`}>
              <div className="client-directory-requirement-main">
                <div className="client-directory-requirement-heading"><h3>{requirement.requirement_id}</h3><VisibilityTag value={getVisibility(requirement.requirement_id)} /><Tag>{requirement.data_kind === 'demo' ? 'Demo' : 'Product data'}</Tag></div>
                <dl className="client-directory-facts"><div><dt>Stated budget</dt><dd>{budgetLabel(requirement)}</dd></div><div><dt>Preferred location</dt><dd>{requirement.preferred_areas?.length ? requirement.preferred_areas.join(', ') : 'Not supplied'}</dd></div><div><dt>Purchase by</dt><dd>{requirement.purchase_by ?? 'Unknown'}</dd></div></dl>
                <p className="client-directory-request">{requirement.raw_request || 'Original request not supplied.'}</p>
                <p className="client-directory-intent">Stated intent: {requirement.intent_evidence || 'Not recorded'}</p>
                <span className="client-directory-source">{requirement.source_name} · {requirement.source_ref}</span>
                <div className="client-directory-local-controls">{renderLocalControls(requirement)}</div>
              </div>
              <div className="client-directory-actions">
                <span className="client-directory-candidate-count"><strong>{info.candidates}</strong> structured candidates</span>
                {info.areaNeedsReview && <Tag color="gold">Area basis needs confirmation · 面积口径待确认</Tag>}
                {info.textNeedsReview && <Tag color="gold">Review details</Tag>}
                <Button onClick={() => onView(requirement)}>View properties <ArrowRightOutlined /></Button>
              </div>
            </article>;
          })}</div>
        </details>;
      })}</div>}
  </section>;
}
