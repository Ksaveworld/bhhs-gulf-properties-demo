import { InputNumber, Select } from 'antd';
import { convertArea, getAreaRangeError, type Filters } from '../../../../shared/matching';

type Props = { value: Filters; onChange: (value: Filters) => void; areas: string[]; compact?: boolean; requirementsMode?: boolean; libraryMode?: boolean };
const options = (values: string[]) => values.map(value => ({ value, label: value.replaceAll('_', ' ') }));
export function FilterEditor({ value, onChange, areas, compact = false, requirementsMode = false, libraryMode }: Props) {
  const library = !requirementsMode && (libraryMode ?? true);
  const set = <K extends keyof Filters>(key: K, next: Filters[K]) => onChange({ ...value, [key]: next });
  const sizeInSqft = (size: number | null | undefined) => size == null || !value.area_unit ? null : convertArea(size, value.area_unit, 'sqft');
  const sizeUnitPending = !value.area_unit && (value.area_min != null || value.area_max != null);
  const sizeError = getAreaRangeError(value);
  const setLibrarySize = (key: 'area_min' | 'area_max', next: number | null) => onChange({
    ...value, area_min: sizeInSqft(value.area_min), area_max: sizeInSqft(value.area_max), area_unit: 'sqft', [key]: next,
  });
  return <div className={`filter-grid ${compact ? 'compact' : ''}`}>
    <label className="field field-areas"><span>Area / community</span><Select aria-label="Area / community" mode="multiple" placeholder="All areas" value={value.areas} options={options(areas)} onChange={v => set('areas', v)} maxTagCount="responsive" /></label>
    {library ? <div className="field field-size-range" role="group" aria-label="Size range (sq ft)">
      <span>Size range (sq ft)</span>
      <div className="size-range-inputs">
        <label className="size-range-bound"><span>Min. size</span><InputNumber aria-label="Min. size" min={0} value={sizeInSqft(value.area_min)} placeholder="No minimum" controls={false} disabled={sizeUnitPending} status={sizeError ? 'error' : undefined} onChange={v => setLibrarySize('area_min', v)} /></label>
        <label className="size-range-bound"><span>Max. size</span><InputNumber aria-label="Max. size" min={0} value={sizeInSqft(value.area_max)} placeholder="No maximum" controls={false} disabled={sizeUnitPending} status={sizeError ? 'error' : undefined} onChange={v => setLibrarySize('area_max', v)} /></label>
      </div>
      {sizeError && <small role="alert">{sizeError}</small>}
      {sizeUnitPending && <small role="status">The existing size unit needs confirmation. Review the request or reset filters before entering a range.</small>}
    </div> : <label className="field"><span>Currency</span><Select aria-label="Currency" value={value.currency} options={[{ value: '', label: 'Currency not confirmed' }, ...options(['AED', 'USD', 'EUR', 'GBP']), { value: 'other', label: 'Other — needs confirmation' }]} onChange={v => set('currency', v)} />{requirementsMode && <small>Keep the request&apos;s original currency. No exchange-rate conversion is applied.</small>}</label>}
    <label className="field"><span>Min. price</span><InputNumber aria-label="Min. price" min={0} value={value.budget_min} placeholder="No minimum" controls={false} onChange={v => set('budget_min', v)} /></label>
    <label className="field"><span>Max. price</span><InputNumber aria-label="Max. price" min={0} value={value.budget_max} placeholder="No maximum" controls={false} onChange={v => set('budget_max', v)} /></label>
    <label className="field"><span>Bedrooms</span><Select aria-label="Bedrooms" value={value.bedrooms_min} options={[{ value: null, label: 'Any bedrooms' }, ...[0, 1, 2, 3, 4, 5].map(v => ({ value: v, label: v === 0 ? 'Studio or larger' : `${v}+ bedrooms` }))]} onChange={v => set('bedrooms_min', v)} /></label>
    <label className="field"><span>Property type</span><Select aria-label="Property type" mode="multiple" placeholder="Any type" value={value.property_types} options={options(['apartment', 'villa', 'townhouse', 'penthouse', 'land', 'other'])} onChange={v => set('property_types', v)} maxTagCount="responsive" /></label>
    <label className="field"><span>Completion</span><Select aria-label="Completion" value={value.market_preference || 'either'} options={[{ value: 'either', label: 'Ready & off-plan' }, { value: 'ready', label: 'Ready' }, { value: 'off_plan', label: 'Off-plan' }, { value: 'unknown', label: 'No preference recorded' }]} onChange={v => set('market_preference', v)} /></label>
    {!requirementsMode && <label className="field"><span>Listing status</span><Select aria-label="Listing status" value={value.listing_status} options={[{ value: 'active', label: 'Active listings' }, { value: '', label: 'All statuses' }, { value: 'withdrawn', label: 'Withdrawn' }, { value: 'sold', label: 'Sold — source stated' }]} onChange={v => set('listing_status', v)} /></label>}
    {!library && <>
      <label className="field"><span>Min. area</span><InputNumber aria-label="Min. area" min={0} value={value.area_min} placeholder="No minimum" controls={false} onChange={v => set('area_min', v)} /></label>
      <label className="field"><span>Area unit</span><Select aria-label="Area unit" value={value.area_unit} options={[{ value: null, label: 'Unit not confirmed' }, ...options(['sqft', 'sqm'])]} onChange={v => set('area_unit', v)} /></label>
    </>}
    <label className="field"><span>Area basis</span><Select aria-label="Area basis" value={value.area_basis || 'unknown'} options={[...options(['built_up', 'internal', 'gross', 'land']), { value: 'unknown', label: 'Needs confirmation · 面积口径待确认' }]} onChange={v => set('area_basis', v)} /></label>
    <label className="field"><span>Required features</span><Select aria-label="Required features" mode="multiple" placeholder="No feature filter" value={value.amenities} options={options(['parking', 'pool', 'balcony', 'gym'])} onChange={v => set('amenities', v)} maxTagCount="responsive" /></label>
    {!compact && <label className="field"><span>Available by</span><input aria-label="Available by" className="date-input" type="date" value={value.move_in_by ?? ''} onChange={e => set('move_in_by', e.target.value || null)} /></label>}
  </div>;
}
