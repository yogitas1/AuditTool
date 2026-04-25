import React, { useRef } from 'react';

type ConnStatus = 'loading' | 'connected' | 'error';

interface RegisteredFile {
  filename: string;
  path?: string;
  sheets: { name: string; row_count: number; columns: string[] }[];
}

interface HarvestSummary  { projects_count: number; total_hours: number; }
interface AirtableSummary { total_projects: number; total_budget: number; }

interface Props {
  harvestStatus:  ConnStatus;
  harvestData:    HarvestSummary  | null;
  airtableStatus: ConnStatus;
  airtableData:   AirtableSummary | null;
  registeredFiles: RegisteredFile[];
  isScanning:     boolean;
  onFileUpload:   (files: FileList) => void;
  onStartAudit:   () => void;
}

function ConnDot({ status }: { status: ConnStatus }) {
  return <span className={`sys-card__dot sys-card__dot--${status}`} />;
}

function StatusLabel({ status }: { status: ConnStatus }) {
  if (status === 'loading')   return <span className="sys-card__status">Checking…</span>;
  if (status === 'connected') return <span className="sys-card__status">Connected</span>;
  return <span className="sys-card__status">Not connected</span>;
}

const LandingPage: React.FC<Props> = ({
  harvestStatus, harvestData,
  airtableStatus, airtableData,
  registeredFiles, isScanning,
  onFileUpload, onStartAudit,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const liveReady      = harvestStatus === 'connected' && airtableStatus === 'connected';
  const someLoading    = harvestStatus === 'loading'   || airtableStatus === 'loading';
  const connectedCount = (harvestStatus === 'connected' ? 1 : 0) + (airtableStatus === 'connected' ? 1 : 0);
  const uploadCount    = registeredFiles.length;

  /* Nav status pill text */
  const navParts: string[] = [];
  if (connectedCount > 0) navParts.push(`${connectedCount} system${connectedCount !== 1 ? 's' : ''} connected`);
  if (uploadCount    > 0) navParts.push(`${uploadCount} Excel upload${uploadCount !== 1 ? 's' : ''}`);
  const navText = navParts.join(' • ');

  /* Nav dot colour */
  const navDotCls = liveReady   ? 'portal-nav-dot--green'
                  : someLoading ? 'portal-nav-dot--pulse'
                  : connectedCount > 0 ? 'portal-nav-dot--amber'
                  : 'portal-nav-dot--grey';

  /* Start button label */
  const startLabel = someLoading  ? 'Checking connections…'
                   : !liveReady   ? 'Connect Harvest & Airtable to start'
                   :                '▶  Start Audit';

  return (
    <div className="portal">

      {/* ── Header ── */}
      <header className="portal-header">
        <div className="portal-header__brand">
          <div className="brand-avatar">AI</div>
          <div>
            <div className="brand-name">AuditAI</div>
            <div className="brand-sub">Financial Audit Agent</div>
            <div className="brand-sprint-note">Built for AI & Data Transformation — SMB Innovation Sprint</div>
          </div>
        </div>

        {(navText || someLoading) && (
          <div className="portal-nav-status">
            <span className={`portal-nav-dot ${navDotCls}`} />
            <span className="portal-nav-status__text">
              {someLoading && !navText ? 'Checking connections…' : navText || 'Checking connections…'}
            </span>
          </div>
        )}
      </header>

      {/* ── Two-column body ── */}
      <div className="portal-body">

        {/* ── LEFT: Connect your systems ── */}
        <section className="portal-section">
          <div className="portal-section__heading">
            <h2 className="portal-section__title">Connect your systems</h2>
            <p className="portal-section__sub">Live API connections — no exports needed.</p>
          </div>

          <div className="sys-cards">

            {/* Harvest */}
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
                <div className="sys-card__meta sys-card__meta--error">
                  Check HARVEST_ACCESS_TOKEN in&nbsp;.env
                </div>
              )}
            </div>

            {/* Airtable */}
            <div className={`sys-card${airtableStatus === 'connected' ? ' sys-card--connected' : airtableStatus === 'error' ? ' sys-card--error' : ''}`}>
              <div className="sys-card__header">
                <ConnDot status={airtableStatus} />
                <span className="sys-card__name">Airtable</span>
                <StatusLabel status={airtableStatus} />
              </div>
              {airtableStatus === 'connected' && airtableData && (
                <div className="sys-card__meta">
                  {airtableData.total_projects} projects &middot; ${airtableData.total_budget.toLocaleString()} total budget
                </div>
              )}
              {airtableStatus === 'error' && (
                <div className="sys-card__meta sys-card__meta--error">
                  Check AIRTABLE_PAT in&nbsp;.env
                </div>
              )}
            </div>

            {/* QuickBooks — upload fallback */}
            <div className="sys-card sys-card--dimmed">
              <div className="sys-card__header">
                <span className="sys-card__dot sys-card__dot--offline" />
                <span className="sys-card__name">QuickBooks</span>
                <span className="sys-card__badge sys-card__badge--soon">Coming soon</span>
              </div>
              <div className="sys-card__meta">
                <button
                  className="portal-inline-link"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Use Excel upload for now →
                </button>
              </div>
            </div>

            {/* Google Suite */}
            <div className="sys-card sys-card--dimmed">
              <div className="sys-card__header">
                <span className="sys-card__dot sys-card__dot--offline" />
                <span className="sys-card__name">Google Suite</span>
                <span className="sys-card__badge sys-card__badge--soon">Coming soon</span>
              </div>
            </div>

            {/* Dropbox Sign */}
            <div className="sys-card sys-card--dimmed">
              <div className="sys-card__header">
                <span className="sys-card__dot sys-card__dot--offline" />
                <span className="sys-card__name">Dropbox Sign</span>
                <span className="sys-card__badge sys-card__badge--soon">Coming soon</span>
              </div>
            </div>

          </div>

          {/* Start Audit CTA */}
          <button
            className="btn btn-start-audit portal-start-btn"
            onClick={onStartAudit}
            disabled={!liveReady}
          >
            {startLabel}
          </button>

          {!liveReady && !someLoading && (
            <p className="portal-start-hint">
              QuickBooks upload is optional — the audit runs on Harvest&nbsp;+&nbsp;Airtable alone.
            </p>
          )}
        </section>

        {/* ── RIGHT: Upload your reports ── */}
        <section className="portal-section">
          <div className="portal-section__heading">
            <h2 className="portal-section__title">Upload your reports</h2>
            <p className="portal-section__sub">Optional supplement for QuickBooks data.</p>
          </div>

          {/* Single QuickBooks upload slot */}
          <div
            className={`upload-slot${isScanning ? ' upload-slot--loading' : ''}`}
            onClick={() => !isScanning && fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
          >
            <div className="upload-slot__icon">📊</div>
            <div className="upload-slot__text">
              <div className="upload-slot__name">QuickBooks revenue report</div>
              <div className="upload-slot__hint">
                {isScanning ? 'Uploading…' : 'Click to upload a .xlsx export'}
              </div>
            </div>
            {isScanning
              ? <div className="upload-slot__spinner" />
              : <span className="upload-slot__arrow">↑</span>
            }
          </div>

          {/* Files already uploaded */}
          {registeredFiles.length > 0 && (
            <ul className="uploaded-files-list">
              {registeredFiles.map(f => (
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

          {/* Live-data note replacing the other 3 slots */}
          <div className="portal-live-note">
            <span className="portal-live-note__dot" />
            <span>
              <strong>Harvest</strong> and <strong>Airtable</strong> data will be pulled live
              — no upload needed for these systems.
            </span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            multiple
            style={{ display: 'none' }}
            onChange={e => {
              if (e.target.files?.length) onFileUpload(e.target.files);
              e.target.value = '';
            }}
          />
        </section>

      </div>
    </div>
  );
};

export default LandingPage;
