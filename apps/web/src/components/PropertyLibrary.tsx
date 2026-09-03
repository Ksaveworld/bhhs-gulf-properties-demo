import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react';
import { Alert, Button, Empty, Select, Table, Tag, Tooltip } from 'antd';
import { ApartmentOutlined, ArrowDownOutlined, ArrowRightOutlined, ArrowUpOutlined, CheckCircleOutlined, FilterOutlined, SlidersOutlined, TeamOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ClientRequirement, ListingSnapshot } from '../../../../shared/types';
import { convertArea, evaluateMatch, filterListings, getAreaRangeError, requirementTextReview, type Filters } from '../../../../shared/matching';
import { requirementAreaWarnings } from '../../../../shared/requirement-area';
import { FilterEditor } from './FilterEditor';
import { date, display, money } from '../format';

type Props = {
  listings: ListingSnapshot[]; requirements: ClientRequirement[]; filters: Filters; onFilter: (next: Filters) => void;
  active: ClientRequirement | null; onViewClient: (req: ClientRequirement) => void; onReview: (req: ClientRequirement) => void;
  onOpen: (id: string) => void; onReset: () => void; localControls: (req: ClientRequirement) => ReactNode;
};
export function PropertyLibrary({ listings, requirements, filters, onFilter, active, onViewClient, onReview, onOpen, onReset, localControls }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [filters]);
  const areas = [...new Set(listings.map(l => l.area_name))].sort();
  const budgetError = filters.budget_min !== null && filters.budget_max !== null && filters.budget_min > filters.budget_max;
  const rangeError = getAreaRangeError(filters);
  const rows = budgetError ? [] : filterListings(listings, filters);
  const areaPending = (filters.area_min !== null || filters.area_max != null) && (!filters.area_basis || filters.area_basis === 'unknown' || !filters.area_unit);
  const textWarnings = active ? requirementTextReview(active).warnings : [];
  function sortTitle(label: string, key: 'price' | 'updated') {
    return <span className="column-sort"><span>{label}</span><span>{(['asc', 'desc'] as const).map(direction => <button key={direction} aria-label={`Sort ${label.toLowerCase()} ${direction === 'asc' ? 'ascending' : 'descending'}`} aria-pressed={filters.sort === `${key}_${direction}`} onClick={() => onFilter({ ...filters, sort: `${key}_${direction}` })}>{direction === 'asc' ? <ArrowUpOutlined /> : <ArrowDownOutlined />}</button>)}</span></span>;
  }
  const columns: ColumnsType<ListingSnapshot> = [
    { title: 'Property', key: 'property', width: 240, render: (_, l) => <button className="property-link" onClick={() => onOpen(l.listing_id)} aria-label={`Open ${l.title}`}><span className={`property-symbol ${l.market_segment === 'off_plan' ? 'off-plan' : ''}`}><ApartmentOutlined /></span><span><strong>{l.title}</strong><span className="record-id">{l.listing_id} · {l.data_kind === 'demo' ? 'DEMO' : 'Product data'}</span></span></button> },
    { title: 'Area / Location', key: 'location', width: 145, render: (_, l) => l.area_name },
    { title: 'Property type', key: 'type', width: 120, render: (_, l) => display(l.property_type) },
    { title: 'Bedrooms · Size', key: 'spec', width: 180, render: (_, l) => <div><strong>{l.bedrooms === null ? 'Beds undisclosed' : l.bedrooms === 0 ? 'Studio' : `${l.bedrooms} Beds`} · {l.area_value === null || !l.area_unit ? 'Size undisclosed' : `${convertArea(l.area_value, l.area_unit, 'sqft').toLocaleString('en-US', { maximumFractionDigits: 0 })} sq ft`}</strong><span className="table-caption">{display(l.area_basis)}{l.area_unit === 'sqm' ? ' · converted from sqm' : ''}</span></div> },
    { title: sortTitle('Asking price', 'price'), key: 'price', width: 185, render: (_, l) => <div><strong className="price">{money(l.asking_price, l.currency)}</strong><span className="table-caption">{l.listing_status === 'active' ? 'Current listing' : 'Recorded asking price'}</span></div> },
    { title: 'Status', key: 'status', width: 112, render: (_, l) => <div><Tag className={l.market_segment === 'ready' ? 'ready-tag' : ''}>{display(l.market_segment)}</Tag><span className="table-caption">{display(l.listing_status)}</span></div> },
    { title: sortTitle('Updated', 'updated'), key: 'updated', width: 145, render: (_, l) => <span className="updated-date">{date(l.captured_at)}</span> },
    ...(active ? [{ title: 'Client fit', key: 'fit', width: 132, render: (_: unknown, l: ListingSnapshot) => { const m = evaluateMatch(l, active); return <Tooltip title={[...m.conflicts, ...m.unknowns].join(' ')}><Tag color={m.status === 'match' ? 'green' : m.status === 'excluded' ? 'red' : 'gold'}>{m.status === 'match' ? 'Conditions met' : m.status === 'excluded' ? 'Conflict' : 'Review details'}</Tag></Tooltip>; } }] : []),
    { title: '', key: 'open', width: 42, render: (_, l) => <Button type="text" aria-label={`Details ${l.listing_id}`} icon={<ArrowRightOutlined />} onClick={() => onOpen(l.listing_id)} /> },
  ];
  return <>
    <section className="filter-panel" aria-label="Property filters">
      <div className="filter-heading"><span><FilterOutlined /> Refine your search <small>· {filters.currency || 'Currency to confirm'}</small></span><div><Button type="text" size="small" onClick={onReset}>Reset filters</Button><Button type="text" size="small" icon={<SlidersOutlined />} onClick={() => setExpanded(!expanded)}>{expanded ? 'Fewer filters' : 'More filters'}</Button></div></div>
      <div className={expanded ? 'filter-display expanded' : 'filter-display'}><FilterEditor value={filters} onChange={onFilter} areas={areas} compact={!expanded} /></div>
      {budgetError && <Alert type="error" message="Minimum price must not exceed maximum price." />}
      {rangeError && <Alert type="error" message={rangeError} />}
      {areaPending && <Alert data-testid="library-area-warning" type="warning" showIcon message="Area basis needs confirmation (面积口径待确认)" description="Confirm the required area basis and unit. Missing information is not evidence that no suitable property exists." />}
      {!!textWarnings.length && <Alert data-testid="library-text-warning" type="warning" showIcon message="Original wording needs confirmation" description={<><p>These are structured candidates, not confirmed recommendations.</p><ul>{textWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul></>} />}
    </section>
    <div className={`library-layout ${active ? '' : 'library-no-active'}`}>
      <section className="results-panel"><div className="results-toolbar"><div><h2><span data-testid="result-count">{rows.length}</span> properties</h2><span>{active ? `Structured search for ${active.client_alias}` : 'In your current selection'}</span></div><span className="source-note">Sort using the column arrows</span></div>
        <Table className="property-table" rowKey="listing_id" columns={columns} dataSource={rows} pagination={{ current: page, onChange: setPage, pageSize: 6, showSizeChanger: false, hideOnSinglePage: true }} scroll={{ x: active ? 1410 : 1280 }} onRow={l => ({ 'data-testid': `listing-${l.listing_id}` } as HTMLAttributes<HTMLTableRowElement>)} locale={{ emptyText: <Empty description={<><strong>{areaPending ? 'Area comparison is awaiting confirmation.' : 'No properties meet these filters.'}</strong><p>{areaPending ? 'Missing information does not confirm a lack of suitable properties.' : 'Review your filters. Unknown fields cannot satisfy a selected condition.'}</p><Button onClick={onReset}>Reset filters</Button></>} /> }} />
        <div className="table-footer"><CheckCircleOutlined /> Latest snapshot per listing · Listing price and transaction price are kept separate.</div>
      </section>
      <aside className="client-brief"><div className="brief-header"><span>CLIENT BRIEF</span><TeamOutlined /></div><h2>{active?.client_alias ?? 'Choose a client requirement.'}</h2><p>Original and private requirements remain independent.</p>
        <label className="field"><span>Select a client requirement</span><Select aria-label="Select a client requirement" placeholder="Choose a client" value={active?.requirement_id} options={requirements.map(r => ({ value: r.requirement_id, label: `${r.client_alias} · ${r.requirement_id}` }))} onChange={id => { const r = requirements.find(r => r.requirement_id === id); if (r) onViewClient(r); }} /></label>
        {active && <><Button block onClick={() => onReview(active)}>Review selected requirement</Button>{localControls(active)}{requirementAreaWarnings(active).length > 0 && <Alert type="warning" message="Area basis needs confirmation (面积口径待确认)" description={requirementAreaWarnings(active).join(' ')} />}<dl className="brief-facts"><dt>Stated budget</dt><dd>{money(active.budget_max, active.currency)}<small>{active.budget_constraint} constraint</small></dd><dt>Purchase purpose</dt><dd>{display(active.purchase_purpose)}</dd><dt>Purchase by</dt><dd>{date(active.purchase_by)}</dd><dt>Preferences</dt><dd>{active.soft_preferences || 'Not recorded'}</dd></dl><div className="brief-next"><strong>To clarify</strong><p>{active.missing_questions || 'Confirm availability, total fees and any unverified requirements.'}</p></div><p className="source-note">{active.requirement_id}<br />{active.source_ref}</p><Button block onClick={onReset}>Clear client search</Button></>}
      </aside>
    </div>
  </>;
}
