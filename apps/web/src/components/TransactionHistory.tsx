import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { LinkedTransaction } from '../../../../shared/pricing';
import {
  filterTransactionHistory,
  groupTransactionHistory,
  historyDatePosition,
  uniqueHistoryRecords,
} from '../../../../shared/transaction-history';
import './TransactionHistory.css';

interface TransactionHistoryProps {
  records: LinkedTransaction[];
  onSelectRecord: (transactionId: string) => void;
}

const amountFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const compactFormatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const plot = { width: 720, height: 300, left: 88, right: 30, top: 34, bottom: 236 };

const salePrice = ({ transaction }: LinkedTransaction) => `${transaction.currency} ${amountFormatter.format(transaction.amount!)}`;
const saleDescription = (record: LinkedTransaction) =>
  `Transaction ${record.transaction.transaction_id}: ${record.transaction.transaction_date}, ${salePrice(record)}, source ${record.transaction.source_ref}`;

export function TransactionHistory({ records, onSelectRecord }: TransactionHistoryProps) {
  const id = useId();
  const unique = useMemo(() => uniqueHistoryRecords(records), [records]);
  const series = useMemo(() => groupTransactionHistory(unique), [unique]);
  const [seriesKey, setSeriesKey] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const firstSelectedAction = useRef<HTMLButtonElement>(null);
  const focusSelectionRequested = useRef(false);
  const selectedSeries = series.find((group) => group.key === seriesKey) ?? series[0];
  const scoped = filterTransactionHistory(selectedSeries?.records ?? [], { from, to });
  const visible = scoped.records;
  const activeRecords = visible.filter(({ transaction }) => activeIds.includes(transaction.transaction_id));

  useEffect(() => {
    if (focusSelectionRequested.current && firstSelectedAction.current) {
      focusSelectionRequested.current = false;
      firstSelectedAction.current.focus();
    }
  }, [activeIds]);

  // Exact same-day/same-amount records share a counted marker at their true coordinate.
  // Its details expose every source and every record action without falsifying date/price positions.
  const pointGroups = new Map<string, LinkedTransaction[]>();
  for (const record of visible) {
    const key = `${record.transaction.transaction_date}:${record.transaction.amount}`;
    pointGroups.set(key, [...(pointGroups.get(key) ?? []), record]);
  }
  const points = [...pointGroups.values()];
  const firstDate = visible[0]?.transaction.transaction_date;
  const lastDate = visible.at(-1)?.transaction.transaction_date;
  const maxAmount = Math.max(1, ...visible.map(({ transaction }) => transaction.amount!));
  const yMaximum = maxAmount * 1.15;
  const x = (record: LinkedTransaction) => plot.left + historyDatePosition(record.transaction.transaction_date!, firstDate!, lastDate!) * (plot.width - plot.left - plot.right);
  const y = (record: LinkedTransaction) => plot.bottom - record.transaction.amount! / yMaximum * (plot.bottom - plot.top);
  const line = visible.map((record) => `${x(record)},${y(record)}`).join(' ');
  const dateTicks = firstDate && lastDate
    ? firstDate === lastDate ? [firstDate] : [firstDate, lastDate]
    : [];

  function resetRange() {
    setFrom('');
    setTo('');
    setActiveIds([]);
  }

  function selectRecord(record: LinkedTransaction) {
    setActiveIds([record.transaction.transaction_id]);
    onSelectRecord(record.transaction.transaction_id);
  }

  return (
    <div className="transaction-history" aria-label="Same-property transaction history">
      <div className="th-summary">
        <strong>Sales recorded: {unique.length}</strong>
        <p>This is the recorded sample, not a complete history of this property's sales.</p>
      </div>
      {!unique.length ? (
        <div className="th-empty" role="status">
          <strong>No available same-property sale history.</strong>
          <p>A reviewed sale record and verified property association are needed to show a transaction here.</p>
        </div>
      ) : (
        <>
          <div className="th-controls">
            <label className="th-series-field" htmlFor={`${id}-series`}>
              <span>Chart series</span>
              <select id={`${id}-series`} value={selectedSeries.key} onChange={(event) => { setSeriesKey(event.target.value); resetRange(); }}>
                {series.map((group) => <option key={group.key} value={group.key}>{group.label}</option>)}
              </select>
            </label>
            <label htmlFor={`${id}-from`}>
              <span>From</span>
              <input id={`${id}-from`} type="date" value={from} aria-invalid={Boolean(scoped.error)} aria-describedby={`${id}-range-note${scoped.error ? ` ${id}-range-error` : ''}`} onChange={(event) => { setFrom(event.target.value); setActiveIds([]); }} />
            </label>
            <label htmlFor={`${id}-to`}>
              <span>To</span>
              <input id={`${id}-to`} type="date" value={to} aria-invalid={Boolean(scoped.error)} aria-describedby={`${id}-range-note${scoped.error ? ` ${id}-range-error` : ''}`} onChange={(event) => { setTo(event.target.value); setActiveIds([]); }} />
            </label>
            <button className="th-reset" type="button" disabled={!from && !to} onClick={resetRange}>Reset range</button>
          </div>
          <p className="th-range-note" id={`${id}-range-note`}>Available dates: {selectedSeries.first_date} — {selectedSeries.last_date}. Empty dates show all records in this series.</p>
          {series.length > 1 && <p className="th-basis-note">Currencies and date bases are shown in separate series; no conversion or date substitution is applied.</p>}
          <p className="th-scope-count" role="status">Showing {visible.length} of {selectedSeries.records.length} sales in this series · {unique.length} unique sales recorded overall.</p>
          {scoped.error ? (
            <div id={`${id}-range-error`} className="th-range-error" role="alert">{scoped.error}</div>
          ) : !visible.length ? (
            <div className="th-empty" role="status"><strong>No recorded sales in this date range.</strong><p>Change From or To, or reset the range to see all available sales.</p></div>
          ) : (
            <>
              <div className="th-chart-scroll" role="region" aria-label="Sale history chart" tabIndex={0}>
                <svg className="th-chart" viewBox={`0 0 ${plot.width} ${plot.height}`} aria-labelledby={`${id}-chart-title ${id}-chart-description`}>
                  <title id={`${id}-chart-title`}>Same-property recorded sale prices · {selectedSeries.label}</title>
                  <desc id={`${id}-chart-description`}>Total prices at their recorded calendar dates, with a zero price baseline. Focus or hover on a marker for source details; activate a marker to view the sale record. A counted marker groups sales with exactly the same date and total price.</desc>
                  <text className="th-axis-title" x={plot.left} y={17}>Total sale price ({selectedSeries.currency})</text>
                  {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
                    const position = plot.bottom - fraction * (plot.bottom - plot.top);
                    return <g key={fraction} aria-hidden="true"><line className="th-grid-line" x1={plot.left} y1={position} x2={plot.width - plot.right} y2={position} /><text className="th-axis-tick" x={plot.left - 12} y={position + 4} textAnchor="end">{compactFormatter.format(yMaximum * fraction)}</text></g>;
                  })}
                  {dateTicks.map((date) => <text className="th-axis-tick" key={date} x={plot.left + historyDatePosition(date, firstDate!, lastDate!) * (plot.width - plot.left - plot.right)} y={plot.bottom + 24} textAnchor="middle">{date}</text>)}
                  <text className="th-axis-title" x={(plot.left + plot.width - plot.right) / 2} y={plot.height - 9} textAnchor="middle">{selectedSeries.date_basis === 'contract' ? 'Contract date' : 'Registration date'}</text>
                  {visible.length > 1 && <polyline className="th-sale-line" points={line} aria-hidden="true" data-testid="transaction-history-line" />}
                  {points.map((pointRecords) => {
                    const first = pointRecords[0];
                    const ids = pointRecords.map(({ transaction }) => transaction.transaction_id);
                    const description = pointRecords.map(saleDescription).join('; ');
                    const activate = () => {
                      // Leave the chart's point-by-point tab order when choosing a grouped sale.
                      // Otherwise focusing the next marker replaces this group's source actions.
                      focusSelectionRequested.current = pointRecords.length > 1;
                      setActiveIds(ids);
                      if (pointRecords.length === 1) onSelectRecord(first.transaction.transaction_id);
                    };
                    return (
                      <g key={ids.join('|')} className={`th-sale-point${ids.some((transactionId) => activeIds.includes(transactionId)) ? ' is-active' : ''}`} role="button" tabIndex={0}
                        aria-label={pointRecords.length === 1 ? description : `${pointRecords.length} transactions at ${first.transaction.transaction_date}, ${salePrice(first)}: ${ids.join(', ')}. Select to choose a record.`}
                        aria-describedby={`${id}-selection`} onMouseEnter={() => setActiveIds(ids)} onFocus={() => setActiveIds(ids)} onClick={activate}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); } }}>
                        <title>{description}</title>
                        <circle className="th-point-hit" cx={x(first)} cy={y(first)} r={15} />
                        <circle className="th-point-dot" cx={x(first)} cy={y(first)} r={pointRecords.length > 1 ? 11 : 5} />
                        {pointRecords.length > 1 && <text className="th-point-count" x={x(first)} y={y(first) + 4} textAnchor="middle" aria-hidden="true">{pointRecords.length}</text>}
                      </g>
                    );
                  })}
                </svg>
              </div>
              <p className="th-chart-note">{visible.length > 1
                ? 'Lines connect recorded sales for readability; no prices are inferred between sales.'
                : 'One sale is recorded in this range. A single point does not establish a price trend.'}</p>
              {points.some((point) => point.length > 1) && <p className="th-chart-note">Numbered markers share the exact date and total price. Select the marker, then choose the transaction below.</p>}
              <div id={`${id}-selection`} className="th-selection" aria-live="polite">
                {activeRecords.length ? activeRecords.map((record, index) => (
                  <div key={record.transaction.transaction_id} className="th-selected-record">
                    <strong>{record.transaction.transaction_date} · {salePrice(record)}</strong>
                    <span>{record.transaction.transaction_id} · {record.transaction.source_name || 'Source name not supplied'}</span>
                    <span className="th-source-ref">Source: {record.transaction.source_ref}</span>
                    <button ref={index === 0 ? firstSelectedAction : undefined} type="button" className="th-record-action" onClick={() => selectRecord(record)}>View selected transaction {record.transaction.transaction_id}</button>
                  </div>
                )) : <p>Hover or focus a sale marker to inspect its date, amount and source. Click a marker or use the timeline to open the full record.</p>}
              </div>
              <div className="th-timeline-heading"><h4>Recorded sale timeline</h4><span>{selectedSeries.label}</span></div>
              <ol className="th-timeline" aria-label="Recorded transaction timeline">
                {visible.map((record) => (
                  <li key={record.transaction.transaction_id}>
                    <div className="th-timeline-date"><time dateTime={record.transaction.transaction_date!}>{record.transaction.transaction_date}</time><span>{record.transaction.data_kind === 'demo' ? 'Demo data' : record.transaction.data_kind === 'real_public' ? 'Public source data' : 'Authorized data'}</span></div>
                    <div className="th-timeline-record"><strong>{salePrice(record)}</strong><span>{record.transaction.source_name || 'Source name not supplied'}</span><span className="th-source-ref">Source: {record.transaction.source_ref}</span><button type="button" className="th-record-action" onClick={() => selectRecord(record)}>View transaction {record.transaction.transaction_id}</button></div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </div>
  );
}
