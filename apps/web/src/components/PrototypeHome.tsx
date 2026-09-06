import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Drawer, Input, Modal } from 'antd';
import { AudioOutlined, MessageOutlined, MailOutlined, PictureOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { DEMO_CLIENT_ID, khalidProfile, type DemoProfile } from '../../../../shared/prototype-demo';
import './prototype-workspace.css';
import { newRecordedSource } from '../../../../shared/prototype-sources';

type Props = { profiles: DemoProfile[]; onChange: (profile: DemoProfile) => void; onOpen: (id: string) => void; quickTools: ReactNode };
const reading = [
  ['Transcribing call recordings', '3 recordings / 18 minutes'], ['Reading WhatsApp conversations', '47 messages · 12 relevant details'],
  ['Parsing emails and attachments', '2 emails · 1 floor plan'], ['Matching CRM records', '1 similar record found'], ['Comparing historical sales', '214 transactions · 2 similar clients'],
];
export function PrototypeHome({ profiles, onChange, onOpen, quickTools }: Props) {
  const [notes, setNotes] = useState(''), [attachments, setAttachments] = useState<string[]>([]), [drag, setDrag] = useState(false);
  const [stage, setStage] = useState(0), [readCount, setReadCount] = useState(0), [skip, setSkip] = useState(false);
  const [draft, setDraft] = useState<DemoProfile>(khalidProfile), [identity, setIdentity] = useState('');
  const [choices, setChoices] = useState<Record<string, 'new' | 'crm'>>({});
  const [payment, setPayment] = useState(''), [supplement, setSupplement] = useState(false), [paymentDecision, setPaymentDecision] = useState('');
  const [newOpen, setNewOpen] = useState<'intake' | 'standalone' | null>(null), [newName, setNewName] = useState(''), [phone, setPhone] = useState('');
  const [tools, setTools] = useState(false), [submitted, setSubmitted] = useState('');
  const latestMessage = useRef<HTMLDivElement>(null);
  const identityDraft = useRef<DemoProfile>(khalidProfile());
  useEffect(() => {
    if (stage !== 1) return;
    if (skip) { setReadCount(5); setStage(2); return; }
    const tasks = reading.map((_, index) => setTimeout(() => setReadCount(index + 1), (index + 1) * 500));
    tasks.push(setTimeout(() => setStage(2), 2850));
    return () => tasks.forEach(clearTimeout);
  }, [stage, skip]);
  useEffect(() => { if (stage > 1) latestMessage.current?.scrollIntoView({ block: 'nearest', behavior: skip ? 'instant' : 'smooth' }); }, [stage, skip]);
  function start() {
    setSubmitted([notes, ...attachments].filter(Boolean).join(' · ')); setDraft(khalidProfile()); setIdentity(''); setChoices({}); setPayment(''); setPaymentDecision(''); setSupplement(false); setSkip(false); setReadCount(0); setStage(1);
  }
  function confirmIdentity(next: DemoProfile, label: string) { identityDraft.current = next; setDraft(next); setIdentity(label); setStage(3); }
  function create() {
    const next = { ...khalidProfile(), id: `PROTOTYPE-${crypto.randomUUID()}`, name: newName.trim() || 'New client', phone, updated: 'Just now' };
    if (newOpen === 'intake') confirmIdentity(next, `Created a separate client: ${next.name}`);
    else { next.fixture = false; next.core = next.core.map(f => ({ ...f, value: 'To confirm', sources: [] })); next.known = []; next.sources = [newRecordedSource('created', 'Sales entry', `Name: ${next.name}\nPhone: ${phone}`)]; onChange(next); onOpen(next.id); }
    setNewOpen(null);
  }
  function choose(key: string, value: 'new' | 'crm') {
    const nextChoices = { ...choices, [key]: value }; setChoices(nextChoices);
    if (nextChoices.budget && nextChoices.home) setStage(4);
  }
  function finish(value: string) {
    const source = 'intake-review';
    const confirmed = identityDraft.current;
    const next: DemoProfile = { ...confirmed, payment: value, paymentSource: value ? source : '', updated: 'Just now',
      core: confirmed.core.map(f => f.key === 'budget' && choices.budget === 'crm' ? { ...f, value: 'Up to AED 16m', sources: ['7'] } : f.key === 'home' && choices.home === 'crm' ? { ...f, value: 'Apartment · 4 bedrooms', sources: ['7'] } : f),
      known: confirmed.known.map(f => f.key === 'budget-note' && choices.budget === 'crm' ? { ...f, value: 'CRM ceiling retained: AED 16m. Material proposes AED 18–22m.', sources: ['7', '1'] } : f.key === 'what' && choices.home === 'crm' ? { ...f, value: 'CRM apartment brief retained; the proposed villa preference was not adopted.', sources: ['7', '4'] } : f),
      sources: [...confirmed.sources, newRecordedSource(source, 'Sales confirmation', `${identity}\nBudget: ${choices.budget === 'new' ? 'Adopt new information: AED 18–22m' : 'Keep CRM: AED 16m'}\nProperty type: ${choices.home === 'new' ? 'Adopt new information: villa' : 'Keep CRM: apartment'}\nPayment: ${value || 'Confirm later in the call'}${notes ? `\nSubmitted sales note (not part of the preset extraction): ${notes}` : ''}`, 'note', confirmed.fixture)],
    };
    onChange(next); setDraft(next); setPaymentDecision(value || 'Confirm later in the call'); setStage(5);
  }
  function goBack(target: number) {
    setPayment(''); setPaymentDecision(''); setSupplement(false); setNewOpen(null);
    if (target <= 3) { setChoices({}); setDraft(identityDraft.current); }
    if (target <= 2) { setIdentity(''); setDraft(khalidProfile()); identityDraft.current = khalidProfile(); }
    if (target === 0) { setSkip(false); setReadCount(0); }
    setStage(target);
  }
  const back = (target: number, label: string) => <div className="proto-step-back"><button aria-label={label} onClick={() => goBack(target)}>← Back one step</button></div>;
  const priority = (p: DemoProfile) => p.call && !p.receipt ? 0 : p.known.some(f => f.key === 'signals' && /viewing|second|visit|看房/i.test(f.value)) ? 1 : 2;
  const today = [...profiles].sort((a, b) => priority(a) - priority(b) || (b.updated === 'Just now' ? 1 : 0) - (a.updated === 'Just now' ? 1 : 0)).slice(0, 4);
  const message = (title: string, children: ReactNode, current = false) => <div className="proto-message" ref={current ? latestMessage : undefined}><span className="proto-agent" aria-label="Agent">A</span><div><h3>{title}</h3>{children}</div></div>;
  return <section className="proto proto-home" aria-label="Home workspace">
    <div className="proto-disclosure"><span>Demo</span> Fictional client, sources and price presets · calls, CRM saves and messages are simulated.</div>
    <h1>Your client.<br />Their next home.</h1>
    <p className="proto-lede">Drop in the calls, chats and notes from a client. We’ll read them against your CRM and your closed deals, and tell you where the deal stands.</p>
    {stage > 0 && <div className="proto-conversation" aria-label="Client analysis conversation" aria-live="polite">
      <div className="proto-sales-message">{submitted || 'Read the example client material'}</div>
      <div className="proto-animation-control"><small>Demo material analysis</small><button onClick={() => setSkip(true)} disabled={skip || stage >= 5}>Skip animation</button></div>
      {message('Reading this client’s material', <ul className="proto-read-tasks">{reading.map(([label, count], i) => <li className={i < readCount ? 'done' : ''} key={label}><span>{i < readCount ? '✓' : '◐'}</span><b>{label}</b><small>{i < readCount ? count : 'Waiting…'}</small></li>)}</ul>)}
      {stage >= 2 && message('A client to confirm', <div className="proto-identity"><div><strong>Khalid Al Mansouri</strong><span>High match</span></div><p>CRM #C-2026-0114 · Created 14 Jan</p><h4>Why this matches</h4><ul><li>Phone ending 418 in the recording matches the CRM.</li><li>WhatsApp name matches the CRM contact.</li><li>Shared area of interest: Palm Jumeirah.</li></ul>{identity ? <p className="proto-confirmed">✓ {identity}</p> : <div className="proto-buttons"><button className="proto-primary" onClick={() => confirmIdentity(draft, 'Confirmed as the same client')}>Confirm same client</button><button className="proto-outline" onClick={() => { setNewName(''); setPhone(''); setNewOpen('intake'); }}>Not the same — create client</button></div>}{back(0, 'Back from identity confirmation')}</div>, stage === 2)}
      {stage >= 3 && message('9 details extracted from this material', <>
        <h4>3 new details</h4><div className="proto-extracted"><p><b>Purchase purpose</b><span>Family home, children starting school in September</span><small>← Call · 12 Mar</small></p><p><b>Decision maker</b><span>His wife has the final say</span><small>← Call · 12 Mar</small></p><p><b>Unspoken preference</b><span>Modern minimal interiors; dislikes classical styles</span><small>← Client photos · inferred</small></p></div>
        <div className="proto-conflicts"><h4>2 conflicts with the CRM · choose which to keep</h4>{[['budget', 'Budget', 'AED 16m', 'AED 18–22m'], ['home', 'Property type', 'Apartment', 'Villa']].map(([key, label, before, after]) => <div className="proto-conflict" role="group" aria-label={`${label} conflict`} key={key}><b>{label}</b><p>CRM: {before} <span>→</span> This material: {after}</p><div className="proto-buttons"><button disabled={stage >= 5} aria-pressed={choices[key] === 'new'} onClick={() => choose(key, 'new')}>Adopt new information</button><button disabled={stage >= 5} aria-pressed={choices[key] === 'crm'} onClick={() => choose(key, 'crm')}>Keep CRM</button></div></div>)}</div>
        <details className="proto-consistent"><summary>4 details already agree</summary><ul><li>Phone ending 418</li><li>WhatsApp contact name</li><li>Palm Jumeirah interest in the later CRM note</li><li>Ready property preference in the retained client brief</li></ul></details>
        {back(2, 'Back from extracted details')}
      </>, stage === 3)}
      {stage >= 4 && message('One thing is still missing', <><p>Cash or mortgage never came up in the material. This affects how quickly the deal can move.</p>{paymentDecision ? <p className="proto-confirmed">✓ {paymentDecision}</p> : <><div className="proto-buttons"><button className="proto-outline" onClick={() => finish('')}>Confirm later in the call</button><button className="proto-outline" onClick={() => setSupplement(true)}>Add it now</button></div>{supplement && <div className="proto-supplement"><label>Payment method<select aria-label="Payment method" value={payment} onChange={e => setPayment(e.target.value)}><option value="">Choose payment method</option><option>Full cash</option><option>Mortgage</option></select></label><button className="proto-primary" disabled={!payment} onClick={() => finish(payment)}>Confirm payment</button></div>}</>}{back(3, 'Back from missing information')}</>, stage === 4)}
      {stage >= 5 && message(`${draft.name}’s profile is updated`, <><button className="proto-primary" onClick={() => onOpen(draft.id)}>View client assessment <ArrowRightOutlined /></button>{back(4, 'Back from completion')}</>, true)}
    </div>}
    <div className={`proto-composer ${drag ? 'drag' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); setAttachments(Array.from(e.dataTransfer.files).map(f => f.name)); }}>
      <textarea aria-label="Client material" placeholder="Paste a note, or attach this client’s material below." value={notes} onChange={e => setNotes(e.target.value)} />
      <div className="proto-tray">{([['Call recordings', <AudioOutlined />, '3'], ['WhatsApp', <MessageOutlined />, '47'], ['Email', <MailOutlined />, '2'], ['Photos', <PictureOutlined />, '4']] as const).map(([label, icon, count]) => <button className={`proto-pill ${attachments.includes(label) ? 'on' : ''}`} aria-label={label} title={`Select ${label.toLowerCase()} from the demo material pack`} aria-pressed={attachments.includes(label)} key={label} onClick={() => setAttachments(v => v.includes(label) ? v.filter(x => x !== label) : [...v, label])}>{icon}{label}{attachments.includes(label) && <em>{count}</em>}</button>)}<button className="proto-primary" disabled={stage > 0 && stage < 5} onClick={start}>Read this client</button></div>
      {!!attachments.filter(a => !['Call recordings', 'WhatsApp', 'Email', 'Photos'].includes(a)).length && <small className="proto-file-note">Files selected: {attachments.join(', ')}. This preview uses the supplied demo material pack.</small>}
    </div>
    <p className="proto-fineprint">Every detail stays linked to the sentence it came from. Material buttons select the demo pack.</p>
    <section className="proto-resume"><div className="proto-resume-title"><h2>Needs you today</h2><button onClick={() => { setNewName(''); setPhone(''); setNewOpen('standalone'); }}>+ New client</button></div>
      {today.map(p => <button className="proto-rowlink" key={p.id} onClick={() => onOpen(p.id)}><span><b>{p.name}</b><small>{p.sources.length} sources · {p.updated}</small></span><p>{p.call ? p.receipt ? 'Viewing invitation sent in demo. Prepare service charge history before Thursday.' : `Viewing proposed for ${p.call.time}. Send the service charge history and viewing invitation.` : p.id === DEMO_CLIENT_ID ? 'High interest · second viewing requested. Confirm Saturday and send the service charge history.' : 'Review the client’s needs and agree the next step.'}</p></button>)}
    </section>
    <button className="proto-quick" onClick={() => setTools(true)}>Quick tools</button><Drawer title="Quick tools" open={tools} width="min(900px, 96vw)" onClose={() => setTools(false)}>{quickTools}</Drawer>
    <Modal title="New client" open={!!newOpen} onCancel={() => setNewOpen(null)} onOk={create} okText={newOpen === 'intake' ? 'Create and continue' : 'Create client'}><label className="proto-input">Client name<Input aria-label="New client name" value={newName} onChange={e => setNewName(e.target.value)} /></label><label className="proto-input">Phone<Input aria-label="New client phone" value={phone} onChange={e => setPhone(e.target.value)} /></label></Modal>
  </section>;
}
