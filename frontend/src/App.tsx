import React, { useState, useCallback, useEffect } from 'react';
import './App.css';
import { AuditFinding, Message } from './types';
import AuditSidebar from './components/AuditSidebar';
import ChatWindow from './components/ChatWindow';
import InputBar from './components/InputBar';
import FindingsSummaryPanel from './components/FindingsSummaryPanel';
import CorrectionsPanel, { Correction } from './components/CorrectionsPanel';

const API_BASE = process.env.REACT_APP_API_URL ?? '';
const CHAT_URL  = `${API_BASE}/api/chat`;
const AUDIT_URL = `${API_BASE}/api/audit`;
const UPLOAD_URL = `${API_BASE}/api/upload`;
const FILES_URL = `${API_BASE}/api/files`;
const SCAN_URL = `${API_BASE}/api/scan`;
const CORRECTIONS_URL = `${API_BASE}/api/corrections`;

interface RegisteredFile {
  filename: string;
  path?: string;
  sheets: { name: string; row_count: number; columns: string[] }[];
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  timestamp: new Date(),
  content:
    "Hi! I'm **AuditAI**, your financial audit agent. Paste a folder path in the sidebar " +
    "to scan for Excel files, and I'll cross-reference them to find and **fix** discrepancies " +
    "directly in your files.\n\nOr use the **Quick Actions** to run with the built-in sample data.",
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const DEMO_STEPS = [
  'Run a full audit on all my systems and summarize every finding organized by severity.',
  'Show me the revenue discrepancies in detail — walk me through TXN-002, TXN-004, and TXN-009.',
  'Draft the journal entry to fix the TXN-002 discount discrepancy with Sarah Mitchell.',
];

function App() {
  const [messages,        setMessages]        = useState<Message[]>([WELCOME]);
  const [isLoading,       setIsLoading]       = useState(false);
  const [auditFindings,   setAuditFindings]   = useState<AuditFinding[]>([]);
  const [isPanelOpen,     setIsPanelOpen]     = useState(false);
  const [isAuditLoading,  setIsAuditLoading]  = useState(false);
  const [isDemoRunning,   setIsDemoRunning]   = useState(false);
  const [isSidebarOpen,   setIsSidebarOpen]   = useState(false);
  const [registeredFiles, setRegisteredFiles] = useState<RegisteredFile[]>([]);
  const [isScanning,      setIsScanning]      = useState(false);
  const [scannedDir,      setScannedDir]      = useState('');
  const [corrections,     setCorrections]     = useState<Correction[]>([]);
  const [isCorrOpen,      setIsCorrOpen]      = useState(false);

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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: dir }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Scan failed' }));
        throw new Error(err.detail);
      }
      const data = await res.json();
      setRegisteredFiles(data.files ?? []);
      setScannedDir(dir);
      const count = (data.files ?? []).length;
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: 'assistant',
          timestamp: new Date(),
          content: count > 0
            ? `**Found ${count} Excel file(s) in \`${dir}\`.** These files will be read and edited in place. Try "Run Full Audit + Auto-Fix" to get started.`
            : `**No .xlsx files found in \`${dir}\`.** Check the path and try again.`,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed';
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          timestamp: new Date(),
          isError: true,
          content: `**Scan error:** ${msg}`,
        },
      ]);
    } finally {
      setIsScanning(false);
    }
  }, []);

  // ── File upload (fallback) ────────────────────────────────────────────
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
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: 'assistant',
          timestamp: new Date(),
          content: `**${files.length} file(s) uploaded.** Try "Run Full Audit + Auto-Fix" to get started.`,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          timestamp: new Date(),
          isError: true,
          content: `**Upload error:** ${msg}`,
        },
      ]);
    } finally {
      setIsScanning(false);
    }
  }, []);

  // ── Corrections polling ───────────────────────────────────────────────
  const fetchCorrections = useCallback(async () => {
    try {
      const res = await fetch(CORRECTIONS_URL);
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, context: {} }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(errData.detail ?? `HTTP ${res.status}`);
      }

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: data.reply,
          timestamp: new Date(),
          ...(data.requires_approval
            ? { approval: data.requires_approval, approvalStatus: 'pending' as const }
            : {}),
        },
      ]);
      fetchCorrections();
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown error';
      setMessages((prev) => [
        ...prev,
        {
          id:        `err-${Date.now()}`,
          role:      'assistant',
          timestamp: new Date(),
          isError:   true,
          retryText: text,
          content:
            '**Could not reach the audit server.**\n\n' +
            'Make sure the backend is running: `uvicorn main:app --reload`\n\n' +
            `_${detail}_`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [fetchCorrections]);

  const sendMessage = useCallback(
    async (text: string): Promise<void> => {
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: 'user', content: text, timestamp: new Date() },
      ]);
      await callChatAPI(text);
    },
    [callChatAPI],
  );

  const retryMessage = useCallback(
    async (errorId: string, text: string): Promise<void> => {
      setMessages((prev) => prev.filter((m) => m.id !== errorId));
      await callChatAPI(text);
    },
    [callChatAPI],
  );

  // ── Audit findings panel ──────────────────────────────────────────────
  const fetchAuditFindings = useCallback(async (): Promise<void> => {
    setIsAuditLoading(true);
    setIsPanelOpen(true);
    try {
      const res = await fetch(AUDIT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audit_type: 'all' }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setAuditFindings(data.findings ?? []);
    } catch {
      /* non-fatal */
    } finally {
      setIsAuditLoading(false);
    }
  }, []);

  const handleAuditAction = useCallback(
    (chatMessage: string) => {
      sendMessage(chatMessage);
      fetchAuditFindings();
      setIsSidebarOpen(false);
    },
    [sendMessage, fetchAuditFindings],
  );

  // ── Demo walkthrough ──────────────────────────────────────────────────
  const runDemo = useCallback(async () => {
    if (isDemoRunning || isLoading) return;
    setIsDemoRunning(true);
    setIsSidebarOpen(false);
    try {
      await sendMessage(DEMO_STEPS[0]);
      fetchAuditFindings();
      await sleep(1200);
      await sendMessage(DEMO_STEPS[1]);
      await sleep(900);
      await sendMessage(DEMO_STEPS[2]);
    } finally {
      setIsDemoRunning(false);
    }
  }, [isDemoRunning, isLoading, sendMessage, fetchAuditFindings]);

  // ── Approval flow ─────────────────────────────────────────────────────
  const handleApprove = useCallback(
    (messageId: string) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, approvalStatus: 'approved' as const } : m)),
      );
      sendMessage('I approve this correction. Please confirm it has been applied.');
    },
    [sendMessage],
  );

  const handleReject = useCallback(
    (messageId: string) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, approvalStatus: 'rejected' as const } : m)),
      );
      sendMessage(
        'I reject this correction. Let me review the details further before making any changes.',
      );
    },
    [sendMessage],
  );

  const busy = isLoading || isDemoRunning;

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
        isLoading={busy}
        isDemoRunning={isDemoRunning}
        isMobileOpen={isSidebarOpen}
        registeredFiles={registeredFiles}
        isScanning={isScanning}
        scannedDir={scannedDir}
      />

      <main className="app__main">
        <FindingsSummaryPanel
          findings={auditFindings}
          isOpen={isPanelOpen}
          isLoading={isAuditLoading}
          onToggle={() => setIsPanelOpen((v) => !v)}
          onFindingClick={(msg) => { sendMessage(msg); setIsSidebarOpen(false); }}
        />
        <CorrectionsPanel
          corrections={corrections}
          isOpen={isCorrOpen}
          onToggle={() => setIsCorrOpen((v) => !v)}
        />
        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          onApprove={handleApprove}
          onReject={handleReject}
          onRetry={retryMessage}
        />
        <InputBar onSend={sendMessage} isLoading={busy} />
      </main>
    </div>
  );
}

export default App;
