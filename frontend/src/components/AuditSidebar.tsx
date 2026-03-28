import React from 'react';

interface Props {
  onAuditAction: (chatMessage: string) => void;
  onDemoRun: () => void;
  onClose: () => void;
  isLoading: boolean;
  isDemoRunning: boolean;
  isMobileOpen: boolean;
}

const SYSTEMS = ['QuickBooks', 'Shopify', 'Amazon', 'ShipBob', 'Gusto'];

const ACTIONS: { label: string; message: string; primary?: boolean }[] = [
  {
    label: 'Run Full Audit',
    message: 'Run a full audit on all my systems and summarize every finding organized by severity.',
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
  isLoading,
  isDemoRunning,
  isMobileOpen,
}) => (
  <aside className={`sidebar ${isMobileOpen ? 'sidebar--mobile-open' : ''}`}>

    {/* Brand + mobile close */}
    <div className="sidebar-brand">
      <div className="brand-avatar">FG</div>
      <div style={{ flex: 1 }}>
        <div className="brand-name">FreshGlow Skincare</div>
        <div className="brand-sub">Audit Dashboard</div>
      </div>
      <button className="sidebar-close" onClick={onClose} aria-label="Close menu">✕</button>
    </div>

    {/* Connected systems */}
    <div className="sidebar-section">
      <p className="sidebar-label">Connected Systems</p>
      <ul className="systems-list">
        {SYSTEMS.map((name) => (
          <li key={name} className="system-item">
            <span className="status-dot" aria-hidden="true" />
            {name}
          </li>
        ))}
      </ul>
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
      All systems connected
    </div>
  </aside>
);

export default AuditSidebar;
