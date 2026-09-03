import { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Input, Select, Tag } from 'antd';
import { ArrowRightOutlined, EditOutlined } from '@ant-design/icons';
import type { ClientRequirement } from '../../../../shared/types';
import { EMPTY_FILTERS, requirementTextReview, requirementsToFilters, type Filters } from '../../../../shared/matching';
import { ruleAssistant } from '../../../../shared/assistant';
import { requirementAreaWarnings, resolveRequirementArea } from '../../../../shared/requirement-area';
import { applyRequirementFields } from '../../../../shared/requirement-edit';
import { FilterEditor } from './FilterEditor';

type Props = { open: boolean; areas: string[]; initialRequirement?: ClientRequirement | null; inline?: boolean; canSave?: boolean; onSignIn?: () => void; onClose: () => void; onApply: (req: ClientRequirement, filters: Filters) => Promise<void> };
const example = 'Looking for a ready 2 bedroom apartment in Dubai Marina, budget up to AED 2.8m, for self use. Must have parking. Prefer a balcony. Purchase by 2026-12-01.';
export function RequirementEditor({ open, areas, initialRequirement, inline = false, canSave = true, onSignIn, onClose, onApply }: Props) {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<ClientRequirement | null>(null);
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS, area_basis: 'unknown' });
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setError(''); setSaveError(''); setWarnings([]);
    if (initialRequirement) {
      setText(initialRequirement.raw_request); setDraft({ ...initialRequirement });
      setFilters({ ...requirementsToFilters(initialRequirement), area_basis: resolveRequirementArea(initialRequirement).selected_basis ?? 'unknown' });
    } else { setText(''); setDraft(null); }
  }, [open, initialRequirement]);
  async function extract(raw = text) {
    setBusy(true); setError('');
    try {
      const result = await ruleAssistant.extract(raw, { areas });
      setDraft(result.requirement);
      setFilters(requirementsToFilters(result.requirement));
      setWarnings(result.warnings);
    } catch { setError('Could not prepare the requirements. Your notes are retained; try again.'); }
    finally { setBusy(false); }
  }
  const update = <K extends keyof ClientRequirement>(key: K, value: ClientRequirement[K]) => draft && setDraft({ ...draft, [key]: value });
  const invalid = filters.budget_min !== null && filters.budget_max !== null && filters.budget_min > filters.budget_max;
  const reviewed = draft ? applyRequirementFields(draft, filters) : null;
  const areaWarnings = reviewed ? requirementAreaWarnings(reviewed) : [];
  const textReview = reviewed ? requirementTextReview(reviewed) : { equivalents: [], warnings: [] };
  async function apply() {
    if (!reviewed || invalid || saving || !canSave) return;
    setSaving(true); setSaveError('');
    try {
      const req: ClientRequirement = { ...reviewed, requirement_id: `SESSION-R-${crypto.randomUUID()}`, client_id: initialRequirement?.client_id ?? `SESSION-C-${crypto.randomUUID()}`,
        verification_status: 'needs_review', reviewed_by: null,
        notes: `Local sales review${initialRequirement ? ` of ${initialRequirement.requirement_id}; original record retained` : ''}. ${reviewed.notes ?? ''}` };
      await onApply(req, requirementsToFilters(req)); onClose();
    } catch (reason) { setSaveError(reason instanceof Error ? reason.message : 'Saving could not be confirmed. Your draft is retained.'); }
    finally { setSaving(false); }
  }
  const actions = <div className="drawer-actions"><span data-testid="requirement-save-status">Not saved · Applying saves a private copy for your Sales ID in this browser.</span>{canSave ? <Button type="primary" loading={saving} disabled={!draft || invalid || busy || saving} onClick={apply}>Apply to property library <ArrowRightOutlined /></Button> : <Button type="primary" onClick={onSignIn}>Sign in to save</Button>}</div>;
  const content = <>
    <div className="assistant-mode"><Tag color="gold">Rule demo</Tag><span>Pattern extraction · No language model connected</span></div>
    <h2>Start with the conversation.</h2><p className="muted">Paste de-identified sales notes, then review the structured requirements. Applying saves a separate private copy for your Sales ID and data version. Saving does not confirm business conditions.</p>
    {saveError && <Alert data-testid="requirement-save-error" type="error" showIcon message="Saving could not be confirmed" description={<>{saveError} Your draft remains open; no success has been reported.</>} />}
    <label className="field"><span>Sales conversation / notes</span><Input.TextArea aria-label="Sales conversation / notes" rows={4} value={text} onChange={e => { setText(e.target.value); setDraft(null); }} placeholder="Budget, areas, bedrooms, purpose, timeline, must-haves…" /></label>
    <div className="assistant-actions"><Button type="primary" loading={busy} disabled={!text.trim()} onClick={() => extract()}>Extract requirements</Button><Button onClick={() => { setText(example); extract(example); }}>Use demo conversation</Button><Button icon={<EditOutlined />} onClick={() => extract(text || 'Requirements entered by sales; details to be confirmed.')}>Enter manually</Button></div>
    {error && <Alert type="error" message={error} showIcon />}
    {draft && <div className="review-fields">
      <div className="section-label"><span>REVIEW & EDIT</span><Tag>Sales confirmation required</Tag></div>
      {warnings.length > 0 && <Alert type="warning" showIcon message="Some details need your review" description={<ul className="compact-list">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>} />}
      <p className="muted">Structured conditions filter the library. Original notes and hard restrictions are retained; unresolved details require confirmation before recommending.</p>
      <FilterEditor value={filters} onChange={setFilters} areas={areas} requirementsMode />
      {areaWarnings.length > 0 && <Alert data-testid="requirement-area-warning" type="warning" showIcon message="Area basis needs confirmation (面积口径待确认)" description={<>{areaWarnings.join(' ')} Confirm the meaning against the original request, then reconcile the field and any legacy area-basis statement. The property measurement is not used to fill this field.</>} />}
      {textReview.warnings.length > 0 && <Alert data-testid="requirement-text-warning" type="warning" showIcon message="Original wording and hard conditions need review" description={<ul className="compact-list">{textReview.warnings.map((message, index) => <li key={index}>{message}</li>)}</ul>} />}
      {textReview.equivalents.length > 0 && <details data-testid="requirement-text-covered"><summary>Text already represented by structured fields</summary><ul className="compact-list">{textReview.equivalents.map((item, index) => <li key={index}>{item.text} → {item.fields.join(', ')}</li>)}</ul><p>Numeric equivalence does not confirm an area basis. Original restrictions remain below.</p></details>}
      {invalid && <Alert type="error" message="Minimum price must not exceed maximum price." />}
      <div className="requirement-extra">
        <label className="field"><span>Client alias</span><Input aria-label="Client alias" value={draft.client_alias} onChange={e => update('client_alias', e.target.value)} /></label>
        <label className="field"><span>Purchase purpose</span><Select aria-label="Purchase purpose" value={draft.purchase_purpose} onChange={v => update('purchase_purpose', v)} options={['self_use', 'investment', 'mixed', 'unknown'].map(v => ({ value: v, label: v.replaceAll('_', ' ') }))} /></label>
        <label className="field"><span>Budget constraint</span><Select aria-label="Budget constraint" value={draft.budget_constraint} onChange={v => update('budget_constraint', v)} options={['hard', 'flexible', 'unknown'].map(v => ({ value: v, label: v }))} /></label>
        <label className="field"><span>Purchase by</span><input aria-label="Purchase by" className="date-input" type="date" value={draft.purchase_by ?? ''} onChange={e => update('purchase_by', e.target.value || null)} /></label>
        <label className="field full"><span>Other hard restrictions</span><Input.TextArea aria-label="Other hard restrictions" value={draft.hard_constraints ?? ''} onChange={e => update('hard_constraints', e.target.value || null)} autoSize /></label>
        <label className="field full"><span>Preferences (not exclusions)</span><Input.TextArea aria-label="Preferences" value={draft.soft_preferences ?? ''} onChange={e => update('soft_preferences', e.target.value || null)} autoSize /></label>
        <label className="field full"><span>Questions to clarify</span><Input.TextArea aria-label="Questions to clarify" value={draft.missing_questions ?? ''} onChange={e => update('missing_questions', e.target.value || null)} autoSize /></label>
      </div>
    </div>}
  </>;
  return inline ? <section className="home-assistant requirement-drawer" aria-label="Client requirements">{content}{actions}</section> : <Drawer title="Client requirements" width="min(940px, 96vw)" open={open} onClose={saving ? undefined : onClose} closable={!saving} maskClosable={!saving} keyboard={!saving} className="requirement-drawer" footer={actions}>{content}</Drawer>;
}
