import React, { useMemo } from 'react';
import { AuditFinding, AuditSection, LiveAuditFinding, LiveAuditType, Severity } from '../types';
import {
  getCompactDescription,
  getClickMessage,
  getFinancialImpact,
  getTotalImpact,
  getLiveImpact,
  getLiveTotalImpact,
  getLiveClickMessage,
} from '../utils/findingUtils';

interface Props {
  findings:     AuditFinding[];
  liveFindings: LiveAuditFinding[];
  isOpen:       boolean;
  isLoading:    boolean;
  onToggle:     () => void;
  onFindingClick: (message: string) => void;
}

// ── Excel sections ───────────────────────────────────────────────────────────

const EXCEL_SECTIONS: { key: AuditSection; label: string; icon: string }[] = [
  { key: 'revenue',   label: 'Revenue',   icon: '↕' },
  { key: 'inventory', label: 'Inventory', icon: '□' },
  { key: 'payroll',   label: 'Payroll',   icon: '◎' },
];

// ── Live sections ────────────────────────────────────────────────────────────

const LIVE_SECTIONS: { key: LiveAuditType; label: string; icon: string }[] = [
  { key: 'time_budget',  label: 'Hours & Budget', icon: '⏱' },
  { key: 'invoicing',    label: 'Invoicing',      icon: '◫' },
  { key: 'cross_system', label: 'Cross-System',   icon: '⇌' },
];

const SOURCE_LABELS: Record<string, string> = {
  harvest:  'Harvest',
  airtable: 'Airtable',
  both:     'Harvest + Airtable',
};

const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low'];

function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`sev-badge sev-badge--${severity}`}>
      {severity === 'high' ? 'HIGH' : severity === 'medium' ? 'MED' : 'LOW'}
    </span>
  );
}

function ImpactChip({ amount }: { amount: number }) {
  if (!amount) return null;
  return (
    <span className="impact-chip">
      ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
    </span>
  );
}

function SourceChip({ source }: { source: string }) {
  return (
    <span className={`source-chip source-chip--${source}`}>
      {SOURCE_LABELS[source] ?? source}
    </span>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

const FindingsSummaryPanel: React.FC<Props> = ({
  findings, liveFindings, isOpen, isLoading, onToggle, onFindingClick,
}) => {
  const hasLive  = liveFindings.length > 0;
  const hasExcel = findings.length > 0;
  const total    = hasLive ? liveFindings.length : findings.length;

  // Severity counts
  const bySeverity = useMemo(() => {
    const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
    const src = hasLive ? liveFindings : findings;
    for (const f of src) counts[f.severity]++;
    return counts;
  }, [findings, liveFindings, hasLive]);

  // Total financial impact
  const totalImpact = useMemo(() =>
    hasLive ? getLiveTotalImpact(liveFindings) : getTotalImpact(findings),
    [findings, liveFindings, hasLive],
  );

  // Excel grouping
  const excelGrouped = useMemo(() => {
    const map: Partial<Record<AuditSection, AuditFinding[]>> = {};
    for (const f of findings) {
      if (!map[f._audit]) map[f._audit] = [];
      map[f._audit]!.push(f);
    }
    return map;
  }, [findings]);

  // Live grouping
  const liveGrouped = useMemo(() => {
    const map: Partial<Record<LiveAuditType, LiveAuditFinding[]>> = {};
    for (const f of liveFindings) {
      if (!map[f.audit_type]) map[f.audit_type] = [];
      map[f.audit_type]!.push(f);
    }
    return map;
  }, [liveFindings]);

  if (!isLoading && !hasLive && !hasExcel) return null;

  return (
    <div className={`fp ${isOpen ? 'fp--open' : ''}`}>

      {/* ── Header ── */}
      <button className="fp__header" onClick={onToggle} aria-expanded={isOpen}>
        <span className="fp__header-left">
          {isLoading ? (
            <span className="fp__loading">
              {hasLive ? 'Fetching live audit data…' : 'Fetching audit data…'}
            </span>
          ) : (
            <>
              <span className="fp__total">{total} findings</span>
              {hasLive && (
                <span className="fp__source-tag">Live</span>
              )}
              <span className="fp__divider" />
              {SEVERITY_ORDER.map((sev) =>
                bySeverity[sev] > 0 ? (
                  <span key={sev} className={`fp__sev-count fp__sev-count--${sev}`}>
                    {bySeverity[sev]} {sev}
                  </span>
                ) : null,
              )}
            </>
          )}
        </span>

        <span className="fp__header-right">
          {!isLoading && totalImpact > 0 && (
            <span className="fp__impact">
              ${totalImpact.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} at risk
            </span>
          )}
          <span className="fp__chevron" aria-hidden="true">
            {isOpen ? '▲' : '▼'}
          </span>
        </span>
      </button>

      {/* ── Body ── */}
      <div className="fp__body" aria-hidden={!isOpen}>

        {/* Live findings sections */}
        {hasLive && LIVE_SECTIONS.map(({ key, label, icon }) => {
          const sectionFindings = liveGrouped[key];
          if (!sectionFindings || sectionFindings.length === 0) return null;
          const sorted = [...sectionFindings].sort(
            (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
          );
          return (
            <div key={key} className="fp__section">
              <div className="fp__section-header">
                <span className="fp__section-icon">{icon}</span>
                <span className="fp__section-title">{label}</span>
                <span className="fp__section-count">
                  {sectionFindings.length} finding{sectionFindings.length !== 1 ? 's' : ''}
                </span>
              </div>
              {sorted.map((f) => (
                <button
                  key={f.id}
                  className="fp__finding"
                  onClick={() => onFindingClick(getLiveClickMessage(f))}
                  title={f.description}
                >
                  <SeverityBadge severity={f.severity} />
                  <span className="fp__finding-desc">{f.title}</span>
                  <SourceChip source={f.data_source} />
                  <ImpactChip amount={getLiveImpact(f)} />
                  <span className="fp__finding-arrow">›</span>
                </button>
              ))}
            </div>
          );
        })}

        {/* Excel findings sections */}
        {hasExcel && EXCEL_SECTIONS.map(({ key, label, icon }) => {
          const sectionFindings = excelGrouped[key];
          if (!sectionFindings || sectionFindings.length === 0) return null;
          const sorted = [...sectionFindings].sort(
            (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
          );
          return (
            <div key={key} className="fp__section">
              <div className="fp__section-header">
                <span className="fp__section-icon">{icon}</span>
                <span className="fp__section-title">{label}</span>
                <span className="fp__section-count">
                  {sectionFindings.length} finding{sectionFindings.length !== 1 ? 's' : ''}
                </span>
              </div>
              {sorted.map((f, i) => (
                <button
                  key={i}
                  className="fp__finding"
                  onClick={() => onFindingClick(getClickMessage(f))}
                  title={f.explanation}
                >
                  <SeverityBadge severity={f.severity} />
                  <span className="fp__finding-desc">{getCompactDescription(f)}</span>
                  <SourceChip source="excel" />
                  <ImpactChip amount={getFinancialImpact(f)} />
                  <span className="fp__finding-arrow">›</span>
                </button>
              ))}
            </div>
          );
        })}

      </div>
    </div>
  );
};

export default FindingsSummaryPanel;
