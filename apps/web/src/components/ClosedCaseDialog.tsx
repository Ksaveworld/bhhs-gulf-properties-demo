import { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Dropdown } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ClosedCase } from '../../../../shared/prototype-cases';
import { closedDealReport } from '../../../../shared/closed-deal-report';
import { downloadReport, exportSalesReport } from '../report-export';
import './closed-case.css';

export function ClosedCaseDialog({ value, currentClientId, onClose, onOpenClient }: { value: ClosedCase | null; currentClientId: string; onClose: () => void; onOpenClient?: (id: string) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { setError(''); }, [value?.id]);
  const report = value ? closedDealReport(value, currentClientId) : null;
  async function exportDeal(format: 'pdf' | 'docx') {
    if (!report || busy) return;
    setBusy(true); setError('');
    try { downloadReport(await exportSalesReport(report, format), `${report.filename}.${format}`); }
    catch { setError('The brief could not be exported. Please retry.'); }
    finally { setBusy(false); }
  }
  return <Drawer rootClassName="closed-case-drawer" placement="right" width="min(880px, 96vw)" open={!!value} onClose={onClose}
    title={value && <div className="closed-case-heading"><span>Historical Closed Deal</span><h2>{value.name}</h2><small>{value.closed}</small></div>}
    extra={<Dropdown trigger={['click']} disabled={busy} menu={{ items: [{ key: 'pdf', label: 'Export as PDF' }, { key: 'docx', label: 'Export as Word' }], onClick: ({ key }) => void exportDeal(key as 'pdf' | 'docx') }}><Button type="primary" icon={<DownloadOutlined />} loading={busy}>Export</Button></Dropdown>}
    footer={value && <div className="closed-case-footer"><span>Fictional closed-client example</span>{onOpenClient && value.clientId !== currentClientId && <button onClick={() => { onClose(); onOpenClient(value.clientId); }}>Open client record →</button>}</div>}>
    {report && <div className="closed-case" key={`${value!.id}:${currentClientId}`}>
      <p className="closed-case-disclosure">{report.disclosure}</p>
      {error && <Alert type="error" showIcon message={error} />}
      {report.sections.map((section, index) => <section key={section.heading} className={index === 4 ? 'closed-case-reference' : ''}>
        <h3>{section.heading}</h3>
        {index === 0 ? <dl className="closed-case-facts">{section.lines.map(line => { const split = line.indexOf(': '); return <div key={line}><dt>{line.slice(0, split)}</dt><dd>{line.slice(split + 2)}</dd></div>; })}</dl>
          : index === 3 ? <div className="closed-case-solutions">{value!.challenges.map((_, i) => <article key={i}><h4>Challenge {i + 1}</h4><p>{section.lines[i * 2].replace(/^Challenge: /, '')}</p><h4>Resolution</h4><p>{section.lines[i * 2 + 1].replace(/^Resolution: /, '')}</p></article>)}</div>
          : index === 2 ? <ol className="closed-case-journey">{section.lines.map(line => <li key={line}>{line}</li>)}</ol>
          : section.lines.map(line => <p key={line}>{line}</p>)}
      </section>)}
    </div>}
  </Drawer>;
}
