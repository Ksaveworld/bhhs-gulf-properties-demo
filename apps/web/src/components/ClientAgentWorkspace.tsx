import { useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Drawer, Input, Modal, Select, Tag } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, CheckOutlined, FileTextOutlined, MessageOutlined, MailOutlined, PhoneOutlined, PictureOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { BRIEF_FIELDS, buildClientBrief, describeBriefField, exampleClientMaterials, factHasChange, selectBriefEvidence, recordBriefReview, type ClientBrief, type ClientMaterial, type MaterialKind } from '../../../../shared/client-brief';
import { evaluateMatch } from '../../../../shared/matching';
import { homeRequirementErrors, missingHomeFields } from '../../../../shared/home-tasks';
import { clientDisplayName, propertyDisplayName } from '../../../../shared/property-presentation';
import type { ClientRequirement, ListingSnapshot } from '../../../../shared/types';
import { CoreRequirementFields } from './HomeWorkspace';
import { money } from '../format';
import './client-agent-workspace.css';

const materialIcons: Record<MaterialKind, ReactNode> = { 'Sales note': <FileTextOutlined />, WhatsApp: <MessageOutlined />, Email: <MailOutlined />, 'Call transcript': <PhoneOutlined />, 'Photo notes': <PictureOutlined /> };
const kinds = Object.keys(materialIcons) as MaterialKind[];
const clean = (text: string) => text.replace(/^Demo\s+/i, '');
type Props = {
  areas: string[]; listings: ListingSnapshot[]; requirements: ClientRequirement[];
  canSave: boolean; onSignIn: () => void;
  onSave: (draft: ClientRequirement, baseline: ClientRequirement | null, onSaved?: (saved: ClientRequirement) => void) => Promise<void>;
  onOpenProperty: (id: string) => void; onOpenClient: (req: ClientRequirement) => void;
  quickTools: ReactNode;
};

export function ClientAgentWorkspace({ areas, listings, requirements, canSave, onSignIn, onSave, onOpenProperty, onOpenClient, quickTools }: Props) {
  const [materials, setMaterials] = useState<ClientMaterial[]>([]), [text, setText] = useState('');
  const [kind, setKind] = useState<MaterialKind>('Sales note'), [clientId, setClientId] = useState<string | null>(null);
  const [brief, setBrief] = useState<ClientBrief | null>(null), [baseline, setBaseline] = useState<ClientRequirement | null>(null);
  const [saveTarget, setSaveTarget] = useState<ClientRequirement | null>(null);
  const [sourceId, setSourceId] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false), [toolsOpen, setToolsOpen] = useState(false);
  const [review, setReview] = useState<ClientRequirement | null>(null), [approved, setApproved] = useState(false), [saved, setSaved] = useState(false);
  const [callStage, setCallStage] = useState<'prepare' | 'active' | 'review' | null>(null), [feedback, setFeedback] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  const selectedClient = requirements.find(req => req.requirement_id === clientId) ?? null;
  const visibleSource = materials.find(material => material.id === sourceId);
  const changes = brief?.facts.filter(factHasChange) ?? [];
  const matches = brief ? listings.filter(listing => listing.listing_status === 'active').map(listing => ({ listing, result: evaluateMatch(listing, brief.draft) })) : [];
  const rank = { match: 0, review: 1, excluded: 2 };
  matches.sort((a, b) => rank[a.result.status] - rank[b.result.status] || a.result.conflicts.length - b.result.conflicts.length || b.result.matched.length - a.result.matched.length || a.listing.listing_id.localeCompare(b.listing.listing_id));
  const candidates = matches.filter(match => match.result.status !== 'excluded');
  const excluded = matches.filter(match => match.result.status === 'excluded');
  const questions = brief ? [
    ...(!brief.draft.budget_max || !brief.draft.currency ? ['Confirm the budget and its currency.'] : []),
    ...(brief.draft.budget_constraint === 'unknown' ? ['Is the budget a hard limit, and does it include fees?'] : []),
    ...(!brief.draft.purchase_by ? ['When does the client want to complete the purchase?'] : []),
    'Who needs to agree before arranging a viewing?',
  ] : [];

  async function analyze(next: ClientMaterial[], record: ClientRequirement | null) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await buildClientBrief(next, record, areas);
      if (!brief) setSaveTarget(record);
      setBrief(result); setMaterials(next); setBaseline(record); setSourceId(next.at(-1)?.id ?? 'baseline');
      setApproved(false); setSaved(false); setText(''); setAddOpen(false);
      return true;
    } catch { setError('The materials could not be read. Your text is still here; try again.'); return false; }
    finally { setBusy(false); }
  }
  async function readText() {
    if (!text.trim()) return;
    const material: ClientMaterial = { id: crypto.randomUUID(), kind, title: `${kind} · ${materials.length + 1}`, text: text.trim(), synthetic: false };
    await analyze([...materials, material], brief ? baseline : selectedClient);
  }
  async function readFile(file?: File) {
    if (!file) return;
    if (!/\.(txt|md|csv)$/i.test(file.name)) { setError('Choose a .txt, .md or .csv file. For audio or photos, paste a transcript or a written description.'); return; }
    if (file.size > 1024 * 1024) { setError('Choose a text file smaller than 1 MB.'); return; }
    try { setText(await file.text()); setError(''); }
    catch { setError('This file could not be read. Paste the text instead.'); }
  }
  async function saveReviewed() {
    if (!brief || !approved || !canSave || busy) return;
    setBusy(true); setError('');
    try {
      await onSave({ ...brief.draft, ...(baseline ? {} : { client_id: `SESSION-C-${crypto.randomUUID()}`, requirement_id: `SESSION-R-${crypto.randomUUID()}` }) }, saveTarget, setSaveTarget);
      setSaved(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Your client copy could not be saved. The draft is retained.'); }
    finally { setBusy(false); }
  }
  function confirmReview() {
    if (!brief || !review) return;
    const recorded = recordBriefReview(brief, review);
    setBrief(recorded.brief);
    if (recorded.material) { setMaterials([...materials, recorded.material]); setSourceId(recorded.material.id); }
    setApproved(true); setSaved(false); setReview(null);
  }
  const composer = <div className="agent-composer">
    <div className="agent-material-tabs" role="group" aria-label="Material type">{kinds.map(item => <button key={item} disabled={busy} className={kind === item ? 'selected' : ''} aria-pressed={kind === item} onClick={() => setKind(item)}>{materialIcons[item]} {item === 'Call transcript' ? 'Call' : item === 'Photo notes' ? 'Photos' : item}</button>)}</div>
    <label className="agent-input-label" htmlFor="client-material">{kind === 'Call transcript' ? 'Paste the call transcript' : kind === 'Photo notes' ? 'Describe what the client shared in the photo' : 'Paste a client conversation or a sales note'}</label>
    <Input.TextArea id="client-material" aria-label="Client material" disabled={busy} value={text} onChange={event => setText(event.target.value)} placeholder="Client name: Alex. Looking for a ready 2 bedroom apartment in Dubai Marina. Budget up to AED 2.8m, with parking…" autoSize={{ minRows: 4, maxRows: 9 }} />
    {(kind === 'Call transcript' || kind === 'Photo notes') && <p className="agent-caption">{kind === 'Call transcript' ? 'Audio transcription is not connected. Use text from a call.' : 'Image recognition is not connected. Use your written description.'}</p>}
    <div className="agent-composer-footer"><Button type="text" icon={<UploadOutlined />} disabled={busy} onClick={() => upload.current?.click()}>Import text</Button><Button type="primary" loading={busy} disabled={!text.trim()} onClick={() => void readText()}>{brief ? 'Read new material' : 'Read this client'} <ArrowRightOutlined /></Button></div>
  </div>;
  const errorNotice = error && <Alert type="error" message={error} showIcon closable onClose={() => setError('')} />;

  return <section className="client-agent" aria-label="Client intelligence workspace">
    <input ref={upload} type="file" hidden accept=".txt,.md,.csv,text/plain" aria-label="Import client text file" onChange={event => { void readFile(event.target.files?.[0]); event.target.value = ''; }} />
    {!brief ? <>
      <div className="agent-home-heading"><span className="eyebrow">YOUR CLIENT, IN CONTEXT</span><h1>Every conversation.<br /><em>A clearer next move.</em></h1><p>Bring the notes, calls and conversations together.<br />See what changed, which homes fit, and what to ask next.</p></div>
      <div className="agent-start-layout"><div><div className="agent-client-picker"><label htmlFor="workspace-client">Who is this about?</label><Select id="workspace-client" aria-label="Link to client" value={clientId ?? 'new'} onChange={value => setClientId(value === 'new' ? null : value)} options={[{ value: 'new', label: 'A new client' }, ...requirements.map(req => ({ value: req.requirement_id, label: `${clientDisplayName(req)} · ${req.preferred_areas?.join(', ') || 'Location to confirm'}` }))]} /></div>{composer}{errorNotice}<p className="agent-caption">Text stays in this session until you review and save a client copy. Material types label the source; no channel is connected.</p></div>
      <aside className="agent-example"><span className="agent-example-kicker">EXPLORE A CLIENT STORY</span><h2>A new message.<br />A different shortlist.</h2><p>Alex is looking in Dubai Marina. A follow-up message brings the budget down from AED 2.8m to AED 2.5m.</p><div className="agent-example-timeline"><span><PhoneOutlined /> Initial call <b>AED 2.8m</b></span><span><MessageOutlined /> Latest WhatsApp <b>AED 2.5m</b></span><span><CheckOutlined /> Review the change <b>Your decision</b></span></div><Button onClick={() => { setClientId(null); void analyze(exampleClientMaterials(), null); }} disabled={busy}>Explore example <ArrowRightOutlined /></Button><small>Fictional client and conversations</small></aside></div>
      <div className="agent-section-heading"><div><h2>Continue with a client</h2><p>Open a current record, then add the latest conversation.</p></div><Button aria-label="Quick tools" type="text" onClick={() => setToolsOpen(true)}>Quick tools <ArrowRightOutlined /></Button></div>
      <div className="agent-client-cards">{requirements.slice(0, 3).map(req => <button key={req.requirement_id} className="agent-client-card" onClick={() => { setClientId(req.requirement_id); void analyze([], req); }} disabled={busy}><span className="agent-avatar">{clientDisplayName(req).slice(0, 1)}</span><strong>{clientDisplayName(req)}</strong><span>{req.preferred_areas?.join(', ') || 'Location to confirm'}</span><b>{money(req.budget_max, req.currency)}</b><span className="agent-card-link">Open client workspace <ArrowRightOutlined /></span></button>)}{!requirements.length && <p>No client records in this data version. Start with a conversation above.</p>}</div>
    </> : <>
      <div className="agent-brief-top"><button className="agent-back" onClick={() => { setBrief(null); setMaterials([]); setText(''); setError(''); }}><ArrowLeftOutlined /> Client workspace</button><span>{saved ? 'Saved browser copy' : approved ? 'Reviewed · not saved' : 'Session draft · review before saving'}</span><Button aria-label="Quick tools" type="text" onClick={() => setToolsOpen(true)}>Quick tools</Button></div>
      <div className="agent-brief-heading"><div><p className="eyebrow">CLIENT BRIEF</p><h1>{brief.draft.client_alias ? clean(brief.draft.client_alias) : 'Your next client'}</h1><p>{brief.draft.preferred_areas?.join(' / ') || 'Location to confirm'} <span>·</span> {baseline ? 'Linked to a current client record' : 'New client'}</p></div><Button aria-label="Add material" icon={<PlusOutlined />} disabled={busy} onClick={() => setAddOpen(true)}>Add material</Button></div>
      {errorNotice}
      <div className="agent-journey" aria-label="Client workflow"><span className="done"><CheckOutlined /> Materials linked</span><span className={approved ? 'done' : 'current'}>{approved ? <CheckOutlined /> : '2'} Review understanding</span><span>3 Plan the next conversation</span></div>
      <div className="agent-brief-grid">
        <aside className="agent-evidence-panel"><div className="agent-panel-heading"><h2>The evidence</h2><span>{materials.length + (baseline ? 1 : 0)} sources</span></div>
          <div className="agent-source-list">{baseline && <button className={sourceId === 'baseline' ? 'selected' : ''} onClick={() => setSourceId('baseline')}><FileTextOutlined /><span><b>Current client record</b><small>{clientDisplayName(baseline)}</small></span></button>}{materials.map(material => <button key={material.id} className={sourceId === material.id ? 'selected' : ''} onClick={() => setSourceId(material.id)}>{materialIcons[material.kind]}<span><b>{material.title}</b><small>{material.kind}</small></span></button>)}</div>
          <div className="agent-source-paper" aria-label="Source text"><span className="eyebrow">{sourceId === 'baseline' ? 'EXISTING RECORD' : visibleSource?.synthetic ? 'FICTIONAL SOURCE' : 'ORIGINAL MATERIAL'}</span><h3>{sourceId === 'baseline' ? 'What we already know' : visibleSource?.kind}</h3><p>{sourceId === 'baseline' ? baseline?.raw_request : visibleSource?.text}</p>{sourceId === 'baseline' && baseline && <Button type="link" onClick={() => onOpenClient(baseline)}>Open full client record <ArrowRightOutlined /></Button>}</div>
          <p className="agent-caption">Each source stays separate. New material proposes a change; it does not overwrite the client record.</p>
        </aside>
        <section className="agent-understanding"><div className="agent-panel-heading"><h2>Our understanding</h2><Tag color={approved ? 'green' : 'gold'}>{approved ? 'Reviewed' : 'For review'}</Tag></div>
          {!!changes.length && <div className="agent-change-note"><strong>{changes.length} {changes.length === 1 ? 'change' : 'changes'} {approved ? 'reviewed' : 'to review'}</strong><p>{approved ? 'Your reviewed conditions are shown below. Selecting a different source will reopen the review.' : 'The latest material suggests different conditions. Choose which source to use, then review the brief.'}</p></div>}
          <div className="agent-facts">{brief.facts.filter((fact, index) => index < 5 || fact.evidence.length > 0).map((fact) => <div className={`agent-fact ${factHasChange(fact) ? 'changed' : ''}`} key={fact.id} role="group" aria-label={`${fact.label} evidence`}><span>{fact.label}{factHasChange(fact) && <small>Changed</small>}</span><strong>{describeBriefField(BRIEF_FIELDS.find(field => field.id === fact.id)!, brief.draft)}</strong>{fact.evidence.length > 0 ? <button className="agent-source-ref" onClick={() => setSourceId(fact.evidence[fact.selected].sourceId)}><FileTextOutlined /> {BRIEF_FIELDS.find(field => field.id === fact.id)!.keys.some(key => JSON.stringify(brief.draft[key]) !== JSON.stringify(fact.evidence[fact.selected].values[key])) ? 'Sales edit · view earlier source' : fact.evidence[fact.selected].label}</button> : <small className="agent-caption">Not established by the supplied materials</small>}{factHasChange(fact) && <Select aria-label={`Source for ${fact.label}`} value={fact.selected} options={fact.evidence.map((evidence, position) => ({ value: position, label: `${evidence.display} — ${evidence.label}` }))} onChange={value => { setBrief(selectBriefEvidence(brief, fact.id, value)); setApproved(false); setSaved(false); }} />}</div>)}</div>
          <div className="agent-questions"><h3>Before the next viewing</h3><ul>{questions.map(question => <li key={question}>{question}</li>)}</ul><details><summary>Extraction notes & limitations</summary><p>Text extraction and property comparisons use the current demo rules. Intent, decision makers and unstated preferences require sales review.</p>{brief.warnings.length ? <ul>{brief.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : <p>No additional extraction notes.</p>}</details></div>
          <Button type="primary" block onClick={() => setReview({ ...brief.draft })}>{approved ? 'Edit reviewed brief' : 'Review & confirm brief'} <ArrowRightOutlined /></Button>
          {approved && <Button block aria-label={saved ? 'Client copy saved' : canSave ? 'Save client copy' : 'Sign in to save client copy'} aria-busy={busy} disabled={busy || saved} loading={busy} onClick={canSave ? () => void saveReviewed() : onSignIn}>{saved ? 'Client copy saved' : canSave ? 'Save client copy' : 'Sign in to save client copy'}</Button>}
        </section>
        <aside className="agent-actions"><div className="agent-panel-heading"><h2>Homes to discuss</h2><span>{candidates.length} candidates</span></div><p className="agent-caption">Based on the {approved ? 'reviewed' : 'proposed'} conditions. Asking prices; fees not included.</p>
          <div className="agent-shortlist">{candidates.slice(0, 3).map(({ listing, result }) => <article className="agent-property" key={listing.listing_id}><div><span>{listing.area_name}</span><Tag color={result.status === 'match' ? 'green' : 'gold'}>{result.status === 'match' ? 'Conditions met' : 'To clarify'}</Tag></div><h3>{propertyDisplayName(listing)}</h3><strong>{money(listing.asking_price, listing.currency)}</strong><p>{listing.bedrooms ?? '?'} beds · {listing.area_value?.toLocaleString('en-US') ?? '?'} {listing.area_unit === 'sqft' ? 'sq ft' : listing.area_unit ?? ''}</p><p className="agent-property-risk">{result.conflicts[0] ?? result.unknowns[0]}</p><details><summary>Why this home?</summary><ul>{result.matched.map(reason => <li key={reason}>{reason}</li>)}</ul>{[...result.conflicts, ...result.unknowns].map((reason, index) => <p className="agent-match-caution" key={index}>{reason}</p>)}</details><Button type="link" onClick={() => onOpenProperty(listing.listing_id)}>Details & price evidence <ArrowRightOutlined /></Button></article>)}</div>
          {!candidates.length && <div className="agent-empty"><h3>No current home meets these conditions</h3><p>Review the budget or must-haves with the client. The result covers this dataset only.</p></div>}
          {candidates.length > 3 && <details className="agent-more"><summary>{candidates.length - 3} more candidates</summary>{candidates.slice(3).map(({ listing }) => <Button key={listing.listing_id} type="link" onClick={() => onOpenProperty(listing.listing_id)}>{propertyDisplayName(listing)}</Button>)}</details>}
          {!!excluded.length && <details className="agent-more"><summary>{excluded.length} homes outside hard conditions</summary>{excluded.map(({ listing, result }) => <div key={listing.listing_id}><b>{propertyDisplayName(listing)}</b><p>{result.conflicts.join(' ')}</p></div>)}</details>}
          <div className="agent-next-action"><span className="eyebrow">NEXT CONVERSATION</span><h3>{questions[0] ?? 'Confirm viewing interest'}</h3><p>Review the open questions, then capture the client’s response.</p><Button disabled={brief.draft.data_kind !== 'demo'} icon={<PhoneOutlined />} onClick={() => { setFeedback(''); setCallStage('prepare'); }}>Simulate follow-up</Button><small>{brief.draft.data_kind === 'demo' ? 'Simulated call · no customer is contacted' : 'Use a fictional example to rehearse a call. Add material for actual client feedback.'}</small></div>
          <details className="agent-history-gap"><summary>Historical client reference</summary><p>No verified client-to-completed-sale history is available in this dataset. Use the separate price evidence in a property’s details; it is not a similar-client success story.</p></details>
        </aside>
      </div>
    </>}
    <Drawer title="Quick tools" open={toolsOpen} width="min(900px, 96vw)" onClose={() => setToolsOpen(false)}>{quickTools}</Drawer>
    <Modal title="Add a client interaction" open={addOpen} onCancel={() => !busy && setAddOpen(false)} footer={null} width={740}>{composer}{errorNotice}</Modal>
    <Modal title="Review the client brief" open={!!review} onCancel={() => setReview(null)} width={850} footer={review && <Button type="primary" disabled={missingHomeFields('create', review).length > 0 || homeRequirementErrors(review).length > 0} onClick={confirmReview}>Use reviewed brief</Button>}>
      <p>Confirm the conditions for this shortlist. Saving a browser copy is a separate step.</p>{review && <><CoreRequirementFields value={review} onChange={setReview} areas={areas} task="create" />{missingHomeFields('create', review).length > 0 && <Alert type="warning" message={`${missingHomeFields('create', review).length} required fields still to complete.`} />}{homeRequirementErrors(review).map(message => <Alert type="error" message={message} key={message} />)}<details><summary>Source material</summary><p style={{ whiteSpace: 'pre-wrap' }}>{review.raw_request}</p></details></>}
    </Modal>
    <Modal title="Simulated client follow-up" open={!!callStage} onCancel={() => !busy && setCallStage(null)} footer={null}>
      <Tag color="gold">Simulation · no call or CRM connection</Tag>
      {callStage === 'prepare' && <><h3>Start with the questions that matter</h3><ul>{questions.map(question => <li key={question}>{question}</li>)}</ul><p>Use this rehearsal to see how a conversation updates the client brief.</p><Button type="primary" onClick={() => setCallStage('active')}>Start simulated call</Button></>}
      {callStage === 'active' && <div className="agent-call-active"><PhoneOutlined /><h3>Follow-up rehearsal</h3><p>No phone connection is active. Continue to enter the outcome.</p><Button onClick={() => setCallStage('review')}>Finish & review notes</Button></div>}
      {callStage === 'review' && <><h3>What did the client say?</h3><Input.TextArea aria-label="Follow-up transcript" value={feedback} onChange={event => setFeedback(event.target.value)} rows={5} placeholder="Paste the follow-up transcript or write the outcome…" /><Button type="text" onClick={() => setFeedback('My budget cap is AED 2.3m. I still want a ready 2 bedroom apartment in Dubai Marina. Please send the shortlist for me to review.')}>Use fictional response</Button><p className="agent-caption">This is simulated feedback. Review any extracted changes before saving.</p>{errorNotice}<Button type="primary" loading={busy} disabled={!feedback.trim()} onClick={async () => { if (await analyze([...materials, { id: crypto.randomUUID(), kind: 'Call transcript', title: 'Simulated follow-up', text: feedback, synthetic: true }], baseline)) setCallStage(null); }}>Add feedback to workspace</Button></>}
    </Modal>
  </section>;
}
