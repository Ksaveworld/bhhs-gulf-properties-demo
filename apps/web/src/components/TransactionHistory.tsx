import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LinkedTransaction } from '../../../../shared/pricing';
import { groupTransactionHistory, historyDatePosition, uniqueHistoryRecords } from '../../../../shared/transaction-history';
import './TransactionHistory.css';

interface TransactionHistoryProps {
  records: LinkedTransaction[];
  onSelectRecord?: (transactionId: string) => void;
  renderRecord?: (record: LinkedTransaction) => ReactNode;
}
const amountFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const compactFormatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const plot = { width: 720, height: 300, left: 88, right: 30, top: 34, bottom: 236 };
const salePrice = ({ transaction }: LinkedTransaction) => transaction.currency + ' ' + amountFormatter.format(transaction.amount!);
const saleDescription = (record: LinkedTransaction) => 'Transaction ' + record.transaction.transaction_id + ': ' + record.transaction.transaction_date + ', ' + salePrice(record) + ', source ' + record.transaction.source_name;

export function TransactionHistory({ records, onSelectRecord, renderRecord }: TransactionHistoryProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const unique = useMemo(() => uniqueHistoryRecords(records), [records]);
  const series = useMemo(() => groupTransactionHistory(unique), [unique]);
  const [seriesKey, setSeriesKey] = useState('');
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const selectedSeries = series.find(group => group.key === seriesKey) ?? series[0];
  const visible = selectedSeries?.records ?? [];
  const activeRecords = visible.filter(({ transaction }) => activeIds.includes(transaction.transaction_id));
  const grouped = new Map<string, LinkedTransaction[]>();
  for (const record of visible) {
    const key = record.transaction.transaction_date + ':' + record.transaction.amount;
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }
  const points = [...grouped.values()];
  const firstDate = visible[0]?.transaction.transaction_date;
  const lastDate = visible.at(-1)?.transaction.transaction_date;
  const maximum = Math.max(1, ...visible.map(({ transaction }) => transaction.amount!)) * 1.15;
  const x = (record: LinkedTransaction) => plot.left + historyDatePosition(record.transaction.transaction_date!, firstDate!, lastDate!) * (plot.width - plot.left - plot.right);
  const y = (record: LinkedTransaction) => plot.bottom - record.transaction.amount! / maximum * (plot.bottom - plot.top);
  const dateTicks = firstDate && lastDate ? firstDate === lastDate ? [firstDate] : [firstDate, lastDate] : [];

  function expandRecords(ids: string[]) {
    setActiveIds(ids);
    setExpandedIds(previous => [...new Set([...previous, ...ids])]);
    requestAnimationFrame(() => {
      const node = Array.from(root.current?.querySelectorAll<HTMLDetailsElement>('details[data-transaction-id]') ?? []).find(element => element.dataset.transactionId === ids[0]);
      node?.querySelector('summary')?.focus({ preventScroll: true });
      node?.scrollIntoView({ block: 'nearest' });
    });
    if (ids.length === 1) onSelectRecord?.(ids[0]);
  }

  return <div className="transaction-history" aria-label="Same-property transaction history" ref={root}>
    <div className="th-summary"><strong>Sales recorded: {unique.length}</strong><p>Available records only; this may not be the full sale history.</p></div>
    {!unique.length ? <div className="th-empty" role="status"><strong>No available same-property sale history.</strong><p>No eligible sale records are available for this property.</p></div> : <>
      {series.length > 1 && <div className="th-series-control"><label htmlFor={id + '-series'}>Price series</label><select id={id + '-series'} value={selectedSeries.key} onChange={event => { setSeriesKey(event.target.value); setActiveIds([]); }}>{series.map(group => <option key={group.key} value={group.key}>{group.label}</option>)}</select><span>Currencies and contract / registration dates stay separate.</span></div>}
      <div className="th-chart-scroll" role="region" aria-label="Sale history chart" tabIndex={0}>
        <svg className="th-chart" viewBox={'0 0 ' + plot.width + ' ' + plot.height} aria-labelledby={id + '-chart-title ' + id + '-chart-description'}>
          <title id={id + '-chart-title'}>Same-property recorded sale prices · {selectedSeries.label}</title>
          <desc id={id + '-chart-description'}>Recorded total prices at their calendar dates with a zero price baseline. Activate a point to expand its sale timeline entry. Counted markers contain records with the same date and price.</desc>
          <text className="th-axis-title" x={plot.left} y={17}>Total sale price ({selectedSeries.currency})</text>
          {[0, .25, .5, .75, 1].map(fraction => { const position = plot.bottom - fraction * (plot.bottom - plot.top); return <g key={fraction} aria-hidden="true"><line className="th-grid-line" x1={plot.left} y1={position} x2={plot.width - plot.right} y2={position} /><text className="th-axis-tick" x={plot.left - 12} y={position + 4} textAnchor="end">{compactFormatter.format(maximum * fraction)}</text></g>; })}
          {dateTicks.map(date => <text className="th-axis-tick" key={date} x={plot.left + historyDatePosition(date, firstDate!, lastDate!) * (plot.width - plot.left - plot.right)} y={plot.bottom + 24} textAnchor="middle">{date}</text>)}
          <text className="th-axis-title" x={(plot.left + plot.width - plot.right) / 2} y={plot.height - 9} textAnchor="middle">{selectedSeries.date_basis === 'contract' ? 'Contract date' : 'Registration date'}</text>
          {visible.length > 1 && <polyline className="th-sale-line" points={visible.map(record => x(record) + ',' + y(record)).join(' ')} aria-hidden="true" data-testid="transaction-history-line" />}
          {points.map(pointRecords => {
            const first = pointRecords[0]; const ids = pointRecords.map(({ transaction }) => transaction.transaction_id);
            const description = pointRecords.map(saleDescription).join('; ');
            return <g key={ids.join('|')} className={'th-sale-point' + (ids.some(value => activeIds.includes(value)) ? ' is-active' : '')} role="button" tabIndex={0} aria-label={description} aria-describedby={id + '-selection'} onMouseEnter={() => setActiveIds(ids)} onFocus={() => setActiveIds(ids)} onClick={() => expandRecords(ids)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); expandRecords(ids); } }}>
              <title>{description}</title><circle className="th-point-hit" cx={x(first)} cy={y(first)} r={15} /><circle className="th-point-dot" cx={x(first)} cy={y(first)} r={pointRecords.length > 1 ? 11 : 5} />{pointRecords.length > 1 && <text className="th-point-count" x={x(first)} y={y(first) + 4} textAnchor="middle" aria-hidden="true">{pointRecords.length}</text>}
            </g>;
          })}
        </svg>
      </div>
      <p className="th-chart-note">{visible.length > 1 ? 'Lines connect recorded sales; intervening prices are unknown.' : 'One recorded sale does not establish a price trend.'}</p>
      <div id={id + '-selection'} className="th-selection th-selection-compact" aria-live="polite">{activeRecords.length ? activeRecords.map(record => <span key={record.transaction.transaction_id}>{record.transaction.transaction_date} · {salePrice(record)}</span>) : 'Select a point or a timeline entry for sale details.'}</div>
      <div className="th-timeline-heading"><h4>Recorded sale timeline</h4><span>{selectedSeries.label}</span></div>
      <ol className="th-timeline" aria-label="Recorded transaction timeline">{visible.map(record => {
        const transactionId = record.transaction.transaction_id;
        return <li key={transactionId} className="th-timeline-node"><details data-transaction-id={transactionId} open={expandedIds.includes(transactionId)} onToggle={event => { const open = event.currentTarget.open; setExpandedIds(previous => open ? previous.includes(transactionId) ? previous : [...previous, transactionId] : previous.filter(value => value !== transactionId)); }}>
          <summary aria-label={'Sale ' + transactionId}><time dateTime={record.transaction.transaction_date!}>{record.transaction.transaction_date}</time><strong>{salePrice(record)}</strong><span>Sale · {record.transaction.date_basis === 'contract' ? 'Contract date' : 'Registration date'}</span></summary>
          <div className="th-node-detail">{renderRecord ? renderRecord(record) : <p>{record.transaction.evidence_excerpt || record.transaction.source_ref}</p>}</div>
        </details></li>;
      })}</ol>
    </>}
  </div>;
}
