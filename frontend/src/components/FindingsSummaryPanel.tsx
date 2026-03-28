import React, { useMemo } from 'react';
import { AuditFinding, AuditSection, Severity } from '../types';
import {
  getCompactDescription,
  getClickMessage,
  getFinancialImpact,
  getTotalImpact,
} from '../utils/findingUtils';

interface Props {
  findings: AuditFinding[];
  isOpen: boolean;
  isLoading: boolean;
  onToggle: () => void;
  onFindingClick: (message: string) => void;
}

const SECTIONS: { key: AuditSection; label: string; icon: string }[] = [
  { key: 'revenue',   label: 'Revenue',   icon: '↕' },
  { key: 'inventory', label: 'Inventory', icon: '□' },
  { key: 'payroll',   label: 'Payroll',   icon: '◎' },
];

const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low'];

function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`sev-badge sev-badge--${severity}`}>
      {severity === 'high' ? 'HIGH' : severity === 'medium' ? 'MED' : 'LOW'}
    </span>
  );
}

function ImpactChip({ amount }: { amount: number }) {
  if (amount === 0) return null;
  return (
    <span className="impact-chip">
      ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
    </span>
  );
}

const FindingsSummaryPanel: React.FC<Props> = ({
  findings,
  isOpen,
  isLoading,
  onToggle,
  onFindingClick,
}) => {
  const bySeverity = useMemo(() => {
    const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
    for (const f of findings) counts[f.severity]++;
    return counts;
  }, [findings]);

  const grouped = useMemo(() => {
    const map: Partial<Record<AuditSection, AuditFinding[]>> = {};
    for (const f of findings) {
      if (!map[f._audit]) map[f._audit] = [];
      map[f._audit]!.push(f);
    }
    return map;
  }, [findings]);

  const totalImpact = useMemo(() => getTotalImpact(findings), [findings]);

  if (!isLoading && findings.length === 0) return null;

  return (
    <div className={`fp ${isOpen ? 'fp--open' : ''}`}>

      {/* ── Header bar (always visible) ────────────────────────── */}
      <button className="fp__header" onClick={onToggle} aria-expanded={isOpen}>
        <span className="fp__header-left">
          {isLoading ? (
            <span className="fp__loading">Fetching audit data…</span>
          ) : (
            <>
              <span className="fp__total">{findings.length} findings</span>
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

      {/* ── Collapsible body ───────────────────────────────────── */}
      <div className="fp__body" aria-hidden={!isOpen}>
        {SECTIONS.map(({ key, label, icon }) => {
          const sectionFindings = grouped[key];
          if (!sectionFindings || sectionFindings.length === 0) return null;

          // Sort within section: high → medium → low
          const sorted = [...sectionFindings].sort(
            (a, b) =>
              SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
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
