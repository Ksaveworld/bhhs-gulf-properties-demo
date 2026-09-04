import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, ConfigProvider, Input, Modal, Skeleton, Tag } from 'antd';
import { ApartmentOutlined, ArrowRightOutlined, DatabaseOutlined, HomeOutlined, LoginOutlined, ReloadOutlined, TeamOutlined } from '@ant-design/icons';
import type { ClientRequirement, Dataset } from '../../../shared/types';
import { EMPTY_FILTERS, latestListings, type Filters } from '../../../shared/matching';
import { EMPTY_CLIENT_DIRECTORY_FILTERS, type ClientDirectoryFilters } from '../../../shared/client-directory';
import { currentClientRequirements, companyAssignment } from '../../../shared/client-requirement-history';
import { loadSalesIdentity, makeSalesIdentity, saveSalesIdentity, SALES_IDENTITY_KEY, type SalesIdentity } from '../../../shared/sales-identity';
import type { LocalRequirementCopy } from '../../../shared/local-requirements';
import { loadViewingRecords, type ViewingRecord } from '../../../shared/viewing-records';
import { clientSalesReport, propertySalesReport, type SalesReport } from '../../../shared/sales-report';
import { homeReviewQuestions, type HomeTask } from '../../../shared/home-tasks';
import { HomeWorkspace } from './components/HomeWorkspace';
import { ClientRequirementEditor } from './components/ClientRequirementEditor';
import { PropertyDetail } from './components/PropertyDetail';
import { PropertyLibrary } from './components/PropertyLibrary';
import { ClientDirectory } from './components/ClientDirectory';
import { ClientDetail } from './components/ClientDetail';
import { ReportExport } from './components/ReportExport';
import { useLocalRequirements } from './useLocalRequirements';
import './iteration-03.css';
import './iteration-04.css';
type Route = {
    page: 'home' | 'properties' | 'clients';
    client: string | null;
    listing: string | null;
};
function readRoute(): Route { const [path, query] = location.hash.replace(/^#\/?/, '').split('?'); const params = new URLSearchParams(query); return { page: path === 'clients' ? 'clients' : path === 'properties' || path === 'reports' ? 'properties' : 'home', client: params.get('client'), listing: params.get('listing') }; }
const headings: Record<Route['page'], [
    string,
    string
]> = { home: ['Your client. Their next home.', ''], properties: ['Property library', 'Explore listings, price evidence and potential clients.'], clients: ['Clients & needs', 'Review current requirements, recommended properties and viewing feedback.'] };
export function App() {
    const [dataset, setDataset] = useState<Dataset | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState('');
    const [route, setRoute] = useState<Route>(readRoute), [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS });
    const [clientFilters, setClientFilters] = useState<ClientDirectoryFilters>({ ...EMPTY_CLIENT_DIRECTORY_FILTERS });
    const [searchRequirement, setSearchRequirement] = useState<ClientRequirement | null>(null);
    const [homeTask, setHomeTask] = useState<HomeTask>('property'), [homeVersion, setHomeVersion] = useState(0);
    const [reviewTarget, setReviewTarget] = useState<ClientRequirement | null>(null), [editDraft, setEditDraft] = useState<ClientRequirement | null>(null);
    const [dataOpen, setDataOpen] = useState(false), [report, setReport] = useState<SalesReport | null>(null), [reportError, setReportError] = useState('');
    const [identity, setIdentity] = useState<SalesIdentity | null>(() => { try {
        return loadSalesIdentity(localStorage);
    }
    catch {
        return null;
    } });
    const [identityError, setIdentityError] = useState(''), [signInOpen, setSignInOpen] = useState(false), [username, setUsername] = useState(''), [salesIdInput, setSalesIdInput] = useState(''), [loginError, setLoginError] = useState('');
    const local = useLocalRequirements(dataset, identity?.sales_id ?? null);
    const identityRef = useRef(identity);
    identityRef.current = identity;
    const controller = useRef<AbortController>();
    function navigate(next: Route) { const query = new URLSearchParams(); if (next.client)
        query.set('client', next.client); if (next.listing)
        query.set('listing', next.listing); const hash = `#/${next.page}${query.size ? '?' + query : ''}`; setRoute(next); if (location.hash !== hash)
        location.hash = hash; }
    function changeIdentity(next: SalesIdentity | null) { const previous = identityRef.current; if (previous?.sales_id !== next?.sales_id && previous) {
        setHomeVersion(v => v + 1);
        setHomeTask('property');
    } identityRef.current = next; setIdentity(next); setIdentityError(''); setReviewTarget(null); setEditDraft(null); setReport(null); setReportError(''); setSearchRequirement(null); setFilters({ ...EMPTY_FILTERS }); setClientFilters({ ...EMPTY_CLIENT_DIRECTORY_FILTERS }); if (previous)
        navigate({ page: 'home', client: null, listing: null }); }
    useEffect(() => { const hashChanged = () => setRoute(readRoute()); const identityChanged = (event: StorageEvent) => { if (event.key !== null && event.key !== SALES_IDENTITY_KEY)
        return; try {
        changeIdentity(loadSalesIdentity(localStorage));
    }
    catch (reason) {
        changeIdentity(null);
        setIdentityError((reason as Error).message);
    } }; window.addEventListener('hashchange', hashChanged); window.addEventListener('storage', identityChanged); return () => { window.removeEventListener('hashchange', hashChanged); window.removeEventListener('storage', identityChanged); }; }, []);
    async function load() { controller.current?.abort(); const current = new AbortController(); controller.current = current; setBusy(true); setError(''); setReport(null); setEditDraft(null); const timeout = setTimeout(() => current.abort(), 10000); try {
        const response = await fetch('/api/dataset', { signal: current.signal });
        if (!response.ok)
            throw new Error('Unavailable');
        const next = await response.json() as Dataset;
        if (!Array.isArray(next.listing_snapshots) || !Array.isArray(next.client_requirements) || !next.meta)
            throw new Error('Invalid data');
        if (controller.current === current && !current.signal.aborted) {
            setDataset(next);
            setSearchRequirement(null);
            setFilters({ ...EMPTY_FILTERS });
        }
    }
    catch {
        if (controller.current === current) {
            setDataset(null);
            setError('The property data could not be loaded. Retry loading or check the data source.');
        }
    }
    finally {
        clearTimeout(timeout);
        if (controller.current === current)
            setBusy(false);
    } }
    useEffect(() => { void load(); return () => { controller.current?.abort(); controller.current = undefined; }; }, []);
    const sourceListings = useMemo(() => latestListings(dataset?.listing_snapshots ?? []), [dataset]);
    const listings = useMemo(() => sourceListings.filter(row => row.currency === 'AED' || row.currency === null), [sourceListings]);
    const requirements = useMemo(() => currentClientRequirements(dataset?.client_requirements ?? [], local.copies), [dataset, local.copies]);
    const localById = new Map(local.copies.map(copy => [copy.requirement.requirement_id, copy]));
    const areas = useMemo(() => [...new Set(listings.map(row => row.area_name))].sort(), [listings]);
    const selected = sourceListings.find(row => row.listing_id === route.listing) ?? null;
    const [viewings, setViewings] = useState<{
        key: string | null;
        records: ViewingRecord[];
    }>({ key: null, records: [] });
    const [viewingError, setViewingError] = useState('');
    useEffect(() => { function read() { setViewingError(''); if (!identity || !local.key) {
        setViewings({ key: local.key, records: [] });
        return;
    } try {
        const value = loadViewingRecords(localStorage, { scope: local.key, salesId: identity.sales_id, requirements, listings: sourceListings });
        setViewings({ key: local.key, records: value.records });
    }
    catch (reason) {
        setViewings({ key: local.key, records: [] });
        setViewingError((reason as Error).message);
    } } read(); window.addEventListener('storage', read); window.addEventListener('bhhs:viewings-changed', read); return () => { window.removeEventListener('storage', read); window.removeEventListener('bhhs:viewings-changed', read); }; }, [local.key, identity?.sales_id, requirements, sourceListings]);
    const visibleViewings = viewings.key === local.key ? viewings.records : [];
    function visibility(id: string) { const req = requirements.find(r => r.requirement_id === id) ?? localById.get(id)?.requirement; if (req && dataset?.client_requirements.some(r => r.client_id === req.client_id))
        return 'company' as const; return identity ? 'private' as const : 'legacy' as const; }
    function viewClient(req: ClientRequirement) { navigate({ page: 'clients', client: req.client_id, listing: null }); }
    function openEdit(req: ClientRequirement, feedback?: string) { setReviewTarget(req); setEditDraft(feedback ? { ...req, soft_preferences: [req.soft_preferences, feedback].filter(Boolean).join('\n') } : req); }
    function openSignIn() { setUsername(identity?.username ?? ''); setSalesIdInput(identity?.sales_id ?? ''); setLoginError(''); setSignInOpen(true); }
    function signIn() { try {
        changeIdentity(saveSalesIdentity(localStorage, makeSalesIdentity(username, salesIdInput)));
        setSignInOpen(false);
    }
    catch (reason) {
        setLoginError((reason as Error).message);
    } }
    function signOut() { try {
        changeIdentity(saveSalesIdentity(localStorage, null));
    }
    catch (reason) {
        setIdentityError((reason as Error).message);
    } }
    async function saveRequirement(draft: ClientRequirement, target: ClientRequirement | null) {
        const owner = identity?.sales_id;
        if (!owner)
            throw new Error('Sign in before saving a client requirement.');
        if (!dataset || local.loading || (target && !requirements.some(r => r.requirement_id === target.requirement_id)))
            throw new Error('The data or current requirement changed. Reopen the client before saving.');
        const original = target ? dataset.client_requirements.find(r => r.requirement_id === target.requirement_id)?.requirement_id ?? localById.get(target.requirement_id)?.original_requirement_id ?? null : null;
        const req: ClientRequirement = { ...draft, missing_questions: homeReviewQuestions(draft).join('\n') || null, requirement_id: `SESSION-R-${crypto.randomUUID()}`, client_id: target?.client_id ?? draft.client_id, sales_owner: target ? target.sales_owner : owner, verification_status: 'needs_review', reviewed_by: null, captured_at: new Date().toISOString() };
        await local.save({ requirement: req, original_requirement_id: original, parent_requirement_id: target?.requirement_id ?? null, saved_at: new Date().toISOString(), ...(target ? { edit_kind: 'revision' as const } : {}) });
        if (identityRef.current?.sales_id !== owner)
            throw new Error('The sales identity changed. Open the saved client under its owner.');
        setClientFilters({ ...EMPTY_CLIENT_DIRECTORY_FILTERS });
        navigate({ page: 'clients', client: req.client_id, listing: null });
    }
    async function deleteCopy(copy: LocalRequirementCopy) { try {
        await local.remove(copy.requirement.requirement_id);
    }
    catch { /* The hook retains the copy and exposes the storage error. */ } }
    async function restore(copy: LocalRequirementCopy) { const original = dataset?.client_requirements.find(r => r.requirement_id === copy.original_requirement_id); if (original)
        try {
            const target = requirements.find(req => req.requirement_id === copy.requirement.requirement_id);
            if (!target) throw new Error('The requirement changed. Reopen the client before restoring.');
            await saveRequirement({ ...original, notes: 'Restored original conditions in a new browser revision.' }, target);
        }
        catch (reason) {
            setReportError((reason as Error).message);
        } }
    function localControls(req: ClientRequirement) { const copy = localById.get(req.requirement_id); if (!copy)
        return null; return <div className="local-copy-controls"><Tag data-testid="local-copy-status" color="blue">Saved in this browser</Tag><span>Saved {new Date(copy.saved_at).toLocaleString('en-GB')} · Business conditions still require review.</span><div><Button size="small" danger disabled={local.writing} onClick={() => void deleteCopy(copy)}>Delete local copy</Button>{copy.original_requirement_id && <Button size="small" disabled={local.writing} onClick={() => void restore(copy)}>Restore original</Button>}</div></div>; }
    function addPrivate() { setHomeTask('create'); setHomeVersion(v => v + 1); navigate({ page: 'home', client: null, listing: null }); }
    function exportProperty(id: string) { const row = sourceListings.find(l => l.listing_id === id); if (row && dataset) {
        setReportError('');
        setReport(propertySalesReport(row, dataset, requirements, visibleViewings));
    } }
    function exportClient(id: string, requirementId?: string) { try {
        if (viewingError)
            throw new Error('Viewing records could not be loaded. Retry local storage before exporting this client.');
        const req = requirements.find(r => r.client_id === id && (!requirementId || r.requirement_id === requirementId));
        if (!req || !dataset)
            throw new Error('Client unavailable.');
        const scope = visibility(req.requirement_id);
        const assignment = companyAssignment(dataset.client_requirements, id);
        const ownership = scope === 'private' ? `Private · ${identity?.sales_id}` : scope === 'legacy' ? 'Legacy local copy' : assignment.needs_confirmation ? 'Company · Assignment needs confirmation' : assignment.sales_owner ? `Company · ${assignment.sales_owner}` : 'Company · Unassigned';
        setReportError('');
        setReport(clientSalesReport(id, requirements, dataset.client_requirements, local.copies, listings, visibleViewings, ownership, requirementId, sourceListings));
    }
    catch (reason) {
        setReportError((reason as Error).message);
    } }
    const reset = () => { setFilters({ ...EMPTY_FILTERS }); setSearchRequirement(null); };
    return <ConfigProvider theme={{ token: { colorPrimary: '#55223f', colorInfo: '#55223f', colorText: '#28252d', colorBgLayout: '#f5f6f8', fontFamily: "'Segoe UI', Arial, sans-serif", borderRadius: 6, controlHeight: 37 }, components: { Table: { headerBg: '#f7f8fa', cellPaddingBlock: 18 }, Button: { primaryShadow: 'none' } } }}>
    <div className="workspace"><aside className="sidebar"><div className="brand"><span className="brand-circle">BHHS</span><span className="brand-small">BERKSHIRE HATHAWAY<br />HOMESERVICES</span><strong>Gulf Properties</strong></div><div className="workspace-label">SALES WORKSPACE</div>
      <nav aria-label="Main navigation">{([['home', <HomeOutlined />, 'Home'], ['properties', <ApartmentOutlined />, 'Property library'], ['clients', <TeamOutlined />, 'Clients & needs']] as const).map(([page, icon, label]) => <button key={page} className={`nav-item ${route.page === page ? 'active' : ''}`} onClick={() => navigate({ page, client: null, listing: null })}>{icon}{label}</button>)}</nav>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => setDataOpen(true)}><DatabaseOutlined /> Data & sources</button><p>Sales assistance demo</p><div className="sales-profile"><span className="sales-avatar">{identity?.username.slice(0, 1) ?? 'S'}</span><div><strong>{identity?.username ?? 'Sales workspace'}</strong><span>{identity?.sales_id ?? 'Guest'}</span></div></div></div></aside>
      <div className="workspace-main"><header className="topbar"><span>Gulf Properties <span className="breadcrumb-slash">/</span> {route.page === 'home' ? 'Home' : headings[route.page][0]}</span><div className="topbar-right">{identity ? <><span data-testid="current-sales-identity">{identity.username} · {identity.sales_id}</span><Button onClick={openSignIn}>Switch sales identity</Button><Button onClick={signOut}>Sign out</Button></> : <Button icon={<LoginOutlined />} onClick={openSignIn}>Sign in</Button>}</div></header>
      <main className="main-content">{route.page !== 'home' && <div className="page-heading"><div><p className="eyebrow">BHHS GULF PROPERTIES</p><h1>{headings[route.page][0]}</h1><p className="heading-description">{headings[route.page][1]}</p></div></div>}
      <div className="evidence-banner"><span className="banner-dot"/><span>{dataset?.meta.mode === 'product' ? 'Imported records · Review source details and open questions.' : 'Demonstration only · Fictional properties, prices and clients.'}</span><button onClick={() => setDataOpen(true)}>Data & sources <ArrowRightOutlined /></button></div>
      {identityError && <Alert type="error" message="Sales identity needs attention" description={identityError}/>}{error && <Alert type="error" message="Data unavailable" description={error} action={<Button onClick={() => void load()}>Retry loading</Button>}/>}
      {busy ? <div className="loading-panel" role="status" aria-label="Loading property data"><Skeleton active paragraph={{ rows: 8 }}/>Loading property data…</div> : dataset && <>
        {!!dataset.meta.quarantined_count && <Alert type="warning" message={`${dataset.meta.quarantined_count} records await source review and are excluded.`}/>}
        {local.error && <Alert data-testid="local-storage-error" type="error" message="Browser saving needs attention" description={local.error} action={<Button onClick={local.retry}>Retry local storage</Button>}/>}
        {reportError && <Alert type="error" closable onClose={() => setReportError('')} message={reportError}/>}
        {route.page !== 'home' && <div className="local-storage-notice" data-testid="local-storage-notice" role="status">{local.loading ? 'Loading browser copies…' : `${local.copies.length} saved browser copies · Current browser and data version${identity ? ` · ${identity.sales_id}` : ''}`}</div>}
        {route.page === 'home' && <HomeWorkspace key={`${homeVersion}:${dataset.meta.storage_namespace}`} initialTask={homeTask} areas={areas} canSave={!!identity && !local.loading} onSignIn={openSignIn} onFindProperties={(next, req) => { setFilters(next); setSearchRequirement(req); navigate({ page: 'properties', client: null, listing: null }); }} onFindClients={next => { setClientFilters(next); navigate({ page: 'clients', client: null, listing: null }); }} onCreateClient={req => saveRequirement(req, null)}/>}
        {route.page === 'properties' && <>{searchRequirement && homeReviewQuestions(searchRequirement).length > 0 && <Alert type="warning" message="Search conditions to clarify" description={<details><summary>Review open questions</summary><ul>{homeReviewQuestions(searchRequirement).map((q, i) => <li key={i}>{q}</li>)}</ul><p>{searchRequirement.raw_request}</p></details>}/>}<PropertyLibrary listings={listings} requirements={requirements} filters={filters} onFilter={setFilters} active={searchRequirement} onViewClient={viewClient} onReview={openEdit} onOpen={id => navigate({ ...route, listing: id })} onReset={reset} localControls={localControls} onExport={exportProperty}/></>}
        {route.page === 'clients' && <ClientDirectory requirements={requirements} listings={listings} filters={clientFilters} onFiltersChange={setClientFilters} getVisibility={visibility} onView={viewClient} onAddPrivate={addPrivate} canAddPrivate={!!identity} renderLocalControls={localControls}/>}
      </>}
      <footer className="page-footer"><span>BHHS Gulf Properties · Sales assistance demo</span><Button aria-label="Refresh data" type="text" size="small" icon={<ReloadOutlined />} loading={busy} onClick={() => void load()}>Refresh data</Button></footer></main></div></div>
    {dataset && !busy && <><ClientDetail clientId={route.client} requirements={requirements} originals={dataset.client_requirements} copies={local.copies} listings={listings} viewingListings={sourceListings} salesId={identity?.sales_id ?? null} storageScope={local.key} getVisibility={visibility} onClose={() => navigate({ ...route, client: null })} onOpenProperty={id => navigate({ ...route, listing: id })} onEdit={req => openEdit(req)} onExport={exportClient} renderLocalControls={localControls} onUseFeedback={(req, feedback) => openEdit(req, feedback)}/><PropertyDetail key={`${local.key}:${identity?.sales_id ?? 'guest'}`} listing={selected} dataset={dataset} requirements={requirements} salesId={identity?.sales_id ?? null} storageScope={local.key} viewingRecords={visibleViewings} onClose={() => navigate({ ...route, listing: null })} onViewClient={viewClient}/></>}
    {editDraft && reviewTarget && <ClientRequirementEditor key={reviewTarget.requirement_id} initial={editDraft} areas={areas} canSave={!!identity && !local.loading} onSignIn={openSignIn} onClose={() => { setEditDraft(null); setReviewTarget(null); }} onSave={req => saveRequirement(req, reviewTarget)}/>}
    <ReportExport key={`${local.key}:${identity?.sales_id ?? 'guest'}:${report?.filename ?? ''}`} report={report} onClose={() => setReport(null)}/>
    <Modal title="Demo sign in" open={signInOpen} onCancel={() => setSignInOpen(false)} onOk={signIn} okText="Continue as sales" destroyOnClose><p>Choose a sales identity for private copies in this browser.</p>{loginError && <Alert data-testid="identity-save-error" type="error" message={loginError}/>}<label className="field login-field"><span>Username</span><Input aria-label="Username" value={username} onChange={e => setUsername(e.target.value)} maxLength={80}/></label><label className="field login-field"><span>Sales ID</span><Input aria-label="Sales ID" value={salesIdInput} onChange={e => setSalesIdInput(e.target.value)} onPressEnter={signIn} maxLength={64}/></label></Modal>
    <Modal title="Data & sources" open={dataOpen} onCancel={() => setDataOpen(false)} footer={<Button onClick={() => setDataOpen(false)}>Close</Button>} width={670}><p>{dataset?.meta.label}</p><dl className="data-notes"><dt>Demonstration</dt><dd>Sample properties, prices, clients and source references are fictional. Imported product records remain separately identified. Saving or checking a property does not confirm source accuracy, usage permission or business acceptance.</dd><dt>Rules assistant</dt><dd>Pattern extraction and deterministic comparisons. No language model is connected. Missing or contradictory conditions remain open questions; no sale probability or buying power is inferred.</dd><dt>Browser storage</dt><dd>Requirements, viewing notes and sales confirmations are saved by data version and Sales ID in this browser only. Other browsers and site addresses have separate copies. Clearing site data removes local records.</dd><dt>Sales identity</dt><dd>This is a demo identity selector, not server authentication. Only synthetic samples belong in the public demo. Company clients stay shared; each sales identity sees its own private edits.</dd><dt>Requirements and history</dt><dd>Explicit edits create complete new versions. Original imports and independent purchase plans are retained. Delete a local version to return to its parent; Restore original saves the original conditions as a new version.</dd><dt>Price and size</dt><dd>The library uses AED and sq ft. Other currencies retain their original values in source records. Size units do not establish area measurement basis.</dd><dt>Legacy copies</dt><dd>Browser copies created before sales identities remain available while signed out through Local data notes in Clients. They are not unassigned company clients.</dd></dl></Modal>
  </ConfigProvider>;
}
