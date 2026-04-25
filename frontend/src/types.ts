export interface ApprovalData {
  action: string;
  accounts_affected: string;
  amount: string;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  approval?: ApprovalData;
  approvalStatus?: ApprovalStatus;
  isError?: boolean;
  retryText?: string;  // original user text — present only on error messages
}

// ── Audit findings ───────────────────────────────────────────────────────────

export type AuditSection = 'revenue' | 'inventory' | 'payroll';
export type Severity = 'high' | 'medium' | 'low';

export interface AuditFinding {
  _audit: AuditSection;
  type: string;
  severity: Severity;
  explanation: string;
  // Revenue
  txn_id?: string;
  customer?: string;
  channel?: string;
  qb_amount?: number;
  source_amount?: number;
  discrepancy?: number;
  transaction_date?: string;
  date_booked?: string;
  // Inventory – items
  sku?: string;
  name?: string;
  category?: string;
  system_count?: number;
  expected_count?: number;
  variance?: number;
  unit_cost?: number;
  dollar_impact?: number;
  // Inventory – purchase orders
  po_id?: string;
  supplier?: string;
  ordered_qty?: number;
  received_qty?: number;
  qty_variance?: number;
  invoice_amount?: number;
  dollar_shortfall?: number;
  // Payroll
  employee_id?: string;
  employee_name?: string;
  employee_type?: string;
  gross_pay?: number;
  termination_date?: string;
  hours_per_week?: number;
  uses_company_equipment?: boolean;
  actual_rate?: number;
  correct_rate?: number;
  withheld?: number;
  should_withhold?: number;
  underpayment?: number;
  payroll_total?: number;
  gl_payroll_entry?: number;
}

export interface AuditResults {
  audit_type: string;
  total_findings: number;
  findings_by_severity: Record<Severity, number>;
  findings: AuditFinding[];
}

// ── Live audit findings (Harvest × Airtable) ─────────────────────────────────

export type LiveAuditType = 'time_budget' | 'invoicing' | 'cross_system';
export type LiveDataSource = 'harvest' | 'airtable' | 'both';

export interface LiveAuditFinding {
  id: string;
  audit_type: LiveAuditType;
  severity: Severity;
  title: string;
  description: string;
  amount_impact: number;
  affected_records: string[];
  recommended_action: string;
  requires_approval: boolean;
  data_source: LiveDataSource;
}

export interface LiveAuditSummary {
  total: number;
  high: number;
  medium: number;
  low: number;
  total_impact: number;
}

export interface LiveAuditResult {
  findings: LiveAuditFinding[];
  summary: LiveAuditSummary;
  sources: Record<string, string>;
  data_summary: {
    harvest: { projects: number; hours: number; invoices: number };
    airtable: { projects: number; total_budget: number };
  };
}
