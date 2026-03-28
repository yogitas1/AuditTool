# Audit Agent Hackathon — Updated Prompt Sequence
## Excel Upload + Portal Architecture

---

## What Changed From the Previous Plan

- **No more hidden JSON mock data.** The agent reads real Excel files that the user uploads.
- **New portal page** where users either connect external systems (future) or upload Excel files (now).
- **The agent is truly agentic** — it parses the spreadsheets, discovers the schema, cross-references across files, and makes decisions. Judges see the agent *reading* real data.
- **4 sample Excel files** are provided (already created) with intentional discrepancies baked in.

---

## The 4 Sample Excel Files

Upload these during the demo. Each simulates a real export:

| File | Simulates | Sheets | Key Discrepancies |
|------|-----------|--------|-------------------|
| `quickbooks_revenue_march2026.xlsx` | QuickBooks revenue report | Revenue Transactions | TXN-002: $2,340 recorded (should be $2,140 after discount) |
| `sales_channel_invoices_march2026.xlsx` | Shopify + Amazon exports | Shopify Orders, Amazon Orders | SH-4502 shows $200 discount + $2,140 final. AMZ-9903 booked to April instead of March |
| `inventory_report_march2026.xlsx` | Warehouse inventory | Inventory Snapshot, Purchase Orders | HA-SERUM-50: 40-unit gap. PO-2847: ordered 500, received 460 |
| `payroll_report_march2026.xlsx` | Gusto payroll export | Employee Roster, March 2026 Payroll, GL Reconciliation | Jake Moreno terminated but paid $3,200. Sara Kim misclassification. Aisha wrong SDI rate. GL gap = $3,200 |

---

## APIs Needed

| API | Purpose | Cost |
|-----|---------|------|
| **OpenAI GPT-4o** | Audit reasoning, plain-language explanations, correction drafting | ~$0.50 for entire demo |
| **openpyxl** (Python library) | Read uploaded Excel files server-side | Free |
| *Optional:* **Resend / SendGrid** | Send the supplier inquiry email for real | Free tier |

That's it. No QuickBooks API, no OAuth, no sandbox tokens.

---

## Pre-work (Before Hackathon)

```bash
mkdir audit-agent && cd audit-agent
npx create-react-app frontend --template typescript
mkdir -p backend/uploads backend/services
cd backend && python -m venv venv && source venv/bin/activate
pip install fastapi uvicorn openai python-dotenv pydantic openpyxl python-multipart
```

Create `.env`:
```
OPENAI_API_KEY=sk-...
```

---

## Claude Code Prompt Sequence

### PROMPT 1: Portal landing page (20 min)

```
Build a React landing page for an audit agent app called "AuditAI". This is the first page users see.

Layout:
- Clean header with logo text "AuditAI" and tagline "Self-audit your business in minutes"
- Main area has two sections side by side:

LEFT SECTION: "Connect your systems" (grayed out, coming soon)
- Shows a grid of system logos/cards: QuickBooks, Shopify, Amazon, Gusto, ShipBob
- Each card has a "Connect" button that is DISABLED with a "Coming soon" badge
- This section exists to show the VISION but is not functional yet

RIGHT SECTION: "Upload your reports" (this is the functional path)
- Drag-and-drop upload zone that accepts .xlsx files
- Shows 4 upload slots with labels:
  1. "Revenue report" (e.g., QuickBooks export)
  2. "Sales channel invoices" (e.g., Shopify/Amazon export)
  3. "Inventory report" (e.g., warehouse export)
  4. "Payroll report" (e.g., Gusto export)
- Each slot shows the filename + green check after upload
- A prominent "Start Audit" button at the bottom that is enabled only when at least 1 file is uploaded
- Clicking "Start Audit" navigates to the chat interface with files sent to backend

Upload API: POST /api/upload with multipart form data for each file
Use react-router-dom for navigation between portal and chat pages

Style: Professional, minimal, white background, subtle blue accents (#1B4F72). Make it look like a real SaaS product, not a hackathon project.
```

### PROMPT 2: Backend file processing engine (30 min)

```
Build the FastAPI backend with Excel file processing. This is the core agentic part — the agent reads real Excel files and makes audit decisions.

Structure:
- backend/main.py — FastAPI app with CORS, file upload endpoints
- backend/services/excel_reader.py — reads uploaded Excel files using openpyxl
- backend/services/audit_engine.py — cross-references data across files and finds discrepancies

FILE UPLOAD ENDPOINT:
POST /api/upload — accepts multiple .xlsx files via multipart form data
- Saves files to backend/uploads/
- Returns list of uploaded filenames

EXCEL READER (excel_reader.py):
Create functions that read each Excel file type and return structured data:

1. read_revenue_report(filepath) -> dict
   - Reads the "Revenue Transactions" sheet
   - Returns list of transactions with: id, date, customer, amount, channel, description

2. read_invoices(filepath) -> dict
   - Reads BOTH "Shopify Orders" and "Amazon Orders" sheets
   - Returns Shopify invoices (with discount info) and Amazon orders (with date_booked field)

3. read_inventory(filepath) -> dict
   - Reads "Inventory Snapshot" sheet: sku, name, category, system_count, expected_count, unit_cost
   - Reads "Purchase Orders" sheet: po_id, supplier, sku, ordered_qty, received_qty, invoice_amount

4. read_payroll(filepath) -> dict
   - Reads "Employee Roster" sheet: id, name, type, status, termination_date, hours, uses_company_equipment
   - Reads "March 2026 Payroll" sheet: id, name, gross_pay, federal_tax, state_tax, sdi, sdi_rate, correct_sdi_rate
   - Reads "GL Reconciliation" sheet: extracts GL total and payroll total

IMPORTANT: Use openpyxl load_workbook with data_only=True to read calculated values.
Handle empty cells, "N/A" strings, and missing sheets gracefully.
Log what the agent reads — print statements like "Reading 10 transactions from Revenue sheet..." so we can show the agent actively processing files.

AUDIT ENGINE (audit_engine.py):
These functions take the parsed data and find discrepancies:

1. audit_revenue(revenue_data, invoice_data) -> list[Finding]
   - For each revenue transaction, match by QB Reference
   - Compare amounts: if QB amount != invoice final amount, flag it
   - For Amazon orders: compare order_date vs date_booked — if different months, flag period error
   - Return findings with: type, severity, description, amount_impact, affected_records

2. audit_inventory(inventory_data) -> list[Finding]
   - Compare system_count vs expected_count for each SKU
   - Prioritize by ABC category (A first)
   - Check PO: ordered vs received qty, calculate overpayment
   - Return findings with dollar impact

3. audit_payroll(payroll_data) -> list[Finding]
   - Check employee roster for terminated + still paid
   - Flag contractors with 40hrs/week + company equipment + >12 months
   - Compare SDI rates (sdi_rate vs correct_sdi_rate)
   - Compare GL total vs payroll total — flag discrepancy
   - BONUS: if ghost employee payment matches GL gap, note the connection

AUDIT ENDPOINT:
POST /api/audit — accepts {"audit_type": "revenue"|"inventory"|"payroll"|"all"}
- Reads the uploaded files from backend/uploads/
- Runs the appropriate audit functions
- Returns structured findings

Each Finding should be a Pydantic model:
{
  "id": "R-001",
  "audit_type": "revenue",
  "severity": "high",
  "title": "Amount mismatch: TXN-002",
  "description": "QuickBooks shows $2,340 but Shopify invoice SH-4502 shows final amount of $2,140. A $200 discount was applied at checkout but not reflected in the accounting entry.",
  "amount_impact": 200.00,
  "affected_records": ["TXN-002", "SH-4502"],
  "recommended_action": "Create journal entry to adjust TXN-002 by -$200.00",
  "requires_approval": true
}
```

### PROMPT 3: OpenAI agentic layer (25 min)

```
Wire up OpenAI GPT-4o to make the audit agent conversational and agentic. The key insight: the agent has ALREADY read the Excel files and found discrepancies. GPT's job is to explain findings in plain English, answer follow-up questions, and draft corrections.

POST /api/chat endpoint:
Accepts: { "message": string, "conversation_history": list[dict] }
Returns: { "response": string, "findings_referenced": list[str], "requires_approval": bool, "approval_action": string | null }

How it works:
1. Load all audit findings (run all audit functions on uploaded files)
2. Build a system prompt that includes:
   - The agent's role and personality
   - ALL raw audit findings as structured context
   - The actual data from the Excel files (key rows, not all data)
   
3. System prompt:

"""
You are AuditAI, an AI audit assistant for small and mid-size businesses that don't have internal audit teams. You help non-experts understand and fix financial discrepancies.

You have READ the following Excel files uploaded by the user and found these discrepancies:
{findings_json}

Here is the key data you extracted from their files:
{summary_of_data}

RULES:
- Explain everything in plain, non-technical language. The user is a finance manager, not an auditor.
- Reference specific transaction IDs, employee names, dollar amounts, and SKUs from the actual data.
- When you recommend a correction, format it as:
  APPROVAL_REQUIRED: [what will change]
  ACCOUNTS: [affected accounts]  
  AMOUNT: [dollar amount]
  This triggers an approval card in the UI.
- NEVER claim you can auto-execute changes. Always ask for approval.
- When findings are connected across audit types (e.g., ghost employee payment = GL discrepancy), proactively point this out.
- If asked "run a full audit" or similar, present ALL findings organized by type (Revenue, Inventory, Payroll) with severity tags.
- Be proactive: suggest what the user should look at next.
- Use the company name from the data. If not found, use "your company."
"""

4. Send conversation_history + new message + system prompt to GPT-4o
5. Parse the response for APPROVAL_REQUIRED patterns
6. Return the response with metadata

Use gpt-4o model, temperature 0.3 (more deterministic for financial data), max_tokens 1500.
Maintain conversation history on the frontend and send it with each request.
```

### PROMPT 4: Chat interface with file context (25 min)

```
Build the chat page that users land on after uploading files. This replaces the simple chat from before — it now shows what files were uploaded and what the agent found.

Layout:
- LEFT SIDEBAR (280px):
  - "AuditAI" logo/header
  - "Uploaded files" section showing the 4 files with green checkmarks and filenames
  - "Quick actions" buttons:
    - "Run Full Audit" -> sends "Run a full audit on all my uploaded files"
    - "Revenue Check" -> sends "Analyze my revenue report and sales invoices for discrepancies"  
    - "Inventory Check" -> sends "Check my inventory report for discrepancies and PO mismatches"
    - "Payroll Check" -> sends "Audit my payroll report for ghost employees, misclassification, and tax errors"
  - "Back to Portal" link at bottom

- MAIN AREA:
  - Findings summary panel (collapsible) at top — appears after first audit run
    - Total findings count with severity badges
    - Grouped by Revenue / Inventory / Payroll
    - Each finding clickable -> sends detail request to chat
    - Total financial impact displayed
  - Chat window below with:
    - Agent messages (left, markdown rendered with react-markdown)
    - User messages (right, blue bubbles)
    - Loading indicator (3 bouncing dots)
    - Input bar at bottom

WELCOME MESSAGE on load:
"I've received your files:
- **Revenue report** — 10 transactions from March 2026
- **Sales invoices** — 6 Shopify orders + 3 Amazon orders
- **Inventory report** — 8 SKUs + 3 purchase orders
- **Payroll report** — 8 employees + GL reconciliation data

I'm ready to audit. Click 'Run Full Audit' or ask me to check a specific area."

This message should be generated by actually reading the file metadata from the backend (GET /api/files/summary endpoint that returns row counts per file/sheet).

APPROVAL CARDS:
When agent response contains "APPROVAL_REQUIRED:", parse it and render an ApprovalCard:
- Amber/yellow banner with "Proposed correction"
- Action description
- Affected accounts
- Dollar amount
- "Approve" (green) and "Reject" (red) buttons
- Approve sends "I approve: [action description]"
- Reject sends "I reject this correction, let me review further"
```

### PROMPT 5: Agent processing visualization (20 min)

```
Add a real-time "agent thinking" visualization that shows the agent actively reading the Excel files. This is the key hackathon differentiator — judges see the agent working, not just returning results.

When the user triggers an audit (clicks a button or asks), before showing results, show a step-by-step progress panel:

AGENT PROCESSING PANEL (replaces loading dots for audit requests):
A card that appears in the chat showing steps with animated checkmarks:

For "Run Full Audit":
1. ⏳ Reading quickbooks_revenue_march2026.xlsx... → ✅ Found 10 transactions ($40,480 total)
2. ⏳ Reading sales_channel_invoices_march2026.xlsx... → ✅ Loaded 6 Shopify + 3 Amazon orders  
3. ⏳ Cross-referencing revenue against invoices... → ✅ Matched 9/10, found 2 discrepancies
4. ⏳ Reading inventory_report_march2026.xlsx... → ✅ 8 SKUs, 3 purchase orders loaded
5. ⏳ Running digital reconciliation... → ✅ Found 2 inventory gaps
6. ⏳ Matching POs to receiving logs... → ✅ 1 supplier shortfall detected
7. ⏳ Reading payroll_report_march2026.xlsx... → ✅ 8 employees, 3 GL entries loaded
8. ⏳ Scanning for ghost employees... → ✅ 1 terminated employee still on payroll
9. ⏳ Checking contractor classifications... → ✅ 1 potential misclassification
10. ⏳ Reconciling payroll to general ledger... → ✅ $3,200 discrepancy found
11. ⏳ Generating audit report... → ✅ Complete — 7 findings across 3 audit types

Each step should animate in sequence with a ~300ms delay between steps.
The spinner (⏳) should be an actual CSS animated spinner, and the checkmark (✅) should be a green SVG checkmark.

Implementation:
- Create a POST /api/audit/stream endpoint that returns Server-Sent Events (SSE)
- Each step sends an event with: { step: number, status: "processing" | "complete", message: string }
- Backend actually reads the files step by step and sends progress
- Frontend renders each step as it arrives

This is the "wow" moment in the demo. The audience sees the agent actively reading their spreadsheets in real time.
```

### PROMPT 6: Polish + demo mode (20 min)

```
Final polish for hackathon presentation:

1. DEMO MODE: Add a "Run Demo" button in the sidebar that:
   - Auto-uploads the 4 sample Excel files (pre-loaded in public/ folder)
   - Triggers "Run Full Audit" automatically
   - After results show, sends "Tell me about the revenue discrepancy in TXN-002"
   - Then sends "Can you draft the correction?"
   - This lets you do a hands-free 2-minute demo

2. PORTAL POLISH:
   - Add a subtle animation when files are dropped in the upload zone
   - Show file size next to filename after upload
   - Add a "Use sample data" link below the upload area that pre-loads the 4 Excel files
   - Progress bar during file upload

3. CHAT POLISH:
   - Smooth scroll to bottom on new messages
   - Timestamps on messages
   - Copy button on agent messages
   - "New audit" button that clears chat and returns to portal

4. RESPONSIVE: Make the sidebar collapsible on smaller screens

5. ERROR HANDLING:
   - Wrong file format uploaded -> "Please upload .xlsx files only"
   - Missing required sheets in Excel -> "This file doesn't look like a revenue report. I expected a 'Revenue Transactions' sheet."
   - OpenAI API failure -> friendly retry message
   - Backend down -> "Unable to connect to AuditAI. Please try again."

6. BRANDING:
   - Consistent #1B4F72 dark blue for headers
   - Use a simple SVG shield/checkmark icon as the logo
   - Footer: "AuditAI — Built for businesses without audit teams"
```

---

## Updated Time Budget

| Phase | Prompt | Time |
|-------|--------|------|
| Portal landing page | Prompt 1 | 20 min |
| Backend Excel processing + audit engine | Prompt 2 | 30 min |
| OpenAI agentic layer | Prompt 3 | 25 min |
| Chat interface with file context | Prompt 4 | 25 min |
| Agent processing visualization (SSE) | Prompt 5 | 20 min |
| Polish + demo mode | Prompt 6 | 20 min |
| Testing + bug fixes | — | 30 min |
| Presentation prep | — | 30 min |
| **Total** | | **~3.5 hrs** |

---

## Updated Demo Script

1. **Open the portal.** "This is AuditAI. Companies can either connect their live systems — that's our roadmap — or upload Excel exports right now."
2. **Upload 4 files** (or click "Use sample data"). "These are real exports from QuickBooks, Shopify, Amazon, and Gusto."
3. **Click Start Audit → Run Full Audit.** Watch the processing steps animate in real time. "The agent is reading each spreadsheet, cross-referencing across files, and finding discrepancies."
4. **Review findings dashboard.** "7 findings across revenue, inventory, and payroll. $X,XXX total financial impact."
5. **Click the TXN-002 revenue finding.** The agent explains in plain English: the discount wasn't reflected in QuickBooks.
6. **Ask "Can you fix this?"** Agent drafts the journal entry. Click Approve.
7. **Ask about payroll.** Agent finds the ghost employee. **Key moment:** "Notice how the $3,200 ghost payment is exactly the amount that explains the GL discrepancy. The agent connected those findings automatically."
8. **Close with:** "Every audit tool on the market assumes you already have auditors. We're the first tool for the 6 million small businesses that don't."

---

## Key Talking Points for Judges

- **The agent reads real spreadsheets.** Not mock data, not hardcoded responses. Upload any correctly-formatted Excel file and it works.
- **Cross-file intelligence.** The agent doesn't just check one file — it cross-references revenue against invoices, POs against receiving logs, payroll against the general ledger. That's what makes it an audit, not a spreadsheet checker.
- **Connected findings.** The ghost employee payment ($3,200) perfectly explains the GL discrepancy ($3,200). The agent discovers and explains this connection. Single-domain tools miss this.
- **Human-in-the-loop.** The agent finds, explains, and drafts everything automatically. But it never moves money without approval. That's what makes it trustworthy.
- **Portal = roadmap.** The grayed-out "Connect your systems" section shows judges where this goes — direct QuickBooks/Shopify/Gusto integrations. Excel upload is the MVP; live connections are the product.
