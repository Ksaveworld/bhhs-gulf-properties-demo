import { validDate } from './matching';
import type { LinkedTransaction } from './pricing';
import type { Currency, Transaction } from './types';

type HistoryCurrency = Exclude<Currency, 'other'>;
type HistoryDateBasis = Exclude<Transaction['date_basis'], 'unknown'>;

export interface TransactionHistorySeries {
  key: string;
  currency: HistoryCurrency;
  date_basis: HistoryDateBasis;
  label: string;
  records: LinkedTransaction[];
  first_date: string;
  last_date: string;
}

export interface HistoryDateRange { from?: string; to?: string }

const dateBasisLabels: Record<HistoryDateBasis, string> = {
  contract: 'Contract date',
  registration: 'Registration date',
};

/** Input must come from getPriceEvidence().history; these guards do not replace its source/identity review. */
export function uniqueHistoryRecords(records: LinkedTransaction[]): LinkedTransaction[] {
  const unique = new Map<string, LinkedTransaction>();
  for (const record of records) {
    const { transaction, link } = record;
    if (link.relation_type !== 'exact_property' || link.pricing_eligible !== 'yes' ||
      !transaction.transaction_id || link.transaction_id !== transaction.transaction_id ||
      transaction.record_type !== 'sale' || transaction.transaction_scope !== 'whole_unit' ||
      !validDate(transaction.transaction_date) || transaction.date_basis === 'unknown' ||
      !transaction.currency || transaction.currency === 'other' ||
      transaction.amount === null || !Number.isFinite(transaction.amount) || transaction.amount <= 0) continue;
    // Multiple reviewed associations to a transaction remain one recorded sale.
    if (!unique.has(transaction.transaction_id)) unique.set(transaction.transaction_id, record);
  }
  return [...unique.values()].sort((a, b) =>
    a.transaction.transaction_date!.localeCompare(b.transaction.transaction_date!) ||
    a.transaction.transaction_id.localeCompare(b.transaction.transaction_id));
}

/** A line never connects different currencies or contract/registration date bases. */
export function groupTransactionHistory(records: LinkedTransaction[]): TransactionHistorySeries[] {
  const groups = new Map<string, TransactionHistorySeries>();
  for (const record of uniqueHistoryRecords(records)) {
    const currency = record.transaction.currency as HistoryCurrency;
    const date_basis = record.transaction.date_basis as HistoryDateBasis;
    const key = `${currency}:${date_basis}`;
    const group = groups.get(key) ?? {
      key, currency, date_basis, label: `${currency} · ${dateBasisLabels[date_basis]}`,
      records: [], first_date: record.transaction.transaction_date!, last_date: record.transaction.transaction_date!,
    };
    group.records.push(record);
    group.last_date = record.transaction.transaction_date!;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Inclusive calendar dates, with empty bounds meaning the complete recorded range. */
export function filterTransactionHistory(records: LinkedTransaction[], range: HistoryDateRange = {}): {
  records: LinkedTransaction[];
  error: string | null;
} {
  const { from, to } = range;
  if ((from && !validDate(from)) || (to && !validDate(to))) {
    return { records: [], error: 'Enter a valid calendar date for From and To.' };
  }
  if (from && to && from > to) {
    return { records: [], error: 'From must be on or before To.' };
  }
  return {
    records: uniqueHistoryRecords(records).filter(({ transaction }) =>
      (!from || transaction.transaction_date! >= from) && (!to || transaction.transaction_date! <= to)),
    error: null,
  };
}

/** Relative time position, not evenly spaced record order. A single calendar day is centered. */
export function historyDatePosition(date: string, firstDate: string, lastDate: string): number {
  const first = Date.parse(`${firstDate}T00:00:00.000Z`);
  const last = Date.parse(`${lastDate}T00:00:00.000Z`);
  if (first === last) return 0.5;
  return (Date.parse(`${date}T00:00:00.000Z`) - first) / (last - first);
}
