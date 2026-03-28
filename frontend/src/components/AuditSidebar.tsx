import React, { useRef } from 'react';

interface UploadedFile {
  filename: string;
  sheets: { name: string; row_count: number; columns: string[] }[];
}

interface Props {
  onAuditAction: (chatMessage: string) => void;
  onDemoRun: () => void;
  onClose: () => void;
  onFileUpload: (files: FileList) => void;
  onFileDelete: (filename: string) => void;
  isLoading: boolean;
  isDemoRunning: boolean;
  isMobileOpen: boolean;
  uploadedFiles: UploadedFile[];
  isUploading: boolean;
}

const ACTIONS: { label: string; message: string; primary?: boolean }[] = [
  {
    label: 'Run Full Audit',
    message: 'Run a full audit on all my uploaded files and summarize every finding organized by severity.',
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
  onFileUpload,
  onFileDelete,
  isLoading,
  isDemoRunning,
  isMobileOpen,
  uploadedFiles,
  isUploading,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasFiles = uploadedFiles.length > 0;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length) onFileUpload(e.dataTransfer.files);
  };

  return (
    <aside className={`sidebar ${isMobileOpen ? 'sidebar--mobile-open' : ''}`}>

      {/* Brand + mobile close */}
      <div className="sidebar-brand">
        <div className="brand-avatar">AI</div>
        <div style={{ flex: 1 }}>
          <div className="brand-name">AuditAI</div>
          <div className="brand-sub">Financial Audit Agent</div>
        </div>
        <button className="sidebar-close" onClick={onClose} aria-label="Close menu">✕</button>
      </div>

      {/* File Upload */}
      <div className="sidebar-section">
        <p className="sidebar-label">Upload Spreadsheets</p>
        <div
          className={`upload-zone ${isUploading ? 'upload-zone--uploading' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files?.length) onFileUpload(e.target.files); e.target.value = ''; }}
          />
          {isUploading ? (
            <span className="upload-zone__text">
              <span className="demo-spinner" style={{ borderColor: 'rgba(37,99,235,0.3)', borderTopColor: '#2563eb' }} /> Uploading…
            </span>
          ) : (
            <span className="upload-zone__text">
              Drop .xlsx files here or <span className="upload-zone__link">browse</span>
            </span>
          )}
        </div>

        {hasFiles && (
          <ul className="uploaded-files-list">
            {uploadedFiles.map((f) => (
              <li key={f.filename} className="uploaded-file">
                <div className="uploaded-file__info">
                  <span className="uploaded-file__name">{f.filename}</span>
                  <span className="uploaded-file__meta">
                    {f.sheets.map(s => `${s.name} (${s.row_count} rows)`).join(', ')}
                  </span>
                </div>
                <button
                  className="uploaded-file__remove"
                  onClick={(e) => { e.stopPropagation(); onFileDelete(f.filename); }}
                  aria-label={`Remove ${f.filename}`}
                  title="Remove file"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Data source indicator */}
      <div className="sidebar-section">
        <div className={`data-source-badge ${hasFiles ? 'data-source-badge--excel' : 'data-source-badge--demo'}`}>
          <span className="data-source-badge__dot" />
          {hasFiles ? `Agent mode — ${uploadedFiles.length} file(s) loaded` : 'Demo mode — using sample data'}
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

      {/* Demo walkthrough */}
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
        {hasFiles ? 'Reading from uploaded files' : 'All systems connected'}
      </div>
    </aside>
  );
};

export default AuditSidebar;
