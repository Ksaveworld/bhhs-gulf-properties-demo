import type { ReportChart, SalesReport } from '../../../shared/sales-report';
const W = 1240, H = 1754, M = 88;
const font = '"Segoe UI", "Microsoft YaHei", sans-serif';
function context(canvas: HTMLCanvasElement) { const ctx = canvas.getContext('2d'); if (!ctx)
    throw new Error('The browser could not render the report.'); return ctx; }
function wrapped(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
    return text.split('\n').flatMap(paragraph => {
        const lines: string[] = [];
        let line = '';
        for (const word of paragraph.match(/\S+\s*|\s+/g) ?? []) {
            if (ctx.measureText(line + word).width <= width) {
                line += word;
                continue;
            }
            if (line) {
                lines.push(line.trimEnd());
                line = '';
            }
            if (ctx.measureText(word).width <= width) {
                line = word;
                continue;
            }
            for (const char of Array.from(word)) {
                if (ctx.measureText(line + char).width > width && line) {
                    lines.push(line);
                    line = char;
                }
                else
                    line += char;
            }
        }
        lines.push(line);
        return lines;
    });
}
export function chartCanvas(chart: ReportChart): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 1064;
    canvas.height = 340;
    const ctx = context(canvas);
    ctx.fillStyle = '#f7f6f8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#55223f';
    ctx.font = `bold 22px ${font}`;
    ctx.fillText(chart.label, 24, 35);
    if (!chart.points.length)
        return canvas;
    const pts = chart.points;
    const first = Date.parse(pts[0].date), last = Date.parse(pts.at(-1)!.date);
    const min = Math.min(...pts.map(p => p.value)), max = Math.max(...pts.map(p => p.value));
    const low = min === max ? min * 0.95 : min, high = min === max ? max * 1.05 : max;
    const x = (date: string) => 125 + (last === first ? 0.5 : (Date.parse(date) - first) / (last - first)) * 875;
    const y = (v: number) => 260 - (v - low) / (high - low || 1) * 178;
    ctx.font = `18px ${font}`;
    ctx.strokeStyle = '#dedbe0';
    ctx.fillStyle = '#4a4650';
    for (let i = 0; i < 3; i++) {
        const value = low + (high - low) * i / 2, py = y(value);
        ctx.beginPath();
        ctx.moveTo(120, py);
        ctx.lineTo(1020, py);
        ctx.stroke();
        ctx.fillText(value.toLocaleString('en-US', { maximumFractionDigits: 0 }), 10, py + 5);
    }
    ctx.strokeStyle = '#55223f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    pts.forEach((p, i) => { if (i)
        ctx.lineTo(x(p.date), y(p.value));
    else
        ctx.moveTo(x(p.date), y(p.value)); });
    ctx.stroke();
    for (const p of pts) {
        ctx.fillStyle = '#55223f';
        ctx.beginPath();
        ctx.arc(x(p.date), y(p.value), 5, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = '#4a4650';
    ctx.fillText(pts[0].date, 125, 302);
    ctx.textAlign = 'right';
    ctx.fillText(pts.at(-1)!.date, 1010, 302);
    if (pts.length === 1) {
        ctx.textAlign = 'center';
        ctx.fillText('One recorded transaction; no trend inferred.', 565, 330);
    }
    return canvas;
}
/** Browser fonts preserve names and source excerpts in both English and Chinese. */
export function renderReportPages(report: SalesReport): HTMLCanvasElement[] {
    const pages: HTMLCanvasElement[] = [];
    let canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, y = 0;
    function page() { canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; ctx = context(canvas); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#55223f'; ctx.fillRect(M, 55, 44, 5); ctx.font = `bold 17px ${font}`; ctx.fillText('BHHS  |  GULF PROPERTIES', M, 92); ctx.fillStyle = '#77727c'; ctx.font = `15px ${font}`; ctx.fillText(report.subtitle, M, H - 48); ctx.textAlign = 'right'; ctx.fillText(String(pages.length + 1), W - M, H - 48); ctx.textAlign = 'left'; pages.push(canvas); y = 140; }
    function text(value: string, size = 23, bold = false, color = '#302b34') {
        ctx.font = `${bold ? 'bold ' : ''}${size}px ${font}`;
        const lines = wrapped(ctx, value, W - M * 2);
        const height = lines.length * size * 1.45 + 8;
        if (height < H - 280 && y + height > H - 100) {
            page();
            ctx.font = `${bold ? 'bold ' : ''}${size}px ${font}`;
        }
        for (const line of lines) {
            if (y + size * 1.5 > H - 100) {
                page();
                ctx.font = `${bold ? 'bold ' : ''}${size}px ${font}`;
            }
            ctx.fillStyle = color;
            ctx.fillText(line, M, y);
            y += size * 1.45;
        }
        y += 8;
    }
    page();
    text(report.title, 39, true);
    text(report.subtitle, 23, false, '#716a76');
    text(report.disclosure, 18, false, '#795430');
    y += 14;
    for (const section of report.sections) {
        if (y + 110 > H - 100)
            page();
        text(section.heading, 27, true, '#55223f');
        for (const chart of section.charts ?? []) {
            if (y + 355 > H - 100)
                page();
            ctx!.drawImage(chartCanvas(chart), M, y, W - 2 * M, 340);
            y += 363;
        }
        for (const line of section.lines.length ? section.lines : ['No records supplied.'])
            text(line);
        y += 15;
    }
    return pages;
}
export async function exportSalesReport(report: SalesReport, format: 'pdf' | 'docx'): Promise<Blob> {
    if (format === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
        const pages = renderReportPages(report);
        pages.forEach((page, i) => { if (i)
            pdf.addPage(); pdf.addImage(page.toDataURL('image/png'), 'PNG', 0, 0, 595.28, 841.89, undefined, 'FAST'); });
        pdf.setProperties({ title: report.title, subject: report.subtitle, author: 'BHHS Sales Workspace' });
        return pdf.output('blob');
    }
    const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, Footer, AlignmentType, PageNumber } = await import('docx');
    const paragraph = (text: string, heading?: typeof HeadingLevel[keyof typeof HeadingLevel]) => new Paragraph({ heading, spacing: { after: 130 }, children: text.split('\n').flatMap((line, i) => [new TextRun({ text: line, break: i ? 1 : 0 })]) });
    const children = [paragraph(report.title, HeadingLevel.TITLE), paragraph(report.subtitle), paragraph(report.disclosure)];
    for (const section of report.sections) {
        children.push(paragraph(section.heading, HeadingLevel.HEADING_1));
        for (const chart of section.charts ?? []) {
            const data = Uint8Array.from(atob(chartCanvas(chart).toDataURL('image/png').split(',')[1]), c => c.charCodeAt(0));
            children.push(new Paragraph({ children: [new ImageRun({ type: 'png', data, transformation: { width: 600, height: 192 } })] }));
        }
        for (const line of section.lines.length ? section.lines : ['No records supplied.'])
            children.push(paragraph(line));
    }
    const doc = new Document({ creator: 'BHHS Sales Workspace', title: report.title, styles: { default: { document: { run: { font: 'Calibri', size: 22 }, paragraph: { spacing: { line: 280 } } } }, paragraphStyles: [{ id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { color: '55223F', size: 28, bold: true }, paragraph: { spacing: { before: 220, after: 140 }, keepNext: true } }] }, sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 900, bottom: 900, left: 900, right: 900 } } }, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'BHHS Gulf Properties  ·  ' }), new TextRun({ children: [PageNumber.CURRENT] })] })] }) }, children }] });
    return Packer.toBlob(doc);
}
export function downloadReport(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
