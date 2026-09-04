import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react';
import { Alert, Button, Empty, InputNumber, Select, Table, Tag, Tooltip } from 'antd';
import { ApartmentOutlined, ArrowRightOutlined, CaretDownOutlined, CaretUpOutlined, CheckCircleOutlined, FilterOutlined, InfoCircleOutlined, SlidersOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ClientRequirement, ListingSnapshot } from '../../../../shared/types';
import { convertArea, evaluateMatch, filterListings, getAreaRangeError, requirementTextReview, type Filters } from '../../../../shared/matching';
import { propertyDisplayName } from '../../../../shared/property-presentation';
import { date, display, money } from '../format';
import './properties-v2.css';

type Props = {
  listings: ListingSnapshot[]; requirements: ClientRequirement[]; filters: Filters; onFilter: (next: Filters) => void;
  active: ClientRequirement | null; onViewClient: (req: ClientRequirement) => void; onReview: (req: ClientRequirement) => void;
  onOpen: (id: string) => void; onReset: () => void; localControls: (req: ClientRequirement) => ReactNode;
  onExport?: (listingId: string) => void;
};
export function PropertyLibrary({ listings, filters, onFilter, active, onOpen, onReset, onExport }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [filters]);
  const areas = [...new Set(listings.map(l => l.area_name))].sort();
  const budgetError = filters.budget_min !== null && filters.budget_max !== null && filters.budget_min > filters.budget_max;
  const rangeError = getAreaRangeError(filters);
  const rows = budgetError ? [] : filterListings(listings, filters);
  const areaPending = (filters.area_min !== null || filters.area_max != null) && (!filters.area_basis || filters.area_basis === 'unknown' || !filters.area_unit);
  const textWarnings = active ? requirementTextReview(active).warnings : [];
  const priceRangeLabel = `Price Range (${filters.currency || 'currency unconfirmed'})`;
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onFilter({ ...filters, [key]: value });
  const size = (value: number | null | undefined) => value == null || !filters.area_unit ? null : convertArea(value, filters.area_unit, 'sqft');
  const sizeUnitPending = !filters.area_unit && (filters.area_min != null || filters.area_max != null);
  const setSize = (key: 'area_min' | 'area_max', value: number | null) => onFilter({ ...filters, area_min: size(filters.area_min), area_max: size(filters.area_max), area_unit: 'sqft', [key]: value });
  const options = (values: string[]) => values.map(value => ({ value, label: display(value) }));
  const statusLabel = (value: string) => ({ ready: 'Ready', off_plan: 'Off-plan', active: 'Active', withdrawn: 'Withdrawn', sold: 'Sold', unknown: 'Unknown' }[value] || display(value));
  function sortTitle(label: string, key: 'price' | 'updated') {
    return <span className="column-sort pv2-column-sort"><span>{label}</span><span>{(['asc', 'desc'] as const).map(direction => <button key={direction} aria-label={`Sort ${label.toLowerCase()} ${direction === 'asc' ? 'ascending' : 'descending'}`} aria-pressed={filters.sort === `${key}_${direction}`} onClick={() => onFilter({ ...filters, sort: `${key}_${direction}` })}>{direction === 'asc' ? <CaretUpOutlined /> : <CaretDownOutlined />}</button>)}</span></span>;
  }
  const statusHelp = <div className="pv2-status-help"><strong>Completion Status</strong><p><b>Ready:</b> Completed and ready for handover or occupancy.</p><p><b>Off-plan:</b> Sold before completion; may be planned or under construction.</p><strong>Listing Status</strong><p><b>Active:</b> Currently listed and accepting buyer enquiries.</p><p><b>Withdrawn:</b> Removed from active marketing; this does not mean sold.</p><p><b>Sold:</b> Marked as sold by the source.</p></div>;
  const columns: ColumnsType<ListingSnapshot> = [
    { title: 'Property', key: 'property', width: 215, render: (_, l) => <button className="property-link" onClick={() => onOpen(l.listing_id)} aria-label={`Open ${propertyDisplayName(l)}`}><span className={`property-symbol ${l.market_segment === 'off_plan' ? 'off-plan' : ''}`}><ApartmentOutlined /></span><strong>{propertyDisplayName(l)}</strong></button> },
    { title: 'Area / Location', key: 'location', width: 145, render: (_, l) => l.area_name },
    { title: 'Property type', key: 'type', width: 120, render: (_, l) => display(l.property_type) },
    { title: 'Bedrooms · Size', key: 'spec', width: 180, render: (_, l) => <div><strong>{l.bedrooms === null ? 'Beds undisclosed' : l.bedrooms === 0 ? 'Studio' : `${l.bedrooms} Beds`} · {l.area_value === null || !l.area_unit ? 'Size undisclosed' : `${convertArea(l.area_value, l.area_unit, 'sqft').toLocaleString('en-US', { maximumFractionDigits: 0 })} sq ft`}</strong><span className="table-caption">{display(l.area_basis)}{l.area_unit === 'sqm' ? ' · converted from sqm' : ''}</span></div> },
    { title: sortTitle('Asking price', 'price'), key: 'price', width: 185, render: (_, l) => <div><strong className="price">{money(l.asking_price, l.currency)}</strong><span className="table-caption">{l.listing_status === 'active' ? 'Current listing' : 'Recorded asking price'}</span></div> },
    { title: <span className="pv2-status-title">Status <Tooltip title={statusHelp} trigger={['hover', 'focus']}><button className="pv2-status-info" aria-label="Status definitions"><InfoCircleOutlined /></button></Tooltip></span>, key: 'status', width: 125, render: (_, l) => <div><Tag aria-label={`Completion status: ${statusLabel(l.market_segment)}`} className={l.market_segment === 'ready' ? 'ready-tag' : ''}>{statusLabel(l.market_segment)}</Tag><span className="table-caption" aria-label={`Listing status: ${statusLabel(l.listing_status)}`}>{statusLabel(l.listing_status)}</span></div> },
    { title: sortTitle('Updated', 'updated'), key: 'updated', width: 145, render: (_, l) => <span className="updated-date">{date(l.captured_at)}</span> },
    ...(active ? [{ title: 'Client fit', key: 'fit', width: 132, render: (_: unknown, l: ListingSnapshot) => { const m = evaluateMatch(l, active); return <Tooltip title={[...m.conflicts, ...m.unknowns].join(' ')}><Tag color={m.status === 'match' ? 'green' : m.status === 'excluded' ? 'red' : 'gold'}>{m.status === 'match' ? 'Conditions met' : m.status === 'excluded' ? 'Conflict' : 'Review details'}</Tag></Tooltip>; } }] : []),
    { title: '', key: 'open', width: 42, render: (_, l) => <Button type="text" aria-label={`Details ${l.listing_id}`} icon={<ArrowRightOutlined />} onClick={() => onOpen(l.listing_id)} /> },
    ...(onExport ? [{ title: 'Report', key: 'export', width: 128, render: (_: unknown, l: ListingSnapshot) => <Button type="link" onClick={() => onExport(l.listing_id)} aria-label={`Export Report ${l.listing_id}`}>Export Report</Button> }] : []),
  ];
  return <>
    <section className="filter-panel" aria-label="Property filters">
      <div className="filter-heading"><span><FilterOutlined /> Refine your search <small>· {filters.currency || 'Currency to confirm'}</small></span><div><Button type="text" size="small" onClick={onReset}>Reset filters</Button><Button type="text" size="small" icon={<SlidersOutlined />} onClick={() => setExpanded(!expanded)}>{expanded ? 'Fewer filters' : 'More filters'}</Button></div></div>
      <div className="pv2-filters">
        <label className="field"><span>Area / Location</span><Select aria-label="Area / community" mode="multiple" placeholder="All areas" value={filters.areas} options={options(areas)} onChange={value => set('areas', value)} maxTagCount="responsive" /></label>
        <div className="field" role="group" aria-label={priceRangeLabel}><span>{priceRangeLabel}</span><div className={`pv2-range${budgetError ? ' pv2-range-error' : ''}`}><InputNumber aria-label="Min. price" placeholder="Min" controls={false} min={0} value={filters.budget_min} onChange={value => set('budget_min', value)} /><span aria-hidden="true">—</span><InputNumber aria-label="Max. price" placeholder="Max" controls={false} min={0} value={filters.budget_max} onChange={value => set('budget_max', value)} /></div></div>
        <div className="field" role="group" aria-label="Size Range (sq ft)"><span>Size Range (sq ft)</span><div className={`pv2-range${rangeError ? ' pv2-range-error' : ''}`}><InputNumber aria-label="Min. size" placeholder="Min" controls={false} min={0} value={size(filters.area_min)} disabled={sizeUnitPending} onChange={value => setSize('area_min', value)} /><span aria-hidden="true">—</span><InputNumber aria-label="Max. size" placeholder="Max" controls={false} min={0} value={size(filters.area_max)} disabled={sizeUnitPending} onChange={value => setSize('area_max', value)} /></div></div>
        <label className="field"><span>Property Type</span><Select aria-label="Property type" mode="multiple" placeholder="Any type" value={filters.property_types} options={options(['apartment', 'villa', 'townhouse', 'penthouse', 'land', 'other'])} onChange={value => set('property_types', value)} maxTagCount="responsive" /></label>
        <label className="field"><span>Bedrooms</span><Select aria-label="Bedrooms" value={filters.bedrooms_min} options={[{ value: null, label: 'Any bedrooms' }, ...[0, 1, 2, 3, 4, 5].map(value => ({ value, label: value === 0 ? 'Studio or larger' : `${value}+ bedrooms` }))]} onChange={value => set('bedrooms_min', value)} /></label>
        {expanded && <>
          <label className="field"><span>Completion Status</span><Select aria-label="Completion" value={filters.market_preference || 'either'} options={[{ value: 'either', label: 'Ready & off-plan' }, { value: 'ready', label: 'Ready' }, { value: 'off_plan', label: 'Off-plan' }, { value: 'unknown', label: 'Not confirmed' }]} onChange={value => set('market_preference', value)} /></label>
          <label className="field"><span>Listing Status</span><Select aria-label="Listing status" value={filters.listing_status} options={[{ value: 'active', label: 'Active' }, { value: '', label: 'All statuses' }, { value: 'withdrawn', label: 'Withdrawn' }, { value: 'sold', label: 'Sold' }]} onChange={value => set('listing_status', value)} /></label>
          <label className="field"><span>Required Features</span><Select aria-label="Required features" mode="multiple" placeholder="No feature filter" value={filters.amenities} options={options(['parking', 'pool', 'balcony', 'gym'])} onChange={value => set('amenities', value)} maxTagCount="responsive" /></label>
          <label className="field"><span>Available / Move-in By</span><input aria-label="Available by" className="date-input" type="date" value={filters.move_in_by ?? ''} onChange={event => set('move_in_by', event.target.value || null)} /></label>
        </>}
      </div>
      {sizeUnitPending && <Alert type="warning" message="The original size unit needs confirmation. Review the requirement or reset filters before entering a range." />}
      {filters.currency !== 'AED' && <Alert type="warning" message="This requirement's original budget currency is retained." description="The library contains AED listings. No currency conversion is applied; confirm the budget currency before comparing prices." />}
      {budgetError && <Alert type="error" message="Minimum price must not exceed maximum price." />}
      {rangeError && <Alert type="error" message={rangeError} />}
      {areaPending && <Alert data-testid="library-area-warning" type="warning" showIcon message="Area basis needs confirmation" description="Confirm the required area basis and unit. Missing information is not evidence that no suitable property exists." />}
      {!!textWarnings.length && <Alert data-testid="library-text-warning" type="warning" showIcon message="Original wording needs confirmation" description={<><p>These are structured candidates, not confirmed recommendations.</p><ul>{textWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul></>} />}
    </section>
    <div className="pv2-library-layout">
      <section className="results-panel"><div className="results-toolbar"><div><h2><span data-testid="result-count">{rows.length}</span> properties</h2><span>{active ? `Structured search for ${active.client_alias}` : 'In your current selection'}</span></div><span className="source-note">Sort using the column arrows</span></div>
        <Table className="property-table" rowKey="listing_id" columns={columns} dataSource={rows} pagination={{ current: page, onChange: setPage, pageSize: 6, showSizeChanger: false, hideOnSinglePage: true }} scroll={{ x: active ? 1410 : 1280 }} onRow={l => ({ 'data-testid': `listing-${l.listing_id}` } as HTMLAttributes<HTMLTableRowElement>)} locale={{ emptyText: <Empty description={<><strong>{areaPending ? 'Area comparison is awaiting confirmation.' : 'No properties meet these filters.'}</strong><p>{areaPending ? 'Missing information does not confirm a lack of suitable properties.' : 'Review your filters. Unknown fields cannot satisfy a selected condition.'}</p><Button onClick={onReset}>Reset filters</Button></>} /> }} />
        <div className="table-footer"><CheckCircleOutlined /> Latest snapshot per listing · Listing price and transaction price are kept separate.</div>
      </section>
    </div>
  </>;
}
