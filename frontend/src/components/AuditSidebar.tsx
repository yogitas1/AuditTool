import React, { useRef, useState } from 'react';

type ConnStatus = 'loading' | 'connected' | 'error';

interface RegisteredFile {
  filename: string;
  path?: string;
  sheets: { name: string; row_count: number; columns: string[] }[];
}

interface HarvestSummary  { projects_count: number; total_hours: number; }
interface AirtableSummary { total_projects: number; total_budget: number; }

interface Props {
  onAuditAction:    (chatMessage: string) => void;
  onDemoRun:        () => void;
  onClose:          () => void;
  onScanDirectory:  (dir: string) => void;
  onFileUpload:     (files: FileList) => void;
  onLiveAudit:      () => void;
  isLoading:        boolean;
  isDemoRunning:    boolean;
  isLiveAuditRunning: boolean;
  isMobileOpen:     boolean;
  registeredFiles:  RegisteredFile[];
  isScanning:       boolean;
  scannedDir:       string;
  harvestStatus:    ConnStatus;
  airtableStatus:   ConnStatus;
  harvestData:      HarvestSummary  | null;
  airtableData:     AirtableSummary | null;
}

function ConnDot({ status }: { status: ConnStatus }) {
  return <span className={`sys-card__dot sys-card__dot--${status}`} />;
}

function StatusLabel({ status }: { status: ConnStatus }) {
  if (status === 'loading')   return <span className="sys-card__status">Checking…</span>;
  if (status === 'connected') return <span className="sys-card__status">Connected</span>;
  return <span className="sys-card__status sys-card__status--error">Not connected</span>;
}

const AuditSidebar: React.FC<Props> = ({
  onAuditAction, onDemoRun, onClose,
  onScanDirectory, onFileUpload, onLiveAudit,
  isLoading, isDemoRunning, isLiveAuditRunning,
  isMobileOpen, registeredFiles, isScanning, scannedDir,
  harvestStatus, airtableStatus, harvestData, airtableData,
}) => {
  const [dirInput, setDirInput] = useState(scannedDir);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasFiles   = registeredFiles.length > 0;
  const liveReady  = harvestStatus === 'connected' && airtableStatus === 'connected';
  const busy       = isLoading || isDemoRunning || isLiveAuditRunning;

  const handleScan = () => {
    const trimmed = dirInput.trim();
    if (trimmed) onScanDirectory(trimmed);
  };

  return (
    <aside className={`sidebar ${isMobileOpen ? 'sidebar--mobile-open' : ''}`}>

      {/* ── Brand ─────────────────────────────────────────────── */}
      <div className="sidebar-brand">
        <div className="brand-avatar">AI</div>
        <div style={{ flex: 1 }}>
          <div className="brand-name">AuditAI</div>
          <div className="brand-sub">Financial Audit Agent</div>
        </div>
        <button className="sidebar-close" onClick={onClose} aria-label="Close menu">✕</button>
      </div>

      {/* ── Live connections ───────────────────────────────────── */}
      <div className="sidebar-section">
        <p className="sidebar-label">Live Connections</p>
        <div className="sys-cards">

          <div className={`sys-card${harvestStatus === 'connected' ? ' sys-card--connected' : harvestStatus === 'error' ? ' sys-card--error' : ''}`}>
            <div className="sys-card__header">
              <ConnDot status={harvestStatus} />
              <span className="sys-card__name">Harvest</span>
              <StatusLabel status={harvestStatus} />
            </div>
            {harvestStatus === 'connected' && harvestData && (
              <div className="sys-card__meta">
                {harvestData.projects_count} projects &middot; {harvestData.total_hours}h tracked
              </div>
            )}
            {harvestStatus === 'error' && (
              <div className="sys-card__meta sys-card__meta--error">Check HARVEST_ACCESS_TOKEN</div>
            )}
          </div>

          <div className={`sys-card${airtableStatus === 'connected' ? ' sys-card--connected' : airtableStatus === 'error' ? ' sys-card--error' : ''}`}>
            <div className="sys-card__header">
              <ConnDot status={airtableStatus} />
              <span className="sys-card__name">Airtable</span>
              <StatusLabel status={airtableStatus} />
            </div>
            {airtableStatus === 'connected' && airtableData && (
              <div className="sys-card__meta">
                {airtableData.total_projects} projects &middot; ${airtableData.total_budget.toLocaleString()} budget
              </div>
            )}
            {airtableStatus === 'error' && (
              <div className="sys-card__meta sys-card__meta--error">Check AIRTABLE_PAT</div>
            )}
          </div>

        </div>
      </div>

      {/* ── Run Full Audit ─────────────────────────────────────── */}
      <div className="sidebar-section">
        <button
          className="btn btn-start-audit"
          onClick={() => { onLiveAudit(); onClose(); }}
          disabled={!liveReady || busy}
        >
          {isLiveAuditRunning ? (
            <><span className="demo-spinner" /> Running audit…</>
          ) : harvestStatus === 'loading' || airtableStatus === 'loading' ? (
            'Checking connections…'
          ) : !liveReady ? (
            'Connect systems to start'
          ) : (
            '▶  Run Full Audit'
          )}
        </button>
      </div>

      {/* ── Quick actions ──────────────────────────────────────── */}
      <div className="sidebar-section">
        <p className="sidebar-label">Quick Actions</p>
        <div className="action-buttons">
          <button
            className="btn btn-secondary"
            onClick={() => { onAuditAction('Check my project hours against budgets and highlight any overruns.'); onClose(); }}
            disabled={busy}
          >
            Check Hours vs Budget
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => { onAuditAction('Find any work I haven\'t invoiced — non-billable hours, completed projects without invoices, and overdue payments.'); onClose(); }}
            disabled={busy}
          >
            Find Unbilled Work
          </button>
          {hasFiles && (
            <button
              className="btn btn-secondary"
              onClick={() => { onAuditAction('Check my QuickBooks revenue data for discrepancies.'); onClose(); }}
              disabled={busy}
            >
              QuickBooks Check
            </button>
          )}
        </div>
      </div>

      {/* ── Uploaded files ─────────────────────────────────────── */}
      <div className="sidebar-section">
        <p className="sidebar-label">QuickBooks Data</p>

        {liveReady && (
          <div className="live-note" style={{ marginBottom: 8 }}>
            Harvest &amp; Airtable pulled live — upload below for QuickBooks.
          </div>
        )}

        <div className="scan-row">
          <input
            className="scan-input"
            type="text"
            placeholder="/path/to/excel/files"
            value={dirInput}
            onChange={(e) => setDirInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleScan(); }}
          />
          <button
            className="btn btn-primary scan-btn"
            onClick={handleScan}
            disabled={isScanning || !dirInput.trim()}
          >
            {isScanning ? '…' : 'Scan'}
          </button>
        </div>

        <div className="upload-alt">
          <span className="upload-alt__text">or</span>
          <button
            className="upload-alt__btn"
            onClick={() => fileInputRef.current?.click()}
          >
            upload .xlsx file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files?.length) onFileUpload(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {hasFiles && (
          <ul className="uploaded-files-list">
            {registeredFiles.map((f) => (
              <li key={f.filename} className="uploaded-file">
                <div className="uploaded-file__info">
                  <span className="uploaded-file__name">{f.filename}</span>
                  <span className="uploaded-file__meta">
                    {f.path ?? f.sheets.map(s => `${s.name} (${s.row_count} rows)`).join(', ')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Demo ──────────────────────────────────────────────── */}
      <div className="sidebar-section">
        <p className="sidebar-label">Demo</p>
        <button
          className="btn btn-demo"
          onClick={onDemoRun}
          disabled={busy}
        >
          {isDemoRunning ? (
            <><span className="demo-spinner" /> Running demo…</>
          ) : (
            <>▶ Run Demo</>
          )}
        </button>
        <p className="demo-hint">Verifies live connections and runs a 3-step walkthrough.</p>
      </div>

      {/* ── Footer ────────────────────────────────────────────── */}
      <div className="sidebar-footer">
        <span className="footer-dot" style={{ background: liveReady ? '#22c55e' : '#d1d5db' }} />
        <span>
          {liveReady
          ? `Live: Harvest + Airtable${hasFiles ? ' + QuickBooks' : ''}`
          : hasFiles
            ? 'Excel mode — using uploaded files'
            : 'Connect systems to start'}
        </span>
        <span className="sidebar-sprint-tag">Built for AI & Data Transformation — SMB Innovation Sprint</span>
      </div>

    </aside>
  );
};

export default AuditSidebar;
