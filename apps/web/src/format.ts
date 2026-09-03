export const display = (value: unknown) => value === null || value === undefined || value === '' ? 'Not disclosed' : String(value).replaceAll('_', ' ');
export const money = (value: number | null, currency: string | null) => value === null ? 'Price not disclosed' : `${currency ?? 'Currency unknown'} ${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
export const date = (value: string | null) => value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Not disclosed';
