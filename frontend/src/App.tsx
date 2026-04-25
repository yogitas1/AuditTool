import React, { useState, useCallback, useEffect, useRef } from 'react';
import './App.css';
import { AuditFinding, LiveAuditFinding, LiveAuditResult, Message } from './types';
import AuditSidebar from './components/AuditSidebar';
import LandingPage from './components/LandingPage';
import ChatWindow from './components/ChatWindow';
import InputBar from './components/InputBar';
import FindingsSummaryPanel from './components/FindingsSummaryPanel';
import CorrectionsPanel, { Correction } from './components/CorrectionsPanel';

const rawApiBase = process.env.REACT_APP_API_URL?.trim() ?? '';
const isBrowser = typeof window !== 'undefined';
const isLocalHostName = (host: string) =>
  host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');

const API_BASE = (() => {
  if (!rawApiBase) return '';
  if (!isBrowser) return rawApiBase;
  try {
    const parsed = new URL(rawApiBase, window.location.origin);
    const appIsLocal = isLocalHostName(window.location.hostname);
    const apiIsLocal = isLocalHostName(parsed.hostname);

    // Safety guard: on non-local deployments, ignore localhost API targets.
    if (!appIsLocal && apiIsLocal) return '';
    return parsed.origin;
  } catch {
    return '';
  }
})();
const CHAT_URL          = `${API_BASE}/api/chat`;
const AUDIT_URL         = `${API_BASE}/api/audit`;
const LIVE_AUDIT_URL    = `${API_BASE}/api/audit/live`;
const UPLOAD_URL        = `${API_BASE}/api/upload`;
const FILES_URL         = `${API_BASE}/api/files`;
const SCAN_URL          = `${API_BASE}/api/scan`;
const CORRECTIONS_URL   = `${API_BASE}/api/corrections`;
const HARVEST_TEST_URL  = `${API_BASE}/api/harvest/test`;
const AIRTABLE_TEST_URL = `${API_BASE}/api/airtable/test`;

type ConnStatus = 'loading' | 'connected' | 'error';

interface HarvestSummary  { projects_count: number; total_hours: number; }
interface AirtableSummary { total_projects: number; total_budget: number; }

interface RegisteredFile {
  filename: string;
  path?: string;
  sheets: { name: string; row_count: number; columns: string[] }[];
}

const INITIAL_WELCOME: Message = {
  id:        'welcome',
  role:      'assistant',
  timestamp: new Date(),
  content:   "Hi! I'm **AuditAI**. Connecting to your systems…",
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const DEMO_STEPS = [
  'Run a complete audit of my business finances and flag anything that needs my attention',
  'Which projects have unbilled hours or are going over budget?',
  'Draft a message I can send to any clients with outstanding unbilled work',
];

function buildWelcomeContent(
  harvestStatus: ConnStatus, harvestData: HarvestSummary | null,
  airtableStatus: ConnStatus, airtableData: AirtableSummary | null,
  registeredFiles: RegisteredFile[],
): string {
  const lines: string[] = ["I've connected to your systems:"];

  if (harvestStatus === 'connected' && harvestData) {
    lines.push(`• ✅ **Harvest** — ${harvestData.projects_count} projects, ${harvestData.total_hours}h tracked`);
  } else if (harvestStatus === 'error') {
    lines.push(`• ❌ **Harvest** — not connected (check HARVEST_ACCESS_TOKEN in .env)`);
  } else {
    lines.push(`• ⏳ **Harvest** — connecting…`);
  }

  if (airtableStatus === 'connected' && airtableData) {
    lines.push(`• ✅ **Airtable** — ${airtableData.total_projects} projects, $${airtableData.total_budget.toLocaleString()} total budget`);
  } else if (airtableStatus === 'error') {
    lines.push(`• ❌ **Airtable** — not connected (check AIRTABLE_PAT in .env)`);
  } else {
    lines.push(`• ⏳ **Airtable** — connecting…`);
  }

  const qbCount = registeredFiles.length;
  lines.push(qbCount > 0
    ? `• 📄 **QuickBooks** — ${qbCount} file${qbCount !== 1 ? 's' : ''} uploaded`
    : `• 📄 **QuickBooks** — not uploaded`);

  lines.push('');

  const liveReady = harvestStatus === 'connected' && airtableStatus === 'connected';
  if (liveReady) {
    lines.push(
      'I can cross-reference your time tracking against your project budgets to find unbilled hours, ' +
      'budget overruns, and missed invoices. Click **Run Full Audit** to start.'
    );
  } else if (harvestStatus === 'loading' || airtableStatus === 'loading') {
    lines.push('Checking connections…');
  } else {
    lines.push(
      'Connect Harvest and Airtable to enable live cross-system auditing. ' +
      'Or use the **Demo** to see a walkthrough with sample data.'
    );
  }

  return lines.join('\n');
}

function App() {
  const [view,                setView]                = useState<'portal' | 'chat'>('portal');
  const [messages,            setMessages]            = useState<Message[]>([INITIAL_WELCOME]);
  const [isLoading,           setIsLoading]           = useState(false);
  const [auditFindings,       setAuditFindings]       = useState<AuditFinding[]>([]);
  const [liveFindings,        setLiveFindings]        = useState<LiveAuditFinding[]>([]);
  const [isPanelOpen,         setIsPanelOpen]         = useState(false);
  const [isAuditLoading,      setIsAuditLoading]      = useState(false);
  const [isLiveAuditRunning,  setIsLiveAuditRunning]  = useState(false);
  const [isDemoRunning,       setIsDemoRunning]       = useState(false);
  const [isSidebarOpen,       setIsSidebarOpen]       = useState(false);
  const [registeredFiles,     setRegisteredFiles]     = useState<RegisteredFile[]>([]);
  const [isScanning,          setIsScanning]          = useState(false);
  const [scannedDir,          setScannedDir]          = useState('');
  const [corrections,         setCorrections]         = useState<Correction[]>([]);
  const [isCorrOpen,          setIsCorrOpen]          = useState(false);
  const [harvestStatus,       setHarvestStatus]       = useState<ConnStatus>('loading');
  const [airtableStatus,      setAirtableStatus]      = useState<ConnStatus>('loading');
  const [harvestData,         setHarvestData]         = useState<HarvestSummary  | null>(null);
  const [airtableData,        setAirtableData]        = useState<AirtableSummary | null>(null);

  const refreshConnections = useCallback(async (): Promise<boolean> => {
    setHarvestStatus('loading');
    setAirtableStatus('loading');

    const [harvestOk, airtableOk] = await Promise.all([
      fetch(HARVEST_TEST_URL)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => { setHarvestStatus('connected'); setHarvestData(d); return true; })
        .catch(() => { setHarvestStatus('error'); return false; }),
      fetch(AIRTABLE_TEST_URL)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => { setAirtableStatus('connected'); setAirtableData(d); return true; })
        .catch(() => { setAirtableStatus('error'); return false; }),
    ]);

    return harvestOk && airtableOk;
  }, []);

  // ── Keep a ref of live-data context so callChatAPI always reads latest state
  // without needing it in the useCallback dependency array.
  const chatContextRef = useRef<Record<string, unknown>>({});
  useEffect(() => {
    chatContextRef.current = {
      live_connections: {
        harvest:  harvestStatus  === 'connected' ? harvestData  : null,
        airtable: airtableStatus === 'connected' ? airtableData : null,
      },
      live_findings:   liveFindings.slice(0, 30),
      has_excel_files: registeredFiles.length > 0,
    };
  }, [harvestStatus, harvestData, airtableStatus, airtableData, liveFindings, registeredFiles]);

  // ── Fetch connection status on mount ──────────────────────────────────
  useEffect(() => {
    refreshConnections().catch(() => {});
  }, [refreshConnections]);

  // ── Update welcome message whenever connection state settles ──────────
  useEffect(() => {
    setMessages(prev => prev.map(m =>
      m.id === 'welcome'
        ? { ...m, content: buildWelcomeContent(harvestStatus, harvestData, airtableStatus, airtableData, registeredFiles) }
        : m,
    ));
  }, [harvestStatus, harvestData, airtableStatus, airtableData, registeredFiles]);

  // ── Load registered files on mount ───────────────────────────────────
  useEffect(() => {
    fetch(FILES_URL)
      .then((r) => r.json())
      .then((data) => setRegisteredFiles(data.files ?? []))
      .catch(() => {});
  }, []);

  // ── Scan directory ────────────────────────────────────────────────────
  const handleScanDirectory = useCallback(async (dir: string) => {
    setIsScanning(true);
    try {
      const res = await fetch(SCAN_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ directory: dir }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Scan failed' }));
        throw new Error(err.detail);
      }
      const data = await res.json();
      setRegisteredFiles(data.files ?? []);
      setScannedDir(dir);
      const count = (data.files ?? []).length;
      setMessages(prev => [...prev, {
        id:        `sys-${Date.now()}`,
        role:      'assistant',
        timestamp: new Date(),
        content:   count > 0
          ? `**Found ${count} Excel file(s) in \`${dir}\`.** Try "QuickBooks Check" to audit them.`
          : `**No .xlsx files found in \`${dir}\`.** Check the path and try again.`,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`, role: 'assistant', timestamp: new Date(),
        isError: true, content: "I couldn't scan that folder yet. Please check the path and try again.",
      }]);
    } finally {
      setIsScanning(false);
    }
  }, []);

  // ── File upload ───────────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (files: FileList) => {
    setIsScanning(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(UPLOAD_URL, { method: 'POST', body: form });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
          throw new Error(err.detail);
        }
        const data = await res.json();
        setRegisteredFiles(data.files ?? []);
      }
      setMessages(prev => [...prev, {
        id:        `sys-${Date.now()}`,
        role:      'assistant',
        timestamp: new Date(),
        content:   `**${files.length} file(s) uploaded.** Use "QuickBooks Check" to audit it, or "Run Full Audit" to combine it with your live data.`,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`, role: 'assistant', timestamp: new Date(),
        isError: true, content: "I couldn't upload that file right now. Please try again in a moment.",
      }]);
    } finally {
      setIsScanning(false);
    }
  }, []);

  // ── Corrections polling ───────────────────────────────────────────────
  const fetchCorrections = useCallback(async () => {
    try {
      const res  = await fetch(CORRECTIONS_URL);
      if (!res.ok) return;
      const data = await res.json();
      const list: Correction[] = data.corrections ?? [];
      setCorrections(list);
      if (list.length > 0) setIsCorrOpen(true);
    } catch { /* non-fatal */ }
  }, []);

  // ── Chat API call ─────────────────────────────────────────────────────
  const callChatAPI = useCallback(async (text: string): Promise<void> => {
    setIsLoading(true);
    try {
      const res = await fetch(CHAT_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text, context: chatContextRef.current }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(errData.detail ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setMessages(prev => [...prev, {
        id:        `a-${Date.now()}`,
        role:      'assistant',
        content:   data.reply,
        timestamp: new Date(),
        ...(data.requires_approval
          ? { approval: data.requires_approval, approvalStatus: 'pending' as const }
          : {}),
      }]);
      fetchCorrections();
    } catch {
      setMessages(prev => [...prev, {
        id:        `err-${Date.now()}`,
        role:      'assistant',
        timestamp: new Date(),
        isError:   true,
        retryText: text,
        content:
          "I couldn't complete that request right now.\n\n" +
          'Please try again in a few seconds. If this keeps happening, check that your data connections are active.',
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [fetchCorrections]);

  const sendMessage = useCallback(async (text: string) => {
    setMessages(prev => [...prev, {
      id: `u-${Date.now()}`, role: 'user', content: text, timestamp: new Date(),
    }]);
    await callChatAPI(text);
  }, [callChatAPI]);

  const retryMessage = useCallback(async (errorId: string, text: string) => {
    setMessages(prev => prev.filter(m => m.id !== errorId));
    await callChatAPI(text);
  }, [callChatAPI]);

  // ── Excel audit findings panel ────────────────────────────────────────
  const fetchAuditFindings = useCallback(async () => {
    setIsAuditLoading(true);
    setIsPanelOpen(true);
    try {
      const res = await fetch(AUDIT_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ audit_type: 'all' }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setAuditFindings(data.findings ?? []);
    } catch { /* non-fatal */ } finally {
      setIsAuditLoading(false);
    }
  }, []);

  // ── Live audit ────────────────────────────────────────────────────────
  const handleLiveAudit = useCallback(async () => {
    setIsLiveAuditRunning(true);
    setLiveFindings([]);
    setIsPanelOpen(false);
    try {
      const res = await fetch(LIVE_AUDIT_URL, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: LiveAuditResult = await res.json();

      setLiveFindings(data.findings ?? []);
      setIsPanelOpen(true);

      const s = data.summary;
      const impactLine = s.total_impact > 0
        ? `\n\n**Total financial impact: $${s.total_impact.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}**`
        : '';
      const liveSources = Object.entries(data.sources ?? {})
        .filter(([, v]) => v !== 'excel_upload')
        .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1))
        .join(' + ');

      setMessages(prev => [...prev, {
        id:        `live-${Date.now()}`,
        role:      'assistant',
        timestamp: new Date(),
        content:
          `**Live Audit Complete** — Source: ${liveSources || 'Harvest + Airtable'}\n\n` +
          `Found **${s.total} findings**: ${s.high} high, ${s.medium} medium, ${s.low} low.${impactLine}\n\n` +
          `Expand the **Findings** panel above to review each finding, or ask me about any specific issue.`,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id:        `err-${Date.now()}`,
        role:      'assistant',
        timestamp: new Date(),
        isError:   true,
        content:   "I couldn't run the live audit right now. Please confirm Harvest and Airtable are connected, then try again.",
      }]);
    } finally {
      setIsLiveAuditRunning(false);
    }
  }, []);

  // ── Audit action (chat message + optional Excel findings) ─────────────
  const handleAuditAction = useCallback((chatMessage: string) => {
    sendMessage(chatMessage);
    fetchAuditFindings();
    setIsSidebarOpen(false);
  }, [sendMessage, fetchAuditFindings]);

  // ── Demo walkthrough ──────────────────────────────────────────────────
  const runDemo = useCallback(async () => {
    if (isDemoRunning || isLoading) return;
    setIsDemoRunning(true);
    setIsSidebarOpen(false);
    try {
      const connected = await refreshConnections();
      if (!connected) {
        setMessages(prev => [...prev, {
          id:        `err-${Date.now()}`,
          role:      'assistant',
          timestamp: new Date(),
          isError:   true,
          content:   "Demo couldn't start because Harvest or Airtable is not connected. Reconnect both systems, then run demo again.",
        }]);
        return;
      }

      await sendMessage(DEMO_STEPS[0]);
      fetchAuditFindings();
      await sleep(4000);
      await sendMessage(DEMO_STEPS[1]);
      await sleep(4000);
      await sendMessage(DEMO_STEPS[2]);
    } finally {
      setIsDemoRunning(false);
    }
  }, [isDemoRunning, isLoading, sendMessage, fetchAuditFindings, refreshConnections]);

  // ── Approval flow ─────────────────────────────────────────────────────
  const handleApprove = useCallback((messageId: string) => {
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, approvalStatus: 'approved' as const } : m,
    ));
    sendMessage('I approve this correction. Please confirm it has been applied.');
  }, [sendMessage]);

  const handleReject = useCallback((messageId: string) => {
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, approvalStatus: 'rejected' as const } : m,
    ));
    sendMessage('I reject this correction. Let me review the details further before making any changes.');
  }, [sendMessage]);

  const handleStartAudit = useCallback(() => setView('chat'), []);

  const busy = isLoading || isDemoRunning;

  // ── Portal / landing page ─────────────────────────────────────────────
  if (view === 'portal') {
    return (
      <LandingPage
        harvestStatus={harvestStatus}
        harvestData={harvestData}
        airtableStatus={airtableStatus}
        airtableData={airtableData}
        registeredFiles={registeredFiles}
        isScanning={isScanning}
        onFileUpload={handleFileUpload}
        onStartAudit={handleStartAudit}
      />
    );
  }

  // ── Chat view ─────────────────────────────────────────────────────────
  return (
    <div className="app">
      <button
        className="sidebar-toggle"
        onClick={() => setIsSidebarOpen(true)}
        aria-label="Open navigation"
      >
        <span className="sidebar-toggle__bar" />
        <span className="sidebar-toggle__bar" />
        <span className="sidebar-toggle__bar" />
      </button>

      <div
        className={`sidebar-overlay ${isSidebarOpen ? 'sidebar-overlay--visible' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
        aria-hidden="true"
      />

      <AuditSidebar
        onAuditAction={handleAuditAction}
        onDemoRun={runDemo}
        onClose={() => setIsSidebarOpen(false)}
        onScanDirectory={handleScanDirectory}
        onFileUpload={handleFileUpload}
        onLiveAudit={handleLiveAudit}
        isLoading={busy}
        isDemoRunning={isDemoRunning}
        isLiveAuditRunning={isLiveAuditRunning}
        isMobileOpen={isSidebarOpen}
        registeredFiles={registeredFiles}
        isScanning={isScanning}
        scannedDir={scannedDir}
        harvestStatus={harvestStatus}
        airtableStatus={airtableStatus}
        harvestData={harvestData}
        airtableData={airtableData}
      />

      <main className="app__main">
        <FindingsSummaryPanel
          findings={auditFindings}
          liveFindings={liveFindings}
          isOpen={isPanelOpen}
          isLoading={isAuditLoading}
          onToggle={() => setIsPanelOpen(v => !v)}
          onFindingClick={(msg) => { sendMessage(msg); setIsSidebarOpen(false); }}
        />
        <CorrectionsPanel
          corrections={corrections}
          isOpen={isCorrOpen}
          onToggle={() => setIsCorrOpen(v => !v)}
        />
        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          isLiveAuditRunning={isLiveAuditRunning}
          harvestData={harvestData}
          airtableData={airtableData}
          onApprove={handleApprove}
          onReject={handleReject}
          onRetry={retryMessage}
        />
        <InputBar onSend={sendMessage} isLoading={busy || isLiveAuditRunning} />
      </main>
    </div>
  );
}

export default App;
