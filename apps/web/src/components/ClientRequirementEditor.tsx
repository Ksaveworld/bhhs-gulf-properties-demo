import { useState } from 'react';
import { Alert, Button, Collapse, Drawer, Input } from 'antd';
import type { ClientRequirement } from '../../../../shared/types';
import { CoreRequirementFields } from './HomeWorkspace';
import { homeRequirementErrors, homeReviewQuestions } from '../../../../shared/home-tasks';
export function ClientRequirementEditor({ initial, areas, onClose, onSave, canSave, onSignIn }: {
    initial: ClientRequirement;
    areas: string[];
    onClose: () => void;
    onSave: (req: ClientRequirement) => Promise<void>;
    canSave: boolean;
    onSignIn: () => void;
}) {
    const [draft, setDraft] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const errors = homeRequirementErrors(draft), questions = homeReviewQuestions(draft);
    async function save() { if (!canSave || busy || errors.length)
        return; setBusy(true); setError(''); try {
        await onSave(draft);
        onClose();
    }
    catch (reason) {
        setError(reason instanceof Error ? reason.message : 'The revision could not be saved.');
    }
    finally {
        setBusy(false);
    } }
    return <Drawer title="Edit client requirements" open width={760} onClose={onClose} destroyOnClose footer={<div className="v2-editor-footer"><span>Save a new version in this browser.</span>{canSave ? <Button type="primary" loading={busy} disabled={!!errors.length} onClick={save}>Save requirements</Button> : <Button onClick={onSignIn}>Sign in to save</Button>}</div>}>
    {error && <Alert type="error" message="Saving could not be confirmed" description={error}/>}
    <CoreRequirementFields value={draft} onChange={setDraft} areas={areas} task="create" showMissing={false}/>
    {errors.length > 0 && <Alert type="error" message={errors.join(' ')}/>}
    {questions.length > 0 && <Alert type="warning" message="To clarify" description={<ul>{questions.map((q, i) => <li key={i}>{q}</li>)}</ul>}/>}
    <Collapse items={[{ key: 'original', label: 'Original conversation', children: <p style={{ whiteSpace: 'pre-wrap' }}>{initial.raw_request}</p> }]}/>
    <label className="field"><span>Additional sales note</span><Input.TextArea aria-label="Additional sales note" rows={2} value={draft.notes ?? ''} onChange={e => setDraft({ ...draft, notes: e.target.value || null })}/></label>
  </Drawer>;
}
