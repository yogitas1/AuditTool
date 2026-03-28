import { AuditFinding } from '../types';

// ── Formatting helpers ────────────────────────────────────────────────────────

export function formatDollar(value: number | undefined, forceSign = false): string {
  if (value === undefined || value === null) return '';
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
  if (forceSign) return value < 0 ? `-${formatted}` : `+${formatted}`;
  return value < 0 ? `-${formatted}` : formatted;
}

export function formatPercent(rate: number | undefined): string {
  if (rate === undefined) return '';
  return `${(rate * 100).toFixed(1)}%`;
}

// ── Per-finding dollar exposure ───────────────────────────────────────────────
// Only counts direct, concrete dollar figures. Wrong-period and
// contractor-misclassification are flagged as risk with $0 direct impact.

export function getFinancialImpact(f: AuditFinding): number {
  switch (f.type) {
    case 'amount_mismatch':
      return Math.abs(f.discrepancy ?? 0);
    case 'no_source_invoice':
      return f.qb_amount ?? 0;
    case 'count_shortage':
    case 'count_overage':
      return f.dollar_impact ?? 0;
    case 'po_receipt_mismatch':
      return f.dollar_shortfall ?? 0;
    case 'terminated_employee_paid':
      return f.gross_pay ?? 0;
    case 'incorrect_ca_sdi_rate':
      return f.underpayment ?? 0;
    case 'payroll_gl_discrepancy':
      return Math.abs(f.discrepancy ?? 0);
    default:
      return 0;
  }
}

export function getTotalImpact(findings: AuditFinding[]): number {
  return findings.reduce((sum, f) => sum + getFinancialImpact(f), 0);
}

// ── Compact one-line description for the panel rows ──────────────────────────

export function getCompactDescription(f: AuditFinding): string {
  switch (f.type) {
    case 'amount_mismatch':
      return `${f.txn_id} · ${f.customer} · ${formatDollar(f.discrepancy)} discrepancy`;
    case 'no_source_invoice':
      return `${f.txn_id} · ${f.customer} · ${formatDollar(f.qb_amount)} unverified`;
    case 'wrong_period':
      return `${f.txn_id} · ${f.customer} · booked ${f.date_booked} (${f.transaction_date} sale)`;
    case 'unmatched_transaction':
      return `${f.txn_id} · ${f.customer} · no matching invoice`;
    case 'count_shortage':
      return `${f.sku} · ${Math.abs(f.variance ?? 0)} unit shortage · ${formatDollar(f.dollar_impact)}`;
    case 'count_overage':
      return `${f.sku} · ${f.variance} unit overage · ${formatDollar(f.dollar_impact)}`;
    case 'po_receipt_mismatch':
      return `${f.po_id} · ${f.supplier} · ${f.qty_variance} units short · ${formatDollar(f.dollar_shortfall)}`;
    case 'terminated_employee_paid':
      return `${f.employee_name} · terminated ${f.termination_date} · ${formatDollar(f.gross_pay)}`;
    case 'contractor_misclassification':
      return `${f.employee_name} · ${f.hours_per_week} hrs/week + company equipment`;
    case 'incorrect_ca_sdi_rate':
      return `${f.employee_name} · ${formatPercent(f.actual_rate)} withheld vs ${formatPercent(f.correct_rate)} correct`;
    case 'payroll_gl_discrepancy':
      return `Payroll ${formatDollar(f.payroll_total)} vs GL ${formatDollar(f.gl_payroll_entry)}`;
    default:
      return f.explanation.slice(0, 90);
  }
}

// ── Contextual chat message for clicking a finding row ────────────────────────

export function getClickMessage(f: AuditFinding): string {
  switch (f.type) {
    case 'amount_mismatch':
      return `Tell me more about the revenue discrepancy in ${f.txn_id} for ${f.customer}`;
    case 'no_source_invoice':
      return `Tell me more about the unmatched transaction ${f.txn_id} from ${f.customer} — it has no supporting invoice`;
    case 'wrong_period':
      return `Tell me more about the wrong-period booking for ${f.txn_id} (${f.customer}) — the sale was on ${f.transaction_date} but booked on ${f.date_booked}`;
    case 'unmatched_transaction':
      return `Tell me more about the unmatched ${f.channel} transaction ${f.txn_id} for ${f.customer}`;
    case 'count_shortage':
      return `Tell me more about the inventory shortage for ${f.sku} (${f.name}) — system shows ${f.system_count} but expected ${f.expected_count}`;
    case 'count_overage':
      return `Tell me more about the inventory overage for ${f.sku} (${f.name})`;
    case 'po_receipt_mismatch':
      return `Tell me more about the purchase order receipt discrepancy for ${f.po_id} from ${f.supplier} — ordered ${f.ordered_qty} but only received ${f.received_qty}`;
    case 'terminated_employee_paid':
      return `Tell me more about ${f.employee_name} being paid after termination on ${f.termination_date}`;
    case 'contractor_misclassification':
      return `Tell me more about ${f.employee_name}'s contractor misclassification risk`;
    case 'incorrect_ca_sdi_rate':
      return `Tell me more about ${f.employee_name}'s incorrect CA SDI withholding — currently at ${formatPercent(f.actual_rate)} instead of ${formatPercent(f.correct_rate)}`;
    case 'payroll_gl_discrepancy':
      return `Tell me more about the payroll GL discrepancy — the payroll system shows ${formatDollar(f.payroll_total)} but the GL entry is ${formatDollar(f.gl_payroll_entry)}`;
    default:
      return `Tell me more about this ${f._audit} finding: ${f.explanation.slice(0, 120)}`;
  }
}
