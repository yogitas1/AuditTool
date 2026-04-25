import React, { useEffect, useState } from 'react';

interface HarvestSummary  { projects_count: number; total_hours: number; }
interface AirtableSummary { total_projects: number; total_budget: number; }

type StepStatus = 'waiting' | 'running' | 'done' | 'error';

interface Step {
  status: StepStatus;
  label: string;
  doneLabel?: string;
}

interface Props {
  harvestData:    HarvestSummary  | null;
  airtableData:   AirtableSummary | null;
}

const LiveAuditProgress: React.FC<Props> = ({ harvestData, airtableData }) => {
  const [steps, setSteps] = useState<Step[]>([
    { status: 'running', label: 'Connecting to Harvest API…' },
    { status: 'waiting', label: 'Connecting to Airtable API…' },
    { status: 'waiting', label: 'Cross-referencing hours against budgets…' },
  ]);

  useEffect(() => {
    const resolve = (index: number, doneLabel: string) =>
      setSteps(prev => prev.map((s, i) =>
        i === index ? { ...s, status: 'done', doneLabel } : s,
      ));

    const activate = (index: number) =>
      setSteps(prev => prev.map((s, i) =>
        i === index ? { ...s, status: 'running' } : s,
      ));

    const harvestLabel = harvestData
      ? `Connected — pulled ${harvestData.projects_count} projects, ${harvestData.total_hours}h`
      : 'Connected';
    const airtableLabel = airtableData
      ? `Connected — pulled ${airtableData.total_projects} projects from tracker`
      : 'Connected';

    const t1 = setTimeout(() => resolve(0, harvestLabel),        900);
    const t2 = setTimeout(() => activate(1),                     1100);
    const t3 = setTimeout(() => resolve(1, airtableLabel),       2100);
    const t4 = setTimeout(() => activate(2),                     2300);

    return () => [t1, t2, t3, t4].forEach(clearTimeout);
  }, [harvestData, airtableData]);

  return (
    <div className="msg-row msg-row--assistant">
      <div className="msg-avatar">AI</div>
      <div className="bubble bubble--assistant">
        <div className="live-progress">
          <div className="live-progress__title">Running live audit…</div>
          {steps.map((step, i) => (
            <div
              key={i}
              className={`live-progress__step live-progress__step--${step.status}`}
            >
              <span className="live-progress__icon" aria-hidden="true">
                {step.status === 'done'    ? '✓'
               : step.status === 'running' ? <span className="live-progress__spinner" />
               : step.status === 'error'   ? '✕'
               :                             '○'}
              </span>
              <span className="live-progress__text">
                {step.status === 'done' && step.doneLabel
                  ? step.doneLabel
                  : step.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LiveAuditProgress;
