import React, { useState, useCallback, useEffect } from 'react';
import './App.css';
import { AuditFinding, Message } from './types';
import AuditSidebar from './components/AuditSidebar';
import ChatWindow from './components/ChatWindow';
import InputBar from './components/InputBar';
import FindingsSummaryPanel from './components/FindingsSummaryPanel';
import CorrectionsPanel, { Correction } from './components/CorrectionsPanel';

const API_BASE = 'http://localhost:8000';
const CHAT_URL  = `${API_BASE}/api/chat`;
const AUDIT_URL = `${API_BASE}/api/audit`;
const UPLOAD_URL = `${API_BASE}/api/upload`;
const FILES_URL = `${API_BASE}/api/files`;
const CORRECTIONS_URL = `${API_BASE}/api/corrections`;

interface UploadedFile {
  filename: string;
  sheets: { name: string; row_count: number; columns: string[] }[];
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  timestamp: new Date(),
  content:
    "Hi! I'm **AuditAI**, your financial audit agent. Upload your Excel spreadsheets " +
    "(QuickBooks, Shopify/Amazon invoices, inventory, payroll) using the sidebar, and I'll " +
    "cross-reference them to find discrepancies.\n\nOr use the **Quick Actions** to run with the built-in sample data.",
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const DEMO_STEPS = [
  'Run a full audit on all my systems and summarize every finding organized by severity.',
  'Show me the revenue discrepancies in detail — walk me through TXN-002, TXN-004, and TXN-009.',
  'Draft the journal entry to fix the TXN-002 discount discrepancy with Sarah Mitchell.',
];

function App() {
  const [messages,       setMessages]       = useState<Message[]>([WELCOME]);
  const [isLoading,      setIsLoading]      = useState(false);
  const [auditFindings,  setAuditFindings]  = useState<AuditFinding[]>([]);
  const [isPanelOpen,    setIsPanelOpen]    = useState(false);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [isDemoRunning,  setIsDemoRunning]  = useState(false);
  const [isSidebarOpen,  setIsSidebarOpen]  = useState(false);
  const [uploadedFiles,  setUploadedFiles]  = useState<UploadedFile[]>([]);
  const [isUploading,    setIsUploading]    = useState(false);
  const [corrections,    setCorrections]    = useState<Correction[]>([]);
  const [isCorrOpen,     setIsCorrOpen]     = useState(false);

  // Fetch existing uploaded files on mount
  useEffect(() => {
    fetch(FILES_URL)
      .then((r) => r.json())
      .then((data) => setUploadedFiles(data.files ?? []))
      .catch(() => {});
  }, []);

  // ── File upload ─────────────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (files: FileList) => {
    setIsUploading(true);
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
        setUploadedFiles(data.files ?? []);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: 'assistant',
          timestamp: new Date(),
          content:
            `**${files.length} file(s) uploaded successfully.** I can now analyze your data. ` +
            'Try "Run Full Audit" or ask me anything about your financials.',
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
      setIsUploading(false);
    }
  }, []);

  const handleFileDelete = useCallback(async (filename: string) => {
    try {
      await fetch(`${FILES_URL}/${filename}`, { method: 'DELETE' });
      setUploadedFiles((prev) => prev.filter((f) => f.filename !== filename));
    } catch {
      /* non-fatal */
    }
  }, []);

  // ── Corrections polling ──────────────────────────────────────────────
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
      /* panel fetch failures are non-fatal */
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
        onFileUpload={handleFileUpload}
        onFileDelete={handleFileDelete}
        isLoading={busy}
        isDemoRunning={isDemoRunning}
        isMobileOpen={isSidebarOpen}
        uploadedFiles={uploadedFiles}
        isUploading={isUploading}
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
