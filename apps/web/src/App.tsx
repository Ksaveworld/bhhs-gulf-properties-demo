import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, ConfigProvider, Input, Modal, Skeleton, Tag } from 'antd';
import { ApartmentOutlined, ArrowRightOutlined, DatabaseOutlined, FileTextOutlined, HomeOutlined, LoginOutlined, ReloadOutlined, TeamOutlined } from '@ant-design/icons';
import type { ClientRequirement, Dataset } from '../../../shared/types';
import { EMPTY_FILTERS, latestListings, requirementsToFilters, type Filters } from '../../../shared/matching';
import { loadSalesIdentity, makeSalesIdentity, saveSalesIdentity, SALES_IDENTITY_KEY, type SalesIdentity } from '../../../shared/sales-identity';
import type { LocalRequirementCopy } from '../../../shared/local-requirements';
import { RequirementEditor } from './components/RequirementEditor';
import { PropertyDetail } from './components/PropertyDetail';
import { PropertyLibrary } from './components/PropertyLibrary';
import { ClientDirectory } from './components/ClientDirectory';
import { Reports } from './components/Reports';
import { useLocalRequirements } from './useLocalRequirements';
import './iteration-03.css';

type Route = { page: 'home' | 'properties' | 'clients' | 'reports'; requirement: string | null; listing: string | null };
function readRoute(): Route {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  return { page: ['properties', 'clients', 'reports'].includes(path) ? path as Route['page'] : 'home', requirement: params.get('requirement'), listing: params.get('listing') };
}
const headings: Record<Route['page'], [string, string]> = {
  home: ['Your client. Their next home.', 'Bring the conversation into focus, then explore the evidence.'],
  properties: ['Property library', 'Explore listings, compare price evidence, and find the right client fit.'],
  clients: ['Clients & needs', 'Find a client first. Review each independent requirement before matching.'],
  reports: ['Reports', 'Review property evidence and recorded client viewings in one place.'],
};

export function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [route, setRoute] = useState<Route>(readRoute);
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS });
  const [editorOpen, setEditorOpen] = useState(false);
  const [homeDraftVersion, setHomeDraftVersion] = useState(0);
  const [reviewTarget, setReviewTarget] = useState<ClientRequirement | null>(null);
  const [dataOpen, setDataOpen] = useState(false);
  const [identity, setIdentity] = useState<SalesIdentity | null>(() => { try { return loadSalesIdentity(localStorage); } catch { return null; } });
  const [identityError, setIdentityError] = useState('');
  const [signInOpen, setSignInOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [salesIdInput, setSalesIdInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const local = useLocalRequirements(dataset, identity?.sales_id ?? null);
  const identityRef = useRef(identity); identityRef.current = identity;
  const controller = useRef<AbortController>();

  function navigate(next: Route) {
    const query = new URLSearchParams();
    if (next.requirement) query.set('requirement', next.requirement);
    if (next.listing) query.set('listing', next.listing);
    const hash = `#/${next.page}${query.size ? `?${query}` : ''}`;
    setRoute(next); if (location.hash !== hash) location.hash = hash;
  }
  function changeIdentity(next: SalesIdentity | null) {
    // Guest notes can survive first sign-in; an identified sales draft cannot move to another owner.
    if (identityRef.current && identityRef.current.sales_id !== next?.sales_id) setHomeDraftVersion(version => version + 1);
    setIdentity(next); setIdentityError(''); setEditorOpen(false); setReviewTarget(null);
    setFilters({ ...EMPTY_FILTERS }); navigate({ page: 'home', requirement: null, listing: null });
  }
  useEffect(() => {
    const hashChanged = () => setRoute(readRoute());
    const identityChanged = (event: StorageEvent) => {
      if (event.key !== null && event.key !== SALES_IDENTITY_KEY) return;
      try { changeIdentity(loadSalesIdentity(localStorage)); }
      catch (reason) { changeIdentity(null); setIdentityError(reason instanceof Error ? reason.message : 'Identity unavailable.'); }
    };
    try { loadSalesIdentity(localStorage); } catch (reason) { setIdentityError((reason as Error).message); }
    window.addEventListener('hashchange', hashChanged); window.addEventListener('storage', identityChanged);
    return () => { window.removeEventListener('hashchange', hashChanged); window.removeEventListener('storage', identityChanged); };
  }, []);
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
      if (controller.current !== current || current.signal.aborted) return;
      setReviewTarget(null); setEditorOpen(false); setDataset(next);
    } catch {
      if (controller.current === current) { setDataset(null); setError('The property data could not be loaded. Retry loading or check the data source.'); }
    } finally { clearTimeout(timeout); if (controller.current === current) setBusy(false); }
  }
  useEffect(() => { load(); return () => { controller.current?.abort(); controller.current = undefined; }; }, []);
  const sourceListings = useMemo(() => latestListings(dataset?.listing_snapshots ?? []), [dataset]);
  // AED is the requested library view. Unknown currency stays visible as missing evidence;
  // other currency records remain unchanged and available through source reports/details.
  const listings = useMemo(() => sourceListings.filter(row => row.currency === 'AED' || row.currency === null), [sourceListings]);
  const requirements = useMemo(() => [...(dataset?.client_requirements ?? []), ...local.copies.map(copy => copy.requirement)], [dataset, local.copies]);
  const active = requirements.find(req => req.requirement_id === route.requirement) ?? null;
  const selected = sourceListings.find(listing => listing.listing_id === route.listing) ?? null;
  const localById = new Map(local.copies.map(copy => [copy.requirement.requirement_id, copy]));
  const areas = useMemo(() => [...new Set(listings.map(listing => listing.area_name))].sort(), [listings]);
  useEffect(() => { setFilters(active ? requirementsToFilters(active) : { ...EMPTY_FILTERS }); }, [active?.requirement_id, local.key, dataset]);
  function viewClient(req: ClientRequirement) { setFilters(requirementsToFilters(req)); navigate({ page: 'properties', requirement: req.requirement_id, listing: null }); }
  function openEditor(req: ClientRequirement | null = null) { setReviewTarget(req); setEditorOpen(true); }
  function openSignIn() { setUsername(identity?.username ?? ''); setSalesIdInput(identity?.sales_id ?? ''); setLoginError(''); setSignInOpen(true); }
  function signIn() {
    try { changeIdentity(saveSalesIdentity(localStorage, makeSalesIdentity(username, salesIdInput))); setSignInOpen(false); }
    catch (reason) { setLoginError((reason as Error).message); }
  }
  function signOut() {
    try { changeIdentity(saveSalesIdentity(localStorage, null)); }
    catch (reason) { setIdentityError((reason as Error).message); }
  }
  async function apply(req: ClientRequirement, next: Filters, target = reviewTarget) {
    const owner = identity?.sales_id;
    if (!owner) throw new Error('Sign in with your demo Sales ID before saving a private requirement.');
    if (!dataset || local.loading || (target && !requirements.some(item => item.requirement_id === target.requirement_id))) throw new Error('The selected batch or requirement changed. Reopen it before saving.');
    const original = target ? dataset.client_requirements.find(item => item.requirement_id === target.requirement_id)?.requirement_id ?? localById.get(target.requirement_id)?.original_requirement_id ?? null : null;
    const owned = { ...req, sales_owner: owner };
    await local.save({ requirement: owned, original_requirement_id: original, parent_requirement_id: target?.requirement_id ?? null, saved_at: new Date().toISOString() });
    if (identityRef.current?.sales_id !== owner) throw new Error('The sales identity changed. Reopen your saved copy under its owner.');
    setFilters(next); navigate({ page: 'properties', requirement: owned.requirement_id, listing: null });
  }
  function reset() { setFilters({ ...EMPTY_FILTERS }); navigate({ page: 'properties', requirement: null, listing: null }); }
  async function deleteCopy(copy: LocalRequirementCopy, restore = false) {
    try {
      await local.remove(copy.requirement.requirement_id);
      const original = dataset?.client_requirements.find(req => req.requirement_id === copy.original_requirement_id);
      if (restore && original) viewClient(original);
      else if (active?.requirement_id === copy.requirement.requirement_id) reset();
    } catch { /* Storage errors remain visible. Do not remove a copy before confirmed persistence. */ }
  }
  const visibility = (id: string) => localById.has(id) ? identity ? 'private' as const : 'legacy' as const : 'company' as const;
  function localControls(req: ClientRequirement) {
    const copy = localById.get(req.requirement_id);
    if (!copy) return null;
    return <div className="local-copy-controls"><Tag data-testid="local-copy-status" color="blue">Saved in this browser · 已保存到当前浏览器</Tag>
      <span className="source-note">{identity ? `Private · Owner Sales ID: ${identity.sales_id}` : 'Unassigned browser review · Created before demo identities'}<br />{copy.original_requirement_id ? `Original requirement: ${copy.original_requirement_id}` : 'New local requirement'}<br />Saved: {new Date(copy.saved_at).toLocaleString('en-GB')}</span>
      <span className="source-note">Local copy · Business confirmation still required</span><div><Button size="small" danger disabled={local.writing} onClick={() => deleteCopy(copy)}>Delete local copy</Button>{copy.original_requirement_id && <Button size="small" disabled={local.writing} onClick={() => deleteCopy(copy, true)}>Restore original</Button>}</div></div>;
  }
  return <ConfigProvider theme={{ token: { colorPrimary: '#55223f', colorInfo: '#55223f', colorText: '#28252d', colorBgLayout: '#f5f6f8', fontFamily: "'Segoe UI', Arial, sans-serif", borderRadius: 6, controlHeight: 37 }, components: { Table: { headerBg: '#f7f8fa', cellPaddingBlock: 18 }, Button: { primaryShadow: 'none' } } }}>
    <div className="workspace"><aside className="sidebar"><div className="brand"><span className="brand-circle">BHHS</span><span className="brand-small">BERKSHIRE HATHAWAY<br />HOMESERVICES</span><strong>Gulf Properties</strong></div><div className="workspace-label">SALES WORKSPACE</div>
      <nav aria-label="Main navigation">{([['home', <HomeOutlined />, 'Home'], ['properties', <ApartmentOutlined />, 'Property library'], ['clients', <TeamOutlined />, 'Clients & needs'], ['reports', <FileTextOutlined />, 'Reports']] as const).map(([page, icon, label]) => <button key={page} className={`nav-item ${route.page === page ? 'active' : ''}`} onClick={() => navigate({ page, requirement: page === 'properties' ? route.requirement : null, listing: null })}>{icon}{label}</button>)}</nav>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => setDataOpen(true)}><DatabaseOutlined /> Data & sources</button><p>Sales assistance demo<br />Recorded evidence · Human review</p><div className="sales-profile"><span className="sales-avatar">{identity?.username.slice(0, 1) ?? 'S'}</span><div><strong>{identity?.username ?? 'Sales workspace'}</strong><span>{identity?.sales_id ?? 'Guest · Company samples'}</span></div></div></div></aside>
      <div className="workspace-main"><header className="topbar"><span>Gulf Properties <span className="breadcrumb-slash">/</span> {route.page === 'home' ? 'Home' : headings[route.page][0]}</span><div className="topbar-right"><Tag color="gold">{dataset?.meta.mode === 'product' ? 'Product dataset' : 'Demo dataset'}</Tag>{identity ? <><span data-testid="current-sales-identity">{identity.username} · {identity.sales_id}</span><Button onClick={openSignIn}>Switch sales identity</Button><Button onClick={signOut}>Sign out</Button></> : <Button icon={<LoginOutlined />} onClick={openSignIn}>Sign in</Button>}</div></header>
        <main className="main-content"><div className="page-heading"><div><p className="eyebrow">BHHS GULF PROPERTIES · SALES WORKSPACE</p><h1>{headings[route.page][0]}</h1><p className="heading-description">{headings[route.page][1]}</p></div></div>
          <div className="evidence-banner"><span className="banner-dot" /><span>{dataset?.meta.mode === 'product' ? 'Product source · Imported records passed intake review. Local edits still require business confirmation.' : 'Demonstration only · Properties, prices, transactions and clients are fictional samples.'}</span><button onClick={() => setDataOpen(true)}>View data notes <ArrowRightOutlined /></button></div>
          {identityError && <Alert type="error" message="Demo identity needs attention" description={identityError} action={<Button onClick={openSignIn}>Sign in again</Button>} />}
          {error && <Alert className="load-error" type="error" showIcon message="Data unavailable" description={error} action={<Button onClick={load}>Retry loading</Button>} />}
          {busy ? <div className="loading-panel" role="status" aria-label="Loading property data"><Skeleton active paragraph={{ rows: 8 }} /><span>Loading property data…</span></div> : dataset && <>
            {dataset.meta.quarantined_count > 0 && <Alert type="warning" showIcon message={`${dataset.meta.quarantined_count} records are awaiting data review and are excluded.`} />}
            {local.error && <Alert data-testid="local-storage-error" className="local-storage-alert" type="error" showIcon message="Browser saving needs attention" description={local.error} action={<Button onClick={local.retry} disabled={local.writing}>Retry local storage</Button>} />}
            <div className="local-storage-notice" data-testid="local-storage-notice" role="status">{local.loading ? 'Loading browser copies…' : <><strong>{local.copies.length} saved browser copies</strong><span>{identity ? `Private to ${identity.sales_id} in this demo view.` : 'Older unassigned reviews stay available when signed out.'} Saved for this browser, site address and data version. Saving does not confirm business conditions.</span></>}</div>
            {route.requirement && !active && !local.loading && <Alert type="warning" message="This requirement is not available for the current sales identity or data version." action={<Button onClick={reset}>Clear client search</Button>} />}
            {route.listing && !selected && <Alert type="warning" message="This property link is not available in the current data version." action={<Button onClick={() => navigate({ ...route, listing: null })}>Close property link</Button>} />}
            {route.page === 'home' && <><RequirementEditor key={homeDraftVersion} inline open areas={areas} canSave={!!identity && !local.loading} onSignIn={openSignIn} onClose={() => {}} onApply={(req, next) => apply(req, next, null)} /><div className="home-library-link"><span>Prefer to start with the inventory?</span><Button onClick={() => navigate({ page: 'properties', requirement: null, listing: null })}>Browse property library <ArrowRightOutlined /></Button></div></>}
            {route.page === 'properties' && <>{sourceListings.length > listings.length && <p className="source-note" data-testid="aed-view-note">AED library view · {sourceListings.length - listings.length} other-currency listing(s) retained in source reports, outside this view. No exchange-rate conversion is applied.</p>}<PropertyLibrary listings={listings} requirements={requirements} filters={filters} onFilter={setFilters} active={active} onViewClient={viewClient} onReview={openEditor} onOpen={id => navigate({ ...route, listing: id })} onReset={reset} localControls={localControls} /></>}
            {route.page === 'clients' && <ClientDirectory requirements={requirements} listings={listings} getVisibility={visibility} onView={viewClient} onAddPrivate={() => identity ? openEditor() : openSignIn()} canAddPrivate={!!identity} renderLocalControls={localControls} />}
            {route.page === 'reports' && <Reports key={`${local.key}:${identity?.sales_id ?? 'guest'}`} dataset={dataset} listings={sourceListings} requirements={requirements} salesId={identity?.sales_id ?? null} storageScope={local.key} onOpenProperty={id => navigate({ ...route, listing: id })} />}
          </>}
          <footer className="page-footer"><span>BHHS Gulf Properties · Sales assistance demo</span><Button aria-label="Refresh data" type="text" size="small" icon={<ReloadOutlined />} loading={busy} onClick={load}>Refresh data</Button></footer>
        </main></div>
      <RequirementEditor open={editorOpen} initialRequirement={reviewTarget} areas={areas} canSave={!!identity && !local.loading} onSignIn={openSignIn} onClose={() => setEditorOpen(false)} onApply={apply} />
      {dataset && <PropertyDetail key={identity?.sales_id ?? 'guest'} listing={selected} dataset={dataset} requirements={requirements} onClose={() => navigate({ ...route, listing: null })} onViewClient={viewClient} />}
      <Modal title="Demo sign in" open={signInOpen} onCancel={() => setSignInOpen(false)} onOk={signIn} okText="Continue as sales" destroyOnClose><p className="muted">Choose your demonstration sales identity. This separates private browser copies by Sales ID; it is not a real authentication system.</p>{loginError && <Alert data-testid="identity-save-error" type="error" showIcon message={loginError} />}<label className="field login-field"><span>Username</span><Input aria-label="Username" value={username} onChange={e => setUsername(e.target.value)} maxLength={80} /></label><label className="field login-field"><span>Sales ID</span><Input aria-label="Sales ID" value={salesIdInput} onChange={e => setSalesIdInput(e.target.value)} onPressEnter={signIn} maxLength={64} /><small>Letters, numbers, hyphens and underscores · case-sensitive</small></label></Modal>
      <Modal title="Data & sources" open={dataOpen} onCancel={() => setDataOpen(false)} footer={<Button onClick={() => setDataOpen(false)}>Close</Button>} width={670}><Alert showIcon type="info" message={dataset?.meta.label ?? 'Dataset not loaded'} description="The rule assistant organizes stated needs. Matching compares recorded conditions; it does not predict a sale or infer a client's assets." /><dl className="data-notes"><dt>Data mode</dt><dd>{dataset?.meta.mode ?? 'Unavailable'}</dd><dt>Dataset prepared</dt><dd>{dataset?.meta.loaded_at ?? 'Unavailable'}</dd><dt>Source records</dt><dd>{dataset?.listing_snapshots.length ?? 0} listing snapshots · {dataset?.transactions.length ?? 0} transactions · {dataset?.client_requirements.length ?? 0} imported requirements</dd><dt>Browser copies</dt><dd>Independent copies persist by data source, version and Sales ID in this browser. Clearing site data removes them; they are not synced or backed up on a server. Prior unassigned copies remain available while signed out.</dd><dt>Demo identity</dt><dd>Company samples are shared; new private copies are filtered by their creator Sales ID throughout this demo. This is not authentication: someone with this browser can choose any Sales ID or inspect local storage. Real imported client access requires a separate authorized access model.</dd><dt>Restore original</dt><dd>Deletes only the selected copy and returns to its imported requirement. Other copies and original input files remain.</dd><dt>Rules & dates</dt><dd>Completion and listing status, contract and registration dates retain their separate meanings. User confirmation is still required for business definitions, unknown conditions and draft references.</dd></dl>{!!dataset?.meta.warnings.length && <Alert type="warning" message="Data review notes" description={<ul>{dataset.meta.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>} />}</Modal>
    </div>
  </ConfigProvider>;
}
