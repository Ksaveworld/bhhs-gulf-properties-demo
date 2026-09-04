import { useState } from 'react';
import { Alert, Button, Modal, Radio } from 'antd';
import type { SalesReport } from '../../../../shared/sales-report';
import { downloadReport, exportSalesReport } from '../report-export';
export function ReportExport({ report, onClose }: {
    report: SalesReport | null;
    onClose: () => void;
}) {
    const [format, setFormat] = useState<'pdf' | 'docx'>('pdf'), [busy, setBusy] = useState(false), [error, setError] = useState('');
    async function download() { if (!report || busy)
        return; setBusy(true); setError(''); try {
        const blob = await exportSalesReport(report, format);
        downloadReport(blob, `${report.filename}.${format}`);
        onClose();
    }
    catch {
        setError('The report could not be generated. Please retry; no file was reported as complete.');
    }
    finally {
        setBusy(false);
    } }
    return <Modal title="Export report" open={!!report} onCancel={() => { if (!busy) {
        setError('');
        onClose();
    } }} footer={<><Button disabled={busy} onClick={onClose}>Cancel</Button><Button type="primary" loading={busy} onClick={download}>Download report</Button></>}><h3>{report?.title}</h3><p>Choose a format for this {report?.subtitle.toLowerCase()}.</p><Radio.Group aria-label="Report format" value={format} onChange={e => setFormat(e.target.value)}><Radio value="pdf">PDF</Radio><Radio value="docx">Word</Radio></Radio.Group>{error && <Alert type="error" message={error}/>}</Modal>;
}
