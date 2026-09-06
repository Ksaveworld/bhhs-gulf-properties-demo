export type SourceKind = 'call' | 'whatsapp' | 'email' | 'photos' | 'note' | 'crm';
export type SourceTurn = { time: string; author: string; text: string; key?: boolean };
export type SourcePhoto = { id: string; name: string; quadrant: number; uploadedAt: string; uploader: string };
export type DemoSource = {
  id: string; title: string; meta: string; text: string;
  kind?: SourceKind; occurredAt?: string; enteredAt?: string; enteredBy?: string; channel?: string; synthetic?: boolean;
  original?: {
    duration?: string; participants?: string[]; transcript?: SourceTurn[];
    messages?: SourceTurn[];
    email?: { from: string; to: string; subject: string; body: string; attachments: { name: string; text: string }[] };
    photos?: SourcePhoto[];
    crm?: { createdAt: string; createdBy: string; fields: Record<string, string> };
  };
};
export const SOURCE_GROUPS: { kind: SourceKind; label: string }[] = [
  { kind: 'call', label: 'Call recordings' }, { kind: 'whatsapp', label: 'WhatsApp' }, { kind: 'email', label: 'Email' },
  { kind: 'photos', label: 'Photos from client' }, { kind: 'note', label: 'Your notes' }, { kind: 'crm', label: 'CRM record' },
];
export function sourceKind(source: DemoSource): SourceKind {
  return source.kind ?? (/call/i.test(source.title) ? 'call' : /whatsapp/i.test(source.title) ? 'whatsapp' : /email/i.test(source.title) ? 'email' : /photo/i.test(source.title) ? 'photos' : /CRM|client record/i.test(source.title) ? 'crm' : 'note');
}
export function sourceTime(source: DemoSource): number { return Date.parse(source.occurredAt || source.enteredAt || '') || 0; }
export function sourceDate(value?: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Time not recorded';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Dubai' }).format(new Date(value)) + ' · ' + new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' }).format(new Date(value));
}
export function groupedSources(sources: DemoSource[]) {
  return SOURCE_GROUPS.map(group => {
    const entries = sources.filter(s => sourceKind(s) === group.kind).sort((a, b) => sourceTime(b) - sourceTime(a));
    return { ...group, entries, count: entries.reduce((sum, s) => sum + (s.original?.photos?.length || 1), 0) };
  }).filter(group => group.entries.length);
}
export function newRecordedSource(id: string, title: string, text: string, kind: SourceKind = 'note', synthetic = false): DemoSource {
  const occurredAt = new Date().toISOString();
  return { id, title, text, kind, occurredAt, enteredAt: occurredAt, enteredBy: 'Sales user', channel: kind === 'call' ? 'Demo outbound call' : 'Manual sales entry', synthetic, meta: `${sourceDate(occurredAt)} · ${kind === 'call' ? 'from this call' : 'Sales entry'}` };
}

/** All extra material is an explicitly fictional, stored demo source, never a reconstructed customer record. */
export function enrichKhalidSources(base: DemoSource[]): DemoSource[] {
  const times: Record<string, string> = { '1': '2026-03-12T10:00:00+04:00', '2': '2026-03-04T09:30:00+04:00', '3': '2026-03-12T16:12:00+04:00', '4': '2026-03-06T14:20:00+04:00', '5': '2026-03-07T14:20:00+04:00', '6': '2026-03-04T17:00:00+04:00', '7': '2026-01-14T09:00:00+04:00' };
  const chatTexts = [
    'Good morning. This is Khalid.', 'Good morning, Khalid. I have your details.', 'Thank you for the call.', 'You are welcome. I will keep the shortlist together here.',
    'Palm Jumeirah, Fronds K to N.', 'Understood. I will focus on those fronds.', 'Emirates Hills can be a fallback.', 'I will keep it as a separate option.',
    'Please send the locations.', 'I will include the frond and community for each home.', 'Received, thank you.', 'Let me know when you have had a look.',
    'We need a ready property.', 'I will exclude off-plan options from our discussion.', 'Our children start school in September.', 'I have recorded the school-term timing.',
    'We want to move before school starts.', 'We will check availability against that timing.', 'The family will be living there.', 'Thank you, that clarifies the purpose.',
    'Five bedrooms would be our minimum.', 'I will flag any property with fewer bedrooms.', 'Staff accommodation matters too.', 'I will check that in the property details.',
    'Could you resend the Frond N details?', 'Yes, I will include Frond N in the next shortlist.', 'My wife wants to see the Frond N one before we talk numbers.', 'I will check a suitable viewing slot.',
    'She will make the final call on the house.', 'Then we should include her in the viewing.', 'My brother handles negotiation.', 'I will include him before any offer is written.',
    'Thank you.', 'You are welcome.', 'I have sent some interior photos.', 'Received. I will compare their style with the shortlist.',
    'We like pale, modern interiors.', 'I will record that as a preference to discuss during the visit.', 'Please avoid heavy classical detailing.', 'Understood. I will highlight interior-style gaps.',
    'Could you check the service charges?', 'I will request the service-charge history.', 'I also have concerns about resale on Frond K.', 'I will keep that as a question to resolve.',
    'Can we see Frond N again?', 'I will confirm availability for a second viewing.', 'Please let me know when the service-charge figures arrive.',
  ];
  const enriched = base.map(source => {
    const kind = sourceKind(source), occurredAt = times[source.id];
    const s: DemoSource = { ...source, kind, occurredAt, enteredAt: occurredAt, enteredBy: kind === 'note' || kind === 'crm' ? 'Sales user (demo)' : 'Khalid Al Mansouri (demo)', channel: kind === 'call' ? 'Recording uploaded by sales' : kind === 'photos' ? 'WhatsApp attachment import' : kind === 'crm' ? 'CRM import' : kind === 'note' ? 'Manual sales entry' : `${kind === 'email' ? 'Email' : 'WhatsApp'} import`, synthetic: true };
    if (kind === 'call') {
      s.enteredBy = 'Sales adviser (demo)';
      s.original = { duration: source.id === '1' ? '08:42' : '05:16', participants: ['Khalid Al Mansouri', 'Sales adviser'], transcript: [
        { time: '00:00', author: 'Sales adviser', text: 'Thanks for making time. Let’s review the homes and the questions still open.' },
        { time: '00:28', author: 'Khalid Al Mansouri', text: source.text, key: true },
        { time: '03:10', author: 'Sales adviser', text: 'I will keep those points with the source material and flag anything that differs from the earlier brief.' },
        { time: '03:40', author: 'Khalid Al Mansouri', text: source.id === '1' ? 'Please make sure my wife can see Frond N. My brother will help with the price discussion.' : 'Please send the service-charge history before we discuss making an offer.', key: true },
        { time: '04:20', author: 'Sales adviser', text: 'Understood. I will follow up on the remaining questions and viewing availability.' },
        { time: source.id === '1' ? '08:42' : '05:16', author: 'System', text: 'End of the stored demo transcript.' },
      ] };
    }
    if (kind === 'whatsapp') s.original = { messages: chatTexts.map((text, index) => ({ time: new Date(Date.parse('2026-03-10T09:00:00+04:00') + index * 4320000).toISOString(), author: index % 2 === 0 ? 'Khalid Al Mansouri' : 'Sales adviser', text, key: /Frond|wife|school|bedrooms|staff|charges|resale|interiors/i.test(text) })) };
    if (kind === 'email') {
      const body = 'Hi,\n\n' + source.text + '\n\nPlease check that the properties are ready and available before the school term. I have attached the outline of our layout requirements.\n\nThank you,\nKhalid';
      s.title = 'Re: Palm Jumeirah options';
      s.original = { email: { from: 'Khalid Al Mansouri <khalid@client.example>', to: 'Sales adviser <sales@bhhs.example>', subject: s.title, body, attachments: [{ name: 'Family-layout-brief.txt', text: 'Fictional layout attachment\nFive bedrooms, staff accommodation, private pool and four parking spaces. Confirm floor area and measurement basis with the client.' }] } };
    }
    if (kind === 'photos') s.original = { photos: ['Modern living room', 'Open kitchen', 'Pale stone and glass', 'Minimal bedroom'].map((name, quadrant) => ({ id: `photo-${quadrant + 1}`, name, quadrant, uploadedAt: occurredAt, uploader: 'Khalid Al Mansouri (demo)' })) };
    if (kind === 'crm') s.original = { crm: { createdAt: occurredAt, createdBy: 'Sales adviser (demo)', fields: { 'Record ID': '#C-2026-0114', 'Client name': 'Khalid Al Mansouri', 'Phone ending': '418', 'Budget ceiling': 'AED 16m', 'Property type': 'Apartment', 'Bedrooms': '4', 'Original area': 'Dubai Marina', 'Later area of interest': 'Palm Jumeirah', 'Completion preference': 'Ready property only' } } };
    s.meta = `${sourceDate(occurredAt)} · ${kind === 'photos' ? '4 images' : kind === 'call' ? s.original!.duration : kind === 'whatsapp' ? '47 messages' : s.title}`;
    return s;
  });
  const earlierEmail: DemoSource = { id: 'email-feb28', kind: 'email', title: 'Villa shortlist', occurredAt: '2026-02-28T09:12:00+04:00', enteredAt: '2026-02-28T09:12:00+04:00', enteredBy: 'Sales adviser (demo)', channel: 'Email import', synthetic: true, meta: 'Feb 28 · 09:12 · Villa shortlist', text: 'Please review the Palm Jumeirah villa shortlist and let us know which homes to discuss.', original: { email: { from: 'Sales adviser <sales@bhhs.example>', to: 'Khalid Al Mansouri <khalid@client.example>', subject: 'Villa shortlist', body: 'Hi Khalid,\n\nPlease review the Palm Jumeirah villa shortlist. We will confirm your bedroom needs, family timing and preferred style before arranging the next viewing.\n\nBest,\nYour sales adviser', attachments: [] } } };
  const earlierCall: DemoSource = { id: 'call-mar2', kind: 'call', title: 'Initial requirements call', occurredAt: '2026-03-02T11:00:00+04:00', enteredAt: '2026-03-02T11:00:00+04:00', enteredBy: 'Sales adviser (demo)', channel: 'Recording uploaded by sales', synthetic: true, meta: 'Mar 2 · 11:00 · 04:02', text: 'A family residence in Palm Jumeirah. Keep a ready villa on the shortlist.', original: { duration: '04:02', participants: ['Khalid Al Mansouri', 'Sales adviser'], transcript: [{ time: '00:00', author: 'Sales adviser', text: 'What should we focus on in the next shortlist?' }, { time: '00:25', author: 'Khalid Al Mansouri', text: 'A family residence in Palm Jumeirah. Keep a ready villa on the shortlist.', key: true }, { time: '02:00', author: 'Sales adviser', text: 'I will confirm the updated budget and bedroom needs in our next conversation.' }, { time: '04:02', author: 'System', text: 'End of the stored demo transcript.' }] } };
  return [...enriched, earlierEmail, earlierCall];
}
