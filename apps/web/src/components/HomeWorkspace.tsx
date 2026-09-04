import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Descriptions, Input, InputNumber, Modal, Select, Tag } from 'antd';
import { ArrowRightOutlined, SearchOutlined, SendOutlined, TeamOutlined, UserAddOutlined } from '@ant-design/icons';
import { HOME_TASKS, hasClientSearchCondition, homePropertyFilters, homeRequirementErrors, homeReviewQuestions, missingHomeFields, prepareClientSearch, prepareHomeRequirement, type HomeRequirement, type HomeTask } from '../../../../shared/home-tasks';
import { EMPTY_CLIENT_DIRECTORY_FILTERS, clientDirectoryBudgetError, type ClientDirectoryFilters } from '../../../../shared/client-directory';
import type { ClientRequirement } from '../../../../shared/types';
import type { Filters } from '../../../../shared/matching';
import { EnglishDateInput } from './EnglishDateInput';
import '../home-workspace.css';

type Props = {
  areas: string[];
  canSave: boolean;
  initialTask?: HomeTask;
  embedded?: boolean;
  onSignIn: () => void;
  onFindProperties: (filters: Filters, requirement: ClientRequirement) => void;
  onFindClients: (filters: ClientDirectoryFilters) => void;
  onCreateClient: (requirement: ClientRequirement) => Promise<void>;
};
const propertyOptions = ['apartment', 'villa', 'townhouse', 'penthouse', 'land', 'other'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }));
const completionOptions = [{ value: 'either', label: 'No preference' }, { value: 'ready', label: 'Ready' }, { value: 'off_plan', label: 'Off-plan' }];
const pretty = (value: unknown): string => Array.isArray(value) ? value.join(', ') || 'Not specified' : value === null || value === undefined || value === '' ? 'Not specified' : String(value).replaceAll('_', ' ');
const icons = { property: <SearchOutlined />, client: <TeamOutlined />, create: <UserAddOutlined /> };

function Field({ name, required, invalid, children, full = false }: { name: string; required?: boolean; invalid?: boolean; children: ReactNode; full?: boolean }) {
  return <div className={`home-field${full ? ' full' : ''}${invalid ? ' incomplete' : ''}`}><span className="home-field-label">{name}{required && <span className="required-star" aria-hidden="true"> *</span>}</span>{children}</div>;
}

function NumberRange({ label, min, max, onChange, invalid = false }: { label: string; min: number | null; max: number | null; onChange: (min: number | null, max: number | null) => void; invalid?: boolean }) {
  return <div className={`home-range${invalid ? ' invalid' : ''}`} role="group" aria-label={label}>
    <InputNumber aria-label={`${label} minimum`} min={0} controls={false} value={min} onChange={value => onChange(value, max)} placeholder="Min" />
    <span aria-hidden="true">—</span>
    <InputNumber aria-label={`${label} maximum`} min={0} controls={false} value={max} onChange={value => onChange(min, value)} placeholder="Max" status={invalid ? 'error' : undefined} />
  </div>;
}

/** Shared compact form. Editing a saved requirement never relabels its stored units or currency. */
export function CoreRequirementFields({ value, onChange, areas, task, showMissing = true }: {
  value: HomeRequirement; onChange: (requirement: HomeRequirement) => void; areas: string[]; task: 'property' | 'create'; showMissing?: boolean;
}) {
  const missing = showMissing ? missingHomeFields(task, value) : [];
  const update = <K extends keyof HomeRequirement>(key: K, next: HomeRequirement[K]) => onChange({ ...value, [key]: next });
  const budgetLabel = `Budget Range (${value.currency ?? 'currency unconfirmed'})`;
  const sizeLabel = `Size Range (${value.area_unit === 'sqft' ? 'sq ft' : value.area_unit === 'sqm' ? 'sq m' : 'unit unconfirmed'})`;
  return <>
    <div className="home-core-fields">
      {task === 'create' && <Field name="Client Name / Alias" required invalid={missing.includes('client_alias')}><Input aria-label="Client Name / Alias" aria-required value={value.client_alias} status={missing.includes('client_alias') ? 'error' : undefined} onChange={event => update('client_alias', event.target.value)} /></Field>}
      <Field name={task === 'property' ? 'Preferred Area / Community' : 'Preferred Location'} required invalid={missing.includes('preferred_areas')}><Select mode="tags" aria-label="Preferred Location" aria-required placeholder="Choose or enter a location" options={areas.map(area => ({ value: area, label: area }))} value={value.preferred_areas ?? []} onChange={next => update('preferred_areas', next)} status={missing.includes('preferred_areas') ? 'error' : undefined} /></Field>
      <Field name={budgetLabel} required invalid={missing.includes('budget_max')}><NumberRange label="Budget Range" min={value.budget_min} max={value.budget_max} invalid={missing.includes('budget_max')} onChange={(budget_min, budget_max) => onChange({ ...value, budget_min, budget_max })} /></Field>
      <Field name="Property Type" required invalid={missing.includes('property_types')}><Select mode="multiple" aria-label="Property Type" aria-required placeholder="Select property type" options={propertyOptions} value={value.property_types ?? []} onChange={next => update('property_types', next)} status={missing.includes('property_types') ? 'error' : undefined} /></Field>
      <Field name="Bedrooms" required invalid={missing.includes('bedrooms_min')}><InputNumber aria-label="Bedrooms" aria-required min={0} precision={0} placeholder="Minimum bedrooms · 0 for studio" value={value.bedrooms_min} onChange={next => update('bedrooms_min', next)} status={missing.includes('bedrooms_min') ? 'error' : undefined} /><span className="home-field-hint">Minimum count; exact or maximum counts require clarification.</span></Field>
    </div>
    <details className="home-optional-fields" open><summary>More details <span>Optional</span></summary><div className="home-core-fields">
      <Field name={sizeLabel}><NumberRange label="Size Range" min={value.area_min} max={value.area_max ?? null} onChange={(area_min, area_max) => onChange({ ...value, area_min, area_max })} /></Field>
      <Field name={task === 'create' ? 'Completion Preference' : 'Completion Status'}><Select aria-label="Completion Preference" options={completionOptions} value={value.market_preference === 'unknown' ? 'either' : value.market_preference} onChange={next => update('market_preference', next)} /></Field>
      {task === 'create' && <Field name="Purchase Purpose"><Select aria-label="Purchase Purpose" value={value.purchase_purpose} onChange={next => update('purchase_purpose', next)} options={[{ value: 'unknown', label: 'Not specified' }, { value: 'self_use', label: 'Own use' }, { value: 'investment', label: 'Investment' }, { value: 'mixed', label: 'Own use and investment' }]} /></Field>}
      {task === 'create' && <Field name="Purchase By"><EnglishDateInput label="Purchase By" value={value.purchase_by ?? ''} onChange={next => update('purchase_by', next || null)} /></Field>}
      <Field name="Available / Move-in By"><EnglishDateInput label="Available / Move-in By" value={value.move_in_by ?? ''} onChange={next => update('move_in_by', next || null)} /></Field>
      <Field name="Required Features" full><Input.TextArea aria-label="Required Features" autoSize={{ minRows: 1, maxRows: 4 }} placeholder="Must-have features and other hard conditions" value={value.hard_constraints ?? ''} onChange={event => update('hard_constraints', event.target.value || null)} /></Field>
      <Field name={task === 'create' ? 'Preferences / Notes' : 'Notes'} full><Input.TextArea aria-label="Preferences / Notes" autoSize={{ minRows: 1, maxRows: 4 }} value={value.soft_preferences ?? ''} onChange={event => update('soft_preferences', event.target.value || null)} /></Field>
      {task === 'create' && <Field name="Questions to Clarify" full><Input.TextArea aria-label="Questions to Clarify" autoSize={{ minRows: 1, maxRows: 5 }} value={value.missing_questions ?? ''} onChange={event => update('missing_questions', event.target.value || null)} /></Field>}
    </div></details>
  </>;
}

export function HomeWorkspace({ areas, canSave, initialTask = 'property', embedded = false, onSignIn, onFindProperties, onFindClients, onCreateClient }: Props) {
  const startingTask = embedded ? 'create' : initialTask;
  const [task, setTask] = useState<HomeTask>(startingTask);
  const [taskNotes, setTaskNotes] = useState<Record<HomeTask, string>>({ property: '', client: '', create: '' });
  const text = taskNotes[task];
  const setText = (value: string) => setTaskNotes(previous => ({ ...previous, [task]: value }));
  const [draft, setDraft] = useState<HomeRequirement | null>(null);
  const [clientFilters, setClientFilters] = useState<ClientDirectoryFilters | null>(null);
  const [clientWarnings, setClientWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => { setTask(startingTask); setDraft(null); setClientFilters(null); setClientWarnings([]); setConfirmOpen(false); setError(''); }, [startingTask]);
  function changeTask(next: HomeTask) { if (next === task) return; setTask(next); setDraft(null); setClientFilters(null); setClientWarnings([]); setError(''); setConfirmOpen(false); }
  async function prepare() {
    if (!text.trim() || busy) return;
    setBusy(true); setError('');
    try {
      if (task === 'client') { const result = await prepareClientSearch(text, areas); setClientFilters(result.filters); setClientWarnings(result.warnings); setDraft(null); }
      else { const result = await prepareHomeRequirement(text, areas); setDraft(result.requirement); setClientFilters(null); }
    } catch { setError('The details could not be prepared. Your notes are retained; please try again.'); }
    finally { setBusy(false); }
  }
  const missing = task === 'client' ? clientFilters && !hasClientSearchCondition(clientFilters) ? ['search_condition'] : [] : draft ? missingHomeFields(task, draft) : [];
  const errors = task === 'client' ? clientFilters && clientDirectoryBudgetError(clientFilters) ? [clientDirectoryBudgetError(clientFilters)!] : [] : draft ? homeRequirementErrors(draft) : [];
  const questions = task === 'client' ? clientWarnings : draft ? homeReviewQuestions(draft) : [];
  const prepared = Boolean(draft || clientFilters);
  function proceed() {
    if (missing.length || errors.length) return;
    if (task === 'client' && clientFilters) onFindClients(clientFilters);
    else if (task === 'property' && draft) onFindProperties(homePropertyFilters(draft), draft);
    else if (task === 'create' && draft) setConfirmOpen(true);
  }
  async function create() {
    if (!draft || saving || !canSave || missing.length || errors.length) return;
    setSaving(true); setError('');
    try {
      await onCreateClient({ ...draft, requirement_id: `SESSION-R-${crypto.randomUUID()}`, client_id: `SESSION-C-${crypto.randomUUID()}`,
        verification_status: 'needs_review', reviewed_by: null, notes: 'Sales-entered private browser copy. Saving is not business confirmation.' });
      setConfirmOpen(false); setDraft(null); setText('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Saving could not be confirmed. Your draft is retained.'); }
    finally { setSaving(false); }
  }
  const updateClient = (next: Partial<ClientDirectoryFilters>) => setClientFilters({ ...(clientFilters ?? EMPTY_CLIENT_DIRECTORY_FILTERS), ...next });
  return <section className={`home-task-workspace${embedded ? ' embedded' : ''}`} aria-label="Sales task workspace">
    <div className="home-task-heading">{embedded ? <h2>Create a Private Client</h2> : <><span className="eyebrow">SALES WORKSPACE</span><h1>Your client. Their next home.</h1></>}<p>{HOME_TASKS[task].description}</p></div>
    {!embedded && <div className="home-task-buttons" role="group" aria-label="Choose a task">{(['property', 'client', 'create'] as const).map(mode => <Button key={mode} aria-label={HOME_TASKS[mode].label} aria-pressed={task === mode} className={task === mode ? 'selected' : ''} icon={icons[mode]} onClick={() => changeTask(mode)} disabled={busy || saving}>{HOME_TASKS[mode].label}</Button>)}</div>}
    <div className="home-task-composer"><Tag className="home-task-tag" data-testid="selected-home-task">{HOME_TASKS[task].label}</Tag><Input.TextArea aria-label="Sales conversation / notes" placeholder={HOME_TASKS[task].example} autoSize={{ minRows: 2, maxRows: 5 }} value={text} disabled={busy || saving} onChange={event => { setText(event.target.value); setDraft(null); setClientFilters(null); setError(''); }} onPressEnter={event => { if ((event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); void prepare(); } }} /><Button type="primary" aria-label="Send request" title="Send request (Ctrl + Enter)" icon={<SendOutlined />} loading={busy} disabled={!text.trim() || saving} onClick={prepare} /></div>
    {error && !confirmOpen && <Alert type="error" showIcon message={error} />}
    {prepared && <section className="home-task-review" aria-label="Review task details">
      <div className="home-review-title"><h2>Review the details</h2><Tag>{task === 'create' ? 'Private client' : 'Search'}</Tag></div>
      <div className={`home-missing-count ${missing.length ? 'incomplete' : 'complete'}`} role="status" data-testid="home-missing-count">{missing.length ? `${missing.length} required ${missing.length === 1 ? 'field' : 'fields'} still to complete${task === 'client' ? ' — enter at least one search condition.' : '.'}` : 'Required details complete.'}</div>
      {task === 'client' && clientFilters ? <div className="home-core-fields">
        <Field name="Client Name" required={Boolean(missing.length)} invalid={Boolean(missing.length)}><Input aria-label="Client Name" status={missing.length ? 'error' : undefined} value={clientFilters.name} onChange={event => updateClient({ name: event.target.value })} /></Field>
        <Field name="Preferred Location" required={Boolean(missing.length)} invalid={Boolean(missing.length)}><Select aria-label="Preferred Location" allowClear showSearch options={areas.map(area => ({ value: area, label: area }))} value={clientFilters.preferred_location || undefined} status={missing.length ? 'error' : undefined} onChange={value => updateClient({ preferred_location: value ?? '' })} /></Field>
        <Field name="Budget Range (AED)" required={Boolean(missing.length)} invalid={Boolean(missing.length)}><NumberRange label="Budget Range" min={clientFilters.budget_min} max={clientFilters.budget_max} invalid={Boolean(missing.length)} onChange={(budget_min, budget_max) => updateClient({ budget_min, budget_max })} /></Field>
        <Field name="Property Type" required={Boolean(missing.length)} invalid={Boolean(missing.length)}><Select aria-label="Property Type" allowClear options={propertyOptions} value={clientFilters.property_type || undefined} status={missing.length ? 'error' : undefined} onChange={value => updateClient({ property_type: value ?? '' })} /></Field>
        <Field name="Client Type"><Select aria-label="Client Type" value={clientFilters.visibility} onChange={value => updateClient({ visibility: value })} options={[{ value: 'all', label: 'All' }, { value: 'company', label: 'Company' }, { value: 'private', label: 'Private' }, { value: 'unassigned', label: 'Unassigned' }]} /></Field>
      </div> : draft && task !== 'client' && <CoreRequirementFields value={draft} onChange={setDraft} areas={areas} task={task} />}
      {questions.length > 0 && <details className="home-clarifications" open data-testid="home-review-questions"><summary>To clarify <span>{questions.length}</span></summary><ul>{questions.map((question, index) => <li key={index}>{question}</li>)}</ul></details>}
      <details className="home-original-notes"><summary>Original notes</summary><p>{draft?.raw_request ?? text}</p></details>
      {errors.map(message => <Alert key={message} type="error" showIcon message={message} />)}
      <div className="home-continue"><span>{task === 'create' ? 'Confirm the details next. Private copies are saved to this browser.' : 'These conditions will be applied to the results.'}</span><Button type="primary" aria-label="Continue" disabled={Boolean(missing.length || errors.length || busy)} onClick={proceed}>Continue <ArrowRightOutlined /></Button></div>
    </section>}
    <Modal title="Confirm private client" open={confirmOpen} width={720} onCancel={saving ? undefined : () => setConfirmOpen(false)} closable={!saving} maskClosable={!saving} keyboard={!saving} footer={<><Button disabled={saving} onClick={() => { setConfirmOpen(false); setError(''); }}>Back / Edit</Button>{canSave ? <Button type="primary" loading={saving} onClick={create}>Confirm &amp; Create</Button> : <Button type="primary" onClick={onSignIn}>Sign in to create</Button>}</>}>
      <p>Saved to this browser for your current Sales ID. Saving does not resolve the questions below.</p>
      {error && <Alert type="error" showIcon message="Saving could not be confirmed" description={error} />}
      {draft && <Descriptions bordered size="small" column={1} items={[
        { key: 'alias', label: 'Client Name / Alias', children: draft.client_alias },
        { key: 'ownership', label: 'Client Type', children: 'Private · Current signed-in Sales ID' },
        { key: 'location', label: 'Preferred Location', children: pretty(draft.preferred_areas) },
        { key: 'budget', label: 'Budget Range (AED)', children: `${pretty(draft.budget_min)} — ${pretty(draft.budget_max)}` },
        { key: 'type', label: 'Property Type', children: pretty(draft.property_types) },
        { key: 'beds', label: 'Bedrooms (minimum)', children: pretty(draft.bedrooms_min) },
        { key: 'size', label: 'Size Range (sq ft)', children: `${pretty(draft.area_min)} — ${pretty(draft.area_max)}` },
        { key: 'basis', label: 'Size measurement', children: draft.area_basis && draft.area_basis !== 'unknown' ? pretty(draft.area_basis) : 'Area basis needs confirmation' },
        { key: 'completion', label: 'Completion Preference', children: pretty(draft.market_preference) },
        { key: 'purpose', label: 'Purchase Purpose', children: pretty(draft.purchase_purpose) },
        { key: 'purchase', label: 'Purchase By', children: pretty(draft.purchase_by) },
        { key: 'movein', label: 'Available / Move-in By', children: pretty(draft.move_in_by) },
        { key: 'features', label: 'Required Features', children: pretty(draft.hard_constraints) },
        { key: 'notes', label: 'Preferences / Notes', children: pretty(draft.soft_preferences) },
        { key: 'questions', label: 'Questions to Clarify', children: questions.length ? <ul className="compact-list">{questions.map((question, index) => <li key={index}>{question}</li>)}</ul> : 'None recorded' },
        { key: 'original', label: 'Original notes', children: draft.raw_request },
      ]} />}
    </Modal>
  </section>;
}
