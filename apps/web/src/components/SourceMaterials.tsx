import { useEffect, useState } from 'react';
import { Drawer } from 'antd';
import { groupedSources, sourceDate, sourceKind, sourceTime, type DemoSource, type SourceKind, type SourcePhoto } from '../../../../shared/prototype-sources';
import interiors from '../assets/demo-interiors.png';
import './source-materials.css';

type Props = { sources: DemoSource[]; activeIds: string[]; onSelect: (ids: string[]) => void };
const newestKind = (sources: DemoSource[]) => sources.length ? sourceKind([...sources].sort((a, b) => sourceTime(b) - sourceTime(a))[0]) : 'note';
function Photo({ photo }: { photo: SourcePhoto }) {
  return <span className="material-photo"><img src={interiors} alt={`${photo.name} · AI-generated demo image`} style={{ left: photo.quadrant % 2 ? '-100%' : 0, top: photo.quadrant > 1 ? '-100%' : 0 }} /></span>;
}
export function SourceMaterials({ sources, activeIds, onSelect }: Props) {
  const [expanded, setExpanded] = useState<SourceKind[]>(() => [newestKind(sources)]);
  const [inspectId, setInspectId] = useState<string | null>(null), [photoId, setPhotoId] = useState('');
  const groups = groupedSources(sources), selected = sources.find(source => source.id === inspectId);
  const signature = sources.map(s => `${s.id}:${s.enteredAt}`).join('|');
  useEffect(() => { setExpanded([newestKind(sources)]); }, [signature]);
  useEffect(() => {
    const kinds = sources.filter(s => activeIds.includes(s.id)).map(sourceKind);
    if (kinds.length) setExpanded(previous => [...new Set([...previous, ...kinds])]);
  }, [activeIds, signature]);
  const raw = selected?.original, kind = selected ? sourceKind(selected) : null;
  const photo = raw?.photos?.find(p => p.id === photoId) ?? raw?.photos?.[0];
  return <>
    <h2>SOURCES <span>{sources.length} records</span></h2>
    <div className="source-groups">{groups.map(group => <section className="source-group" key={group.kind}>
      <button className="source-group-toggle" aria-expanded={expanded.includes(group.kind)} aria-controls={`source-group-${group.kind}`} onClick={() => setExpanded(v => v.includes(group.kind) ? v.filter(k => k !== group.kind) : [...v, group.kind])}><span>{expanded.includes(group.kind) ? '▾' : '▸'} {group.label}</span><b>{group.count}{group.kind === 'photos' ? ' images' : ''}</b></button>
      <div id={`source-group-${group.kind}`} hidden={!expanded.includes(group.kind)}>{group.entries.map(source => <div className="source-material-row" key={source.id} data-source-id={source.id}>
        <button className={`proto-source ${activeIds.includes(source.id) ? 'lit' : ''}`} aria-pressed={activeIds.includes(source.id)} onClick={() => onSelect(activeIds.includes(source.id) ? activeIds.filter(id => id !== source.id) : [source.id])}><time dateTime={source.occurredAt}>{sourceDate(source.occurredAt)}</time><b>{source.title}</b><span>{source.original?.photos ? `${source.original.photos.length} images` : source.original?.duration ? `Duration ${source.original.duration}` : source.original?.messages ? `${source.original.messages.length} messages` : ''}</span>{activeIds.includes(source.id) && <q>{source.text}</q>}</button>
        <button className="source-original-arrow" aria-label={`Open original ${source.title} ${source.id}`} title="View original material" onClick={() => { onSelect([source.id]); setPhotoId(''); setInspectId(source.id); }}>↗</button>
      </div>)}</div>
    </section>)}</div>
    <Drawer rootClassName="source-material-drawer" open={!!selected} width="min(860px, 100vw)" onClose={() => setInspectId(null)} title={selected && <div className="material-ingress"><h2>{selected.title}</h2><p><b>Entered {sourceDate(selected.enteredAt)}</b> · {selected.enteredBy || 'Contributor not recorded'} · {selected.channel || 'Channel not recorded'}</p><small>{selected.synthetic ? 'Fictional original material · demo sample, not a real customer record' : 'Source as supplied · missing metadata remains unrecorded'} · Times in Dubai</small></div>}>
      {selected && <div className="material-original">
        {kind === 'call' && <><dl className="material-metadata"><div><dt>Call time</dt><dd>{sourceDate(selected.occurredAt)}</dd></div><div><dt>Duration</dt><dd>{raw?.duration || 'Not recorded'}</dd></div><div><dt>Participants</dt><dd>{raw?.participants?.join(' · ') || 'Not recorded'}</dd></div></dl><h3>Full stored transcript</h3><p className="material-caption">Highlighted sentences support the client assessment.</p><ol className="material-transcript">{raw?.transcript?.length ? raw.transcript.map((turn, i) => <li key={i}><div><time>{turn.time}</time><b>{turn.author}</b></div>{turn.key ? <mark>{turn.text}</mark> : <p>{turn.text}</p>}</li>) : <li><p>{selected.text}</p></li>}</ol></>}
        {kind === 'whatsapp' && <><h3>Original conversation</h3><p className="material-caption">{sourceDate(raw?.messages?.[0]?.time)} → {sourceDate(raw?.messages?.at(-1)?.time)} · {raw?.messages?.length ?? 0} messages</p><div className="material-chat">{raw?.messages?.length ? raw.messages.map((turn, i) => <article className={turn.author === 'Sales adviser' ? 'sales' : 'client'} key={i}><header>{turn.author} <time>{sourceDate(turn.time)}</time></header><p>{turn.text}</p></article>) : <p>{selected.text}</p>}</div></>}
        {kind === 'email' && <><dl className="material-metadata"><div><dt>From</dt><dd>{raw?.email?.from || 'Not recorded'}</dd></div><div><dt>To</dt><dd>{raw?.email?.to || 'Not recorded'}</dd></div><div><dt>Sent</dt><dd>{sourceDate(selected.occurredAt)}</dd></div><div><dt>Subject</dt><dd>{raw?.email?.subject || selected.title}</dd></div></dl><h3>Email body</h3><pre className="material-body">{raw?.email?.body || selected.text}</pre><h3>Attachments · {raw?.email?.attachments.length || 0}</h3>{raw?.email?.attachments.length ? raw.email.attachments.map(attachment => <details className="material-attachment" key={attachment.name}><summary>{attachment.name}</summary><pre>{attachment.text}</pre></details>) : <p>No attachments in the stored source.</p>}</>}
        {kind === 'photos' && <><h3>Client image material</h3><p className="material-caption">AI-generated interior samples stand in for the fictional client’s photos.</p><div className="material-photo-grid">{raw?.photos?.map(item => <button aria-label={`View photo ${item.name}`} aria-pressed={photo?.id === item.id} key={item.id} onClick={() => setPhotoId(item.id)}><Photo photo={item}/><b>{item.name}</b><small>{sourceDate(item.uploadedAt)} · {item.uploader}</small></button>)}</div>{photo && <figure className="material-photo-large"><Photo photo={photo}/><figcaption>{photo.name} · AI-generated demo image</figcaption></figure>}<p>{selected.text}</p></>}
        {kind === 'note' && <><h3>Your original note</h3><p className="material-caption">Recorded {sourceDate(selected.occurredAt)}</p><pre className="material-body">{selected.text}</pre></>}
        {kind === 'crm' && <><dl className="material-metadata"><div><dt>Created</dt><dd>{sourceDate(raw?.crm?.createdAt || selected.occurredAt)}</dd></div><div><dt>Created by</dt><dd>{raw?.crm?.createdBy || 'Not recorded'}</dd></div></dl><h3>Original CRM field values</h3>{raw?.crm && <dl className="material-crm-fields">{Object.entries(raw.crm.fields).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>}<h3>Original record text</h3><pre className="material-body">{selected.text}</pre></>}
      </div>}
    </Drawer>
  </>;
}
