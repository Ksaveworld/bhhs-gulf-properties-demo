import { useId } from 'react';
import { Input } from 'antd';
import { validDate } from '../../../../shared/matching';
import './english-date-input.css';

type DateInputKind = 'date' | 'datetime-local';

/** Validate the entered calendar value without rolling days or converting a timezone. */
export function isValidEnglishDateValue(value: string, kind: DateInputKind = 'date'): boolean {
  if (kind === 'date') return validDate(value);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  return Boolean(match && validDate(match[1]) && Number(match[2]) < 24 && Number(match[3]) < 60);
}

/** Raw text reaches the form validator; invalid input never silently restores an older date. */
export function EnglishDateInput({ label, value, onChange, kind = 'date' }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  kind?: DateInputKind;
}) {
  const hintId = useId();
  const format = kind === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm';
  const invalid = Boolean(value && !isValidEnglishDateValue(value, kind));
  return <div className="english-date-input">
    <Input type="text" aria-label={label} aria-describedby={hintId} aria-invalid={invalid} lang="en" autoComplete="off" spellCheck={false}
      placeholder={format} value={value} allowClear status={invalid ? 'error' : undefined} onChange={event => onChange(event.target.value)} />
    <span id={hintId} className={invalid ? 'english-date-error' : 'english-date-hint'} role={invalid ? 'alert' : undefined}>
      {invalid ? `Enter a valid ${kind === 'date' ? 'date' : 'local date and time'} in ${format} format.` : kind === 'date' ? 'Year-month-day' : 'Local time · 24-hour clock'}
    </span>
  </div>;
}
