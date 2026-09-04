import type { ClientRequirement, Dataset, ListingSnapshot } from './types';
import type { LocalRequirementCopy } from './local-requirements';
import type { ViewingRecord } from './viewing-records';
import { buildClientGroups } from './client-priorities';
import { evaluateMatch } from './matching';
import { getPriceEvidence } from './pricing';
import { groupTransactionHistory, uniqueHistoryRecords } from './transaction-history';
import { clientRequirementHistory } from './client-requirement-history';
import { propertyAreaSqft, propertyDisplayName } from './property-presentation';
import { requirementAreaWarnings } from './requirement-area';
import { requirementTextReview } from './matching';
export type ReportChart = {
    label: string;
    points: {
        date: string;
        value: number;
    }[];
};
export type ReportSection = {
    heading: string;
    lines: string[];
    charts?: ReportChart[];
};
export type SalesReport = {
    title: string;
    subtitle: string;
    disclosure: string;
    sections: ReportSection[];
    filename: string;
};
const display = (v: unknown) => v == null || v === '' ? 'Not supplied' : Array.isArray(v) ? v.join(', ') || 'Not supplied' : String(v).replaceAll('_', ' ');
const amount = (v: number | null, currency: string | null) => v == null ? 'Not supplied' : `${currency || 'Currency unknown'} ${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const clean = (v: string) => v.replace(/\s*\(面积口径待确认\)/g, '');
const notice = (demo: boolean) => demo ? 'DEMONSTRATION ONLY — Fictional sample properties, prices and clients. Not a valuation or confirmed recommendation.' : 'Recorded sources and sales notes. Missing conditions still require confirmation.';
const filename = (prefix: string, value: string) => `${prefix}-${value.replace(/[^\p{L}\p{N}_-]/gu, '-').slice(0, 75)}`;
export function requirementReportLines(req: ClientRequirement): string[] {
    return [
        `Preferred location: ${display(req.preferred_areas)}`, `Budget range: ${amount(req.budget_min, req.currency)} to ${amount(req.budget_max, req.currency)}`,
        `Property type: ${display(req.property_types)}`, `Bedrooms (minimum): ${display(req.bedrooms_min)}`,
        `Size range: ${display(req.area_min)} to ${display(req.area_max)} ${req.area_unit || 'unit unconfirmed'}`,
        `Completion status: ${display(req.market_preference)}`, `Purchase purpose: ${display(req.purchase_purpose)}`,
        `Purchase by: ${display(req.purchase_by)}`, `Available / move-in by: ${display(req.move_in_by)}`,
        `Required conditions: ${display(req.hard_constraints)}`, `Preferences / notes: ${display(req.soft_preferences)}`,
        ...[...new Set([...requirementAreaWarnings(req), ...requirementTextReview(req).warnings, ...(req.missing_questions ? [req.missing_questions] : [])])].map(v => `To clarify: ${clean(v)}`),
    ];
}
export function propertySalesReport(listing: ListingSnapshot, dataset: Dataset, requirements: ClientRequirement[], viewingRecords: ViewingRecord[] = []): SalesReport {
    const evidence = getPriceEvidence(listing, dataset);
    const history = uniqueHistoryRecords(evidence.history);
    const comparables = [...new Map(evidence.comparables.map(row => [row.transaction.transaction_id, row])).values()];
    const groups = buildClientGroups(listing, requirements).filter(g => g.status !== 'excluded');
    const size = propertyAreaSqft(listing);
    const sections: ReportSection[] = [
        { heading: 'Property overview', lines: [`Location: ${listing.area_name}`, `Property type: ${display(listing.property_type)}`, `Bedrooms: ${display(listing.bedrooms)}`, `Size: ${size == null ? 'Not supplied' : `${size.toLocaleString('en-US', { maximumFractionDigits: 2 })} sq ft`}`, `Asking price: ${amount(listing.asking_price, listing.currency)}`, `Completion status: ${display(listing.market_segment)}`, `Listing status: ${display(listing.listing_status)}`, `Updated: ${listing.captured_at}`, `Source date: ${display(listing.source_date)}`, `Source: ${listing.source_ref}`, `Original evidence: ${display(listing.evidence_excerpt)}`] },
        { heading: 'Property Transaction History', charts: groupTransactionHistory(history).map(series => ({ label: series.label, points: series.records.map(({ transaction: t }) => ({ date: t.transaction_date!, value: t.amount! })) })), lines: history.length ? history.map(({ transaction: t }) => `${t.transaction_date} · ${display(t.date_basis)} date · ${display(t.record_type)} · ${amount(t.amount, t.currency)}\n${t.evidence_excerpt || ''}\nSource: ${t.source_ref}`) : ['No eligible same-property transaction history.'] },
        { heading: 'Comparable Property Transactions', lines: comparables.length ? comparables.map(({ transaction: t, link }) => `${t.transaction_date} · ${display(t.date_basis)} date · ${amount(t.amount, t.currency)} · ${display(t.building_name)}\nComparison: ${link.match_basis}\nDifferences: ${display(link.differences)}\nSource: ${t.source_ref}`) : ['No eligible comparable transactions.'] },
    ];
    for (const status of ['match', 'review'] as const) {
        const selected = groups.filter(g => g.status === status);
        sections.push({ heading: status === 'match' ? 'Condition Met' : 'Needs Clarification', lines: selected.length ? selected.map(g => {
                const assessment = g.primary;
                const req = assessment.requirement, m = assessment.result;
                return `${req.client_alias}\n${display(req.preferred_areas)} · ${amount(req.budget_max, req.currency)} · Purchase by: ${display(req.purchase_by)}\nMeets: ${m.matched.map(clean).join('; ') || 'None confirmed'}\nTo discuss: ${[...m.conflicts, ...m.unknowns].map(clean).join('; ') || 'None recorded'}\nViewing: ${viewingRecords.some(v => v.client_id === req.client_id && v.listing_id === listing.listing_id) ? 'Viewed' : 'No recorded viewing'}\nSource: ${req.source_ref}\nNext action: ${m.next_action}`;
            }) : ['No clients in this group.'] });
    }
    return { title: propertyDisplayName(listing), subtitle: 'Property sales brief', disclosure: notice(listing.data_kind === 'demo' || requirements.some(r => r.data_kind === 'demo')), sections, filename: filename('Property', listing.listing_id) };
}
export function clientSalesReport(clientId: string, requirements: ClientRequirement[], originals: ClientRequirement[], copies: LocalRequirementCopy[], listings: ListingSnapshot[], viewings: ViewingRecord[], ownership: string, selectedRequirementId?: string, viewingListings: ListingSnapshot[] = listings): SalesReport {
    const plans = requirements.filter(req => req.client_id === clientId && (!selectedRequirementId || req.requirement_id === selectedRequirementId));
    if (!plans.length)
        throw new Error('This client is not available in the current sales view.');
    const sections: ReportSection[] = [{ heading: 'Client details', lines: [`Client: ${plans[0].client_alias}`, `Client ID: ${clientId}`, `Ownership: ${ownership}`] }];
    plans.forEach((req, i) => {
        sections.push({ heading: plans.length === 1 ? 'Current requirements' : `Current requirements · Independent plan ${i + 1}`, lines: requirementReportLines(req) });
        const history = clientRequirementHistory(req, originals, copies);
        sections.push({ heading: 'Requirement changes', lines: history.filter(e => e.kind === 'revision').map(e => `${e.recorded_at}${e.is_current ? ' · Current version' : ''}\n${e.changes.map(c => `${c.label} (${c.kind}): ${c.before} → ${c.after}`).join('\n') || 'No condition changes.'}`) });
    });
    const matches = listings.map(listing => ({ listing, assessments: plans.map(req => evaluateMatch(listing, req)) })).map(row => ({ ...row, match: row.assessments.find(m => m.status === 'match') || row.assessments.find(m => m.status === 'review') }));
    for (const status of ['match', 'review'] as const)
        sections.push({ heading: status === 'match' ? 'Best Matches' : 'Worth Considering', lines: matches.filter(row => row.match?.status === status).map(({ listing, match }) => `${propertyDisplayName(listing)} · ${amount(listing.asking_price, listing.currency)}\nMeets: ${match!.matched.map(clean).join('; ')}\nTo clarify: ${[...match!.conflicts, ...match!.unknowns].map(clean).join('; ') || 'None recorded'}\nNext action: ${match!.next_action}`) });
    sections.push({ heading: 'Viewing History', lines: viewings.filter(v => v.client_id === clientId).map(v => {
        const viewed = viewingListings.find(l => l.listing_id === v.listing_id);
        return `${v.viewed_at} · ${viewed ? propertyDisplayName(viewed) : 'Property no longer available in this dataset'}\nFeedback: ${display(v.feedback_signal)} · ${v.feedback || 'No comments'}\nStated preferences: ${v.preference_tags.map(t => t.value).join(', ') || 'None recorded'}${v.source_kind === 'fictional_example' ? '\nFictional viewing example.' : ''}`;
    }) });
    return { title: plans[0].client_alias, subtitle: 'Client sales brief', disclosure: notice(plans.some(r => r.data_kind === 'demo') || listings.some(l => l.data_kind === 'demo')), sections, filename: filename('Client', clientId) };
}
