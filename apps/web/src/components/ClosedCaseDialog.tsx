import { Modal } from 'antd';
import type { ClosedCase } from '../../../../shared/prototype-cases';
import './closed-case.css';

export function ClosedCaseDialog({ value, currentClientId, onClose, onOpenClient }: { value: ClosedCase | null; currentClientId: string; onClose: () => void; onOpenClient?: (id: string) => void }) {
  return <Modal open={!!value} onCancel={onClose} width={720} title={value && <div className="closed-case-heading"><h2>{value.name}</h2><span>{value.closed}</span></div>} footer={value && <div className="closed-case-footer"><span>Fictional closed-client example</span>{onOpenClient && value.clientId !== currentClientId && <button onClick={() => { onClose(); onOpenClient(value.clientId); }}>Open client record →</button>}</div>}>
    {value && <div className="closed-case"><p className="closed-case-disclosure">{value.supplied ? 'Demo case supplied in the second-round plan.' : 'Demo case: supplied sale outcome with an illustrative process narrative.'}</p>
      <section><h3>Sale outcome</h3><p>{value.result}</p></section>
      <section><h3>The client at the time</h3><p>{value.portrait}</p></section>
      <section><h3>What made the deal difficult</h3><ul>{value.challenges.map(text => <li key={text}>{text}</li>)}</ul></section>
      <section><h3>How it was resolved</h3><ul>{value.resolutions.map(text => <li key={text}>{text}</li>)}</ul></section>
      <section className="closed-case-reference"><h3>What this offers for Khalid</h3><p>{value.reference}</p></section>
    </div>}
  </Modal>;
}
