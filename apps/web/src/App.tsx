import { useEffect, useMemo, useRef, useState, type HTMLAttributes } from 'react';
import { Alert, Button, ConfigProvider, Empty, Modal, Select, Skeleton, Table, Tag, Tooltip } from 'antd';
import { ApartmentOutlined, ArrowRightOutlined, CheckCircleOutlined, DatabaseOutlined, FilterOutlined, HomeOutlined, ReloadOutlined, SearchOutlined, SlidersOutlined, TeamOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ClientRequirement, Dataset, ListingSnapshot } from '../../../shared/types';
import { EMPTY_FILTERS, evaluateMatch, filterListings, latestListings, requirementTextReview, requirementsToFilters, type Filters } from '../../../shared/matching';
import { requirementAreaWarnings } from '../../../shared/requirement-area';
import { FilterEditor } from './components/FilterEditor';
import { RequirementEditor } from './components/RequirementEditor';
import { PropertyDetail } from './components/PropertyDetail';
import { date, display, money } from './format';

export function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS });
  const [view, setView] = useState<'properties' | 'clients'>('properties');
  const [editorOpen, setEditorOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<ClientRequirement | null>(null);
  const [dataOpen, setDataOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [active, setActive] = useState<ClientRequirement | null>(null);
  const [sessionRequirements, setSessionRequirements] = useState<ClientRequirement[]>([]);
  const controller = useRef<AbortController>();
  async function load() {
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setBusy(true); setError('');
    const timeout = setTimeout(() => current.abort(), 10000);
    try {
      const response = await fetch('/api/dataset', { signal: current.signal });
      if (!response.ok) throw new Error('dataset unavailable');
      const next = await response.json() as Dataset;
      if (!Array.isArray(next.listing_snapshots) || !Array.isArray(next.client_requirements) || !next.meta) throw new Error('invalid dataset');
      setDataset(next);
    } catch {
      if (controller.current === current) {
        setDataset(null);
        setError('The property data could not be loaded. Retry loading or check the data source.');
      }
    } finally { clearTimeout(timeout); if (controller.current === current) setBusy(false); }
  }
  useEffect(() => { load(); return () => { controller.current?.abort(); controller.current = undefined; }; }, []);
  const listings = useMemo(() => latestListings(dataset?.listing_snapshots ?? []), [dataset]);
  const requirements = useMemo(() => [...(dataset?.client_requirements ?? []), ...sessionRequirements], [dataset, sessionRequirements]);
  const areas = useMemo(() => [...new Set(listings.map(l => l.area_name))].sort(), [listings]);
  const rows = useMemo(() => filterListings(listings, filters), [listings, filters]);
  const selected = listings.find(l => l.listing_id === selectedId) ?? null;
  const invalid = filters.budget_min !== null && filters.budget_max !== null && filters.budget_min > filters.budget_max;
  const resultRows = invalid ? [] : rows;
  const areaPending = filters.area_min !== null && (!filters.area_basis || filters.area_basis === 'unknown' || !filters.area_unit);
  const activeTextWarnings = active ? requirementTextReview(active).warnings : [];
  function openEditor(req: ClientRequirement | null = null) { setReviewTarget(req); setEditorOpen(true); }
  function viewClient(req: ClientRequirement) {
    setActive(req); setFilters(requirementsToFilters(req)); setView('properties'); setSelectedId(null);
  }
  function apply(req: ClientRequirement, next: Filters) {
    setSessionRequirements(current => [...current, req]);
    setActive(req); setFilters(next); setView('properties');
  }
  function reset() { setFilters({ ...EMPTY_FILTERS }); setActive(null); }
  const columns: ColumnsType<ListingSnapshot> = [
    { title: 'Property', key: 'property', width: 285, render: (_, l) => <button className="property-link" onClick={() => setSelectedId(l.listing_id)} aria-label={`Open ${l.title}`}><span className={`property-symbol ${l.market_segment === 'off_plan' ? 'off-plan' : ''}`}><ApartmentOutlined /></span><span><strong>{l.title}</strong><span className="property-subline">{l.area_name}</span><span className="record-id">{l.listing_id} · {l.data_kind === 'demo' ? 'DEMO' : 'Product data'}</span></span></button> },
    { title: 'Asking price', key: 'price', width: 165, render: (_, l) => <div><strong className="price">{money(l.asking_price, l.currency)}</strong><span className="table-caption">{l.listing_status === 'active' ? 'Current listing' : 'Recorded asking price'}</span></div> },
    { title: 'Specification', key: 'spec', width: 170, render: (_, l) => <div><span>{l.bedrooms === null ? 'Beds undisclosed' : l.bedrooms === 0 ? 'Studio' : `${l.bedrooms} bedrooms`} · {display(l.property_type)}</span><span className="table-caption">{l.area_value === null ? 'Area not disclosed' : `${l.area_value.toLocaleString('en-US')} ${l.area_unit} · ${display(l.area_basis)}`}</span></div> },
    { title: 'Status', key: 'status', width: 110, render: (_, l) => <div><Tag className={l.market_segment === 'ready' ? 'ready-tag' : ''}>{display(l.market_segment)}</Tag><span className="table-caption">{display(l.listing_status)}</span></div> },
    { title: 'Updated', key: 'updated', width: 115, render: (_, l) => <span className="updated-date">{date(l.captured_at)}</span> },
    ...(active ? [{ title: 'Client fit', key: 'fit', width: 130, render: (_: unknown, l: ListingSnapshot) => { const m = evaluateMatch(l, active); return <Tooltip title={[...m.conflicts, ...m.unknowns].join(' ')}><Tag color={m.status === 'match' ? 'green' : m.status === 'excluded' ? 'red' : 'gold'}>{m.status === 'match' ? 'Conditions met' : m.status === 'excluded' ? 'Conflict' : 'Review details'}</Tag></Tooltip>; } }] : []),
    { title: '', key: 'open', width: 40, render: (_, l) => <Button type="text" aria-label={`Details ${l.listing_id}`} icon={<ArrowRightOutlined />} onClick={() => setSelectedId(l.listing_id)} /> },
  ];
  return <ConfigProvider theme={{ token: { colorPrimary: '#55223f', colorInfo: '#55223f', colorText: '#28252d', colorBgLayout: '#f5f6f8', fontFamily: "'Segoe UI', Arial, sans-serif", borderRadius: 6, controlHeight: 37 }, components: { Table: { headerBg: '#f7f8fa', cellPaddingBlock: 18 }, Button: { primaryShadow: 'none' } } }}>
    <div className="workspace">
      <aside className="sidebar">
        <div className="brand"><span className="brand-circle">BHHS</span><span className="brand-small">BERKSHIRE HATHAWAY<br />HOMESERVICES</span><strong>Gulf Properties</strong></div>
        <div className="workspace-label">SALES WORKSPACE</div>
        <nav aria-label="Main navigation"><button className={view === 'properties' ? 'nav-item active' : 'nav-item'} onClick={() => setView('properties')}><HomeOutlined /> Property library <span>{listings.length || '—'}</span></button><button className={view === 'clients' ? 'nav-item active' : 'nav-item'} onClick={() => setView('clients')}><TeamOutlined /> Clients & needs <span>{requirements.length || '—'}</span></button></nav>
        <div className="sidebar-bottom"><button className="nav-item" onClick={() => setDataOpen(true)}><DatabaseOutlined /> Data & sources</button><div className="sales-profile"><span>GP</span><div><strong>Sales workspace</strong><small>Sales demonstration</small></div></div></div>
      </aside>
      <div className="workspace-main">
        <header className="topbar"><span>Gulf Properties <span className="breadcrumb-slash">/</span> {view === 'properties' ? 'Property library' : 'Clients & needs'}</span><div className="topbar-right"><span className="local-status"><i /> Sales workspace</span><Tag color="gold">{dataset?.meta.mode === 'product' ? 'Product dataset' : 'Demo dataset'}</Tag></div></header>
        <main className="main-content">
          <div className="page-heading"><div><p className="eyebrow">{view === 'properties' ? 'FROM CLIENT NEEDS TO THE RIGHT PROPERTY' : 'A CLEARER PICTURE OF EVERY CLIENT'}</p><h1>{view === 'properties' ? 'Property library' : 'Clients & needs'}</h1><p className="heading-description">{view === 'properties' ? 'Explore listings, compare price evidence, and find the right client fit.' : 'Review stated requirements and explore suitable properties together.'}</p></div><Button aria-label="Client requirements" type="primary" size="large" icon={<SearchOutlined />} onClick={() => openEditor()}>Client requirements</Button></div>
          <div className="evidence-banner"><span className="banner-dot" /><span>{dataset?.meta.mode === 'product' ? 'Product data · Only approved, reviewed records are shown. Source limitations remain visible.' : 'Demonstration only · Properties, prices, transactions and clients are fictional samples.'}</span><button onClick={() => setDataOpen(true)}>View data notes <ArrowRightOutlined /></button></div>
          {error && <Alert className="load-error" type="error" showIcon message="Data unavailable" description={error} action={<Button onClick={load}>Retry loading</Button>} />}
          {busy ? <div className="loading-panel" role="status" aria-label="Loading property data"><Skeleton active paragraph={{ rows: 8 }} /><span>Loading property data…</span></div> : dataset && <>
            {dataset.meta.quarantined_count > 0 && <Alert type="warning" showIcon message={`${dataset.meta.quarantined_count} records are awaiting data review and are excluded.`} action={<Button size="small" onClick={() => setDataOpen(true)}>Review notes</Button>} />}
            {view === 'properties' ? <>
              <section className="filter-panel" aria-label="Property filters"><div className="filter-heading"><span><FilterOutlined /> Refine your search</span><div><Button type="text" size="small" onClick={reset}>Reset filters</Button><Button type="text" size="small" icon={<SlidersOutlined />} onClick={() => setExpanded(v => !v)}>{expanded ? 'Fewer filters' : 'More filters'}</Button></div></div><div className={expanded ? 'filter-display expanded' : 'filter-display'}><FilterEditor value={filters} onChange={setFilters} areas={areas} compact={!expanded} /></div>
                {invalid && <Alert type="error" message="Minimum price must not exceed maximum price." />}
                {areaPending && <Alert data-testid="library-area-warning" type="warning" message="Area basis needs confirmation (面积口径待确认)" description="Area comparison is pending. A zero count here does not establish that no suitable properties exist. Confirm the client’s area basis and unit before comparing." />}
                <div className="filter-footnote">Prices keep their original currency. Area comparisons use the selected measurement basis.{filters.move_in_by && ` Available by: ${filters.move_in_by}.`}</div>
              </section>
              {activeTextWarnings.length > 0 && <Alert data-testid="library-text-warning" type="warning" showIcon message="Client conditions need clarification" description={<><p>These are structured search candidates, not confirmed recommendations. Original conditions are retained for sales review.</p><ul className="compact-list">{activeTextWarnings.map((message, index) => <li key={index}>{message}</li>)}</ul></>} action={<Button onClick={() => openEditor(active)}>Review conditions</Button>} />}
              <div className="library-layout"><section className="results-panel"><div className="results-toolbar"><div><h2><span data-testid="result-count">{resultRows.length}</span> properties</h2><span>{active ? `Structured search for ${active.client_alias}` : 'In your current selection'}</span></div><Select aria-label="Sort properties" value={filters.sort} onChange={v => setFilters({ ...filters, sort: v })} options={[{ value: 'updated_desc', label: 'Recently updated' }, { value: 'price_asc', label: 'Price: low to high' }, { value: 'price_desc', label: 'Price: high to low' }]} /></div><Table className="property-table" rowKey="listing_id" columns={columns} dataSource={resultRows} pagination={{ pageSize: 6, showSizeChanger: false, hideOnSinglePage: true }} scroll={{ x: active ? 1115 : 985 }} onRow={l => ({ 'data-testid': `listing-${l.listing_id}` } as HTMLAttributes<HTMLTableRowElement>)} locale={{ emptyText: <Empty description={<><strong>{areaPending ? 'Area comparison is awaiting confirmation.' : 'No properties meet these filters.'}</strong><p>{areaPending ? 'Confirm the required area basis and unit. Missing information is not evidence that no suitable property exists.' : 'Try another area or a wider budget. Unknown fields cannot satisfy a selected condition.'}</p><Button onClick={reset}>Reset filters</Button></>} /> }} /><div className="table-footer"><CheckCircleOutlined /> Latest snapshot per listing · Listing price and transaction price are kept separate.</div></section>
                <aside className="client-brief"><div className="brief-header"><span>CLIENT BRIEF</span><TeamOutlined /></div><h2>{active?.client_alias ?? 'Start with your client.'}</h2><p>{active ? 'Requirements recorded by sales. Review remaining questions before recommending.' : 'Bring the conversation into the search. Review requirements and compare the evidence.'}</p>
                  <label className="field"><span>Select a client requirement</span><Select aria-label="Select a client requirement" placeholder="Choose a sample client" value={active?.requirement_id} options={requirements.map(r => ({ value: r.requirement_id, label: `${r.client_alias} · ${r.requirement_id}` }))} onChange={id => { const r = requirements.find(r => r.requirement_id === id); if (r) viewClient(r); }} /></label>
                  {active ? <><Button block onClick={() => openEditor(active)}>Review selected requirement</Button>{requirementAreaWarnings(active).length > 0 && <Alert type="warning" message="Area basis needs confirmation (面积口径待确认)" description={requirementAreaWarnings(active).join(' ')} />}<dl className="brief-facts"><dt>Stated budget</dt><dd>{money(active.budget_max, active.currency)}<small>{active.budget_constraint} constraint</small></dd><dt>Purchase purpose</dt><dd>{display(active.purchase_purpose)}</dd><dt>Purchase by</dt><dd>{date(active.purchase_by)}</dd><dt>Preferences</dt><dd>{active.soft_preferences || 'Not recorded'}</dd></dl><div className="brief-next"><strong>To clarify</strong><p>{active.missing_questions || 'Confirm availability, total fees and any unverified requirements.'}</p></div><p className="source-note">{active.requirement_id}<br />{active.source_ref}</p><Button block onClick={reset}>Clear client search</Button></> : <><div className="brief-line"><span>1</span> Paste sales notes</div><div className="brief-line"><span>2</span> Review the requirements</div><div className="brief-line"><span>3</span> Explore candidate properties</div><Button block onClick={() => openEditor()}>Open requirements <ArrowRightOutlined /></Button><span className="rules-note">Rule demo · No model connected</span></>}
                </aside></div>
            </> : <section className="clients-panel"><div className="results-toolbar"><div><h2>{requirements.length} client requirements</h2><span>De-identified samples · Customer statements remain distinct from inference</span></div></div>{requirements.length === 0 ? <Empty description="No client requirements have been supplied." /> : requirements.map(req => { const matches = filterListings(listings, requirementsToFilters(req)); return <article key={req.requirement_id} className="client-row"><div className="client-avatar">{req.client_alias.split(' ').map(w => w[0]).slice(0, 2).join('')}</div><div className="client-summary"><h3>{req.client_alias} <Tag>{req.data_kind === 'demo' ? 'Demo' : 'Product'}</Tag></h3><p>{req.raw_request}</p><span className="source-note">{req.client_id} · {req.requirement_id} · {req.source_ref}</span><p className="intent-note">Stated intent: {req.intent_evidence || 'Not recorded'} · Purchase by: {date(req.purchase_by)}</p></div><div className="client-result"><strong>{matches.length}</strong><span>structured candidates</span>{requirementAreaWarnings(req).length > 0 && <Tag color="gold">Area basis needs confirmation · 面积口径待确认</Tag>}<Button onClick={() => viewClient(req)}>View properties <ArrowRightOutlined /></Button></div></article>; })}</section>}
          </>}
          <footer className="page-footer"><span>BHHS Gulf Properties · Sales assistance demo</span><Button aria-label="Refresh data" type="text" size="small" icon={<ReloadOutlined />} loading={busy} onClick={load}>Refresh data</Button></footer>
        </main>
      </div>
      <RequirementEditor open={editorOpen} initialRequirement={reviewTarget} areas={areas} onClose={() => setEditorOpen(false)} onApply={apply} />
      {dataset && <PropertyDetail listing={selected} dataset={dataset} requirements={requirements} onClose={() => setSelectedId(null)} onViewClient={viewClient} />}
      <Modal title="Data & sources" open={dataOpen} onCancel={() => setDataOpen(false)} footer={<Button onClick={() => setDataOpen(false)}>Close</Button>} width={670}>
        <Alert showIcon type="info" message={dataset?.meta.label ?? 'Dataset not loaded'} description="The rule assistant organizes stated needs. Matching compares recorded conditions; it does not predict a sale or infer a client's assets." />
        <dl className="data-notes"><dt>Data mode</dt><dd>{dataset?.meta.mode ?? 'Unavailable'}</dd><dt>Dataset prepared</dt><dd>{dataset?.meta.loaded_at ?? 'Unavailable'}</dd><dt>Source records</dt><dd>{dataset?.listing_snapshots.length ?? 0} listing snapshots · {dataset?.transactions.length ?? 0} transactions · {dataset?.client_requirements.length ?? 0} requirements</dd><dt>Data refresh</dt><dd>Refresh reloads the configured dataset. Published demos use the snapshot prepared for that release.</dd><dt>Session edits</dt><dd>Requirements entered here are temporary and clear on page reload.</dd><dt>Product replacement</dt><dd>Product A supplies listings, transactions and their evidence links. Product B supplies de-identified requirements and reviewed match references.</dd></dl>
        {!!dataset?.meta.warnings.length && <Alert type="warning" message="Data review notes" description={<ul>{dataset.meta.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>} />}
      </Modal>
    </div>
  </ConfigProvider>;
}
