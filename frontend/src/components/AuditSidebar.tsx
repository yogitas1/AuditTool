import React, { useRef, useState } from 'react';

interface RegisteredFile {
  filename: string;
  path?: string;
  sheets: { name: string; row_count: number; columns: string[] }[];
}

interface Props {
  onAuditAction: (chatMessage: string) => void;
  onDemoRun: () => void;
  onClose: () => void;
  onScanDirectory: (dir: string) => void;
  onFileUpload: (files: FileList) => void;
  isLoading: boolean;
  isDemoRunning: boolean;
  isMobileOpen: boolean;
  registeredFiles: RegisteredFile[];
  isScanning: boolean;
  scannedDir: string;
}

const ACTIONS: { label: string; message: string; primary?: boolean }[] = [
  {
    label: 'Run Full Audit + Auto-Fix',
    message: 'Run a full audit on all files and auto-fix every correctable discrepancy. Show me what you changed.',
    primary: true,
  },
  {
    label: 'Revenue Check',
    message: 'Check my revenue for discrepancies between QuickBooks, Shopify, and Amazon.',
  },
  {
    label: 'Inventory Check',
    message: 'Run an inventory audit and show me any stock discrepancies or purchase order issues.',
  },
  {
    label: 'Payroll Check',
    message:
      'Audit my payroll for issues — terminated employees still being paid, misclassification risks, and tax errors.',
  },
];

const AuditSidebar: React.FC<Props> = ({
  onAuditAction,
  onDemoRun,
  onClose,
  onScanDirectory,
  onFileUpload,
  isLoading,
  isDemoRunning,
  isMobileOpen,
  registeredFiles,
  isScanning,
  scannedDir,
}) => {
  const [dirInput, setDirInput] = useState(scannedDir);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasFiles = registeredFiles.length > 0;

  const handleScan = () => {
    const trimmed = dirInput.trim();
    if (trimmed) onScanDirectory(trimmed);
  };

  return (
    <aside className={`sidebar ${isMobileOpen ? 'sidebar--mobile-open' : ''}`}>

      {/* Brand */}
      <div className="sidebar-brand">
        <div className="brand-avatar">AI</div>
        <div style={{ flex: 1 }}>
          <div className="brand-name">AuditAI</div>
          <div className="brand-sub">Financial Audit Agent</div>
        </div>
        <button className="sidebar-close" onClick={onClose} aria-label="Close menu">✕</button>
      </div>

      {/* Scan local folder */}
      <div className="sidebar-section">
        <p className="sidebar-label">Scan Local Folder</p>
        <div className="scan-row">
          <input
            className="scan-input"
            type="text"
            placeholder="/path/to/your/excel/files"
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

        {/* Upload fallback */}
        <div className="upload-alt">
          <span className="upload-alt__text">or</span>
          <button
            className="upload-alt__btn"
            onClick={() => fileInputRef.current?.click()}
          >
            upload files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files?.length) onFileUpload(e.target.files); e.target.value = ''; }}
          />
        </div>

        {/* Registered files list */}
        {hasFiles && (
          <ul className="uploaded-files-list">
            {registeredFiles.map((f) => (
              <li key={f.filename} className="uploaded-file">
                <div className="uploaded-file__info">
                  <span className="uploaded-file__name">{f.filename}</span>
                  <span className="uploaded-file__meta">
                    {f.path ? f.path : f.sheets.map(s => `${s.name} (${s.row_count} rows)`).join(', ')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Data source indicator */}
      <div className="sidebar-section">
        <div className={`data-source-badge ${hasFiles ? 'data-source-badge--excel' : 'data-source-badge--demo'}`}>
          <span className="data-source-badge__dot" />
          {hasFiles
            ? `Agent mode — ${registeredFiles.length} file(s) on disk`
            : 'Demo mode — using sample data'}
        </div>
      </div>

      {/* Quick actions */}
      <div className="sidebar-section">
        <p className="sidebar-label">Quick Actions</p>
        <div className="action-buttons">
          {ACTIONS.map(({ label, message, primary }) => (
            <button
              key={label}
              className={primary ? 'btn btn-primary' : 'btn btn-secondary'}
              onClick={() => onAuditAction(message)}
              disabled={isLoading}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Demo */}
      <div className="sidebar-section">
        <p className="sidebar-label">Hackathon Demo</p>
        <button
          className="btn btn-demo"
          onClick={onDemoRun}
          disabled={isLoading}
        >
          {isDemoRunning ? (
            <>
              <span className="demo-spinner" />
              Running demo…
            </>
          ) : (
            <>▶ Run Demo Walkthrough</>
          )}
        </button>
        <p className="demo-hint">
          Auto-runs a 3-step audit walkthrough — no typing needed.
        </p>
      </div>

      <div className="sidebar-footer">
        <span className="footer-dot" />
        {hasFiles ? 'Editing files in place on disk' : 'All systems connected'}
      </div>
    </aside>
  );
};

export default AuditSidebar;
