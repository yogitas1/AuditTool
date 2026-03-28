"""
OpenAI function-calling audit agent.

The agent has tools to:
  1. list uploaded files
  2. inspect / summarize a workbook
  3. parse & load Excel data into the audit engine
  4. run any combination of audits (revenue / inventory / payroll)

All state (uploaded file paths, parsed data cache, conversation history)
is held at module level — fine for a single-user dev tool.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from openai import OpenAI

from .audit_engine import run_inventory_audit, run_payroll_audit, run_revenue_audit
from .excel_reader import (
    classify_workbook,
    parse_inventory,
    parse_payroll,
    parse_quickbooks,
    parse_sales_channels,
    summarize_workbook,
)

load_dotenv()

# ── config ───────────────────────────────────────────────────────────────

MODEL = "gpt-4o"
MAX_TOKENS = 2000
TEMPERATURE = 0.2
UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# ── tool definitions (OpenAI function-calling schema) ────────────────────

TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "list_uploaded_files",
            "description": "List all Excel files that have been uploaded for auditing.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "inspect_file",
            "description": (
                "Inspect an uploaded Excel file — returns sheet names, "
                "column headers, and row counts so you can decide how to use it."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "filename": {
                        "type": "string",
                        "description": "Name of the uploaded file (e.g. 'payroll_report_march2026.xlsx')",
                    }
                },
                "required": ["filename"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "load_and_audit",
            "description": (
                "Parse one or more uploaded Excel files and run the appropriate "
                "audit checks (revenue, inventory, payroll, or all). "
                "Returns the full list of audit findings."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "audit_type": {
                        "type": "string",
                        "enum": ["revenue", "inventory", "payroll", "all"],
                        "description": "Which audit to run.",
                    },
                },
                "required": ["audit_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_excel_data",
            "description": (
                "Read raw row data from a specific sheet inside an uploaded "
                "Excel file. Useful for answering detailed questions about "
                "specific transactions, employees, or inventory items."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "filename": {
                        "type": "string",
                        "description": "Name of the uploaded file.",
                    },
                    "sheet_name": {
                        "type": "string",
                        "description": "Sheet to read (optional — reads first sheet if omitted).",
                    },
                },
                "required": ["filename"],
            },
        },
    },
]

# ── module-level state ───────────────────────────────────────────────────

_client: OpenAI | None = None
conversation_history: list[dict[str, Any]] = []
_parsed_cache: dict[str, dict] = {}

SYSTEM_PROMPT = """\
You are **AuditAI**, an expert financial audit agent for small and mid-size businesses.

You have access to tools that let you read and analyze Excel workbooks uploaded
by the user.  Your workflow:

1. When files are uploaded, **inspect** them to understand their structure.
2. **Load and audit** the data — the audit engine will cross-reference revenue
   records with sales channel invoices, check inventory counts against purchase
   orders, and validate payroll against GL entries.
3. **Present findings** clearly, grouped by severity (high → medium → low).
4. **Answer follow-up questions** by reading raw data from the sheets.
5. When recommending corrective actions that move money or change payroll,
   **always ask for human approval first**.

Tone: professional but approachable; use plain language; reference specific
transaction IDs, employee names, and SKUs from the data.

Use markdown formatting.  Be concise but thorough.

## Correction Approval Format

When recommending a corrective action, append this block at the very end:

APPROVAL_REQUIRED: [one-sentence description]
ACCOUNTS_AFFECTED: [comma-separated]
AMOUNT: [dollar amount with sign]

Only one block per response.  Only for actionable corrections, not informational answers.
"""

# ── internal helpers ─────────────────────────────────────────────────────

def _get_client() -> OpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is not set.")
        _client = OpenAI(api_key=api_key)
    return _client


def _uploaded_files() -> list[Path]:
    return sorted(UPLOAD_DIR.glob("*.xlsx"))


def _resolve(filename: str) -> Path:
    p = UPLOAD_DIR / filename
    if not p.exists():
        raise FileNotFoundError(f"File not found: {filename}")
    return p


def _load_all_excel_data() -> dict[str, dict]:
    """Classify and parse every uploaded file; cache results."""
    if _parsed_cache:
        return _parsed_cache

    for fp in _uploaded_files():
        cat = classify_workbook(fp)
        if cat == "quickbooks":
            _parsed_cache["quickbooks"] = parse_quickbooks(fp)
        elif cat == "sales_channels":
            shopify, amazon = parse_sales_channels(fp)
            _parsed_cache["shopify"] = shopify
            _parsed_cache["amazon"] = amazon
        elif cat == "inventory":
            _parsed_cache["inventory"] = parse_inventory(fp)
        elif cat == "payroll":
            _parsed_cache["payroll"] = parse_payroll(fp)
    return _parsed_cache


def _run_audit(audit_type: str) -> list[dict]:
    data = _load_all_excel_data()

    qb = data.get("quickbooks")
    shopify = data.get("shopify")
    amazon = data.get("amazon")
    inv = data.get("inventory")
    pay = data.get("payroll")

    findings: list[dict] = []
    if audit_type in ("revenue", "all"):
        rev = run_revenue_audit(qb_data=qb, shopify_data=shopify, amazon_data=amazon)
        findings.extend({"_audit": "revenue", **f} for f in rev)
    if audit_type in ("inventory", "all"):
        inv_f = run_inventory_audit(inv_data=inv)
        findings.extend({"_audit": "inventory", **f} for f in inv_f)
    if audit_type in ("payroll", "all"):
        pay_f = run_payroll_audit(pay_data=pay)
        findings.extend({"_audit": "payroll", **f} for f in pay_f)
    return findings


# ── tool dispatch ────────────────────────────────────────────────────────

def _handle_tool_call(name: str, args: dict) -> str:
    """Execute a tool and return the JSON-serialised result."""
    if name == "list_uploaded_files":
        files = _uploaded_files()
        if not files:
            return json.dumps({"files": [], "message": "No files uploaded yet."})
        summaries = [summarize_workbook(f) for f in files]
        return json.dumps({"files": summaries})

    if name == "inspect_file":
        fp = _resolve(args["filename"])
        return json.dumps(summarize_workbook(fp))

    if name == "load_and_audit":
        findings = _run_audit(args["audit_type"])
        return json.dumps({
            "audit_type": args["audit_type"],
            "total_findings": len(findings),
            "findings": findings,
        }, default=str)

    if name == "read_excel_data":
        from openpyxl import load_workbook as _load_wb
        fp = _resolve(args["filename"])
        wb = _load_wb(fp, data_only=True, read_only=True)
        sheet = args.get("sheet_name")
        ws = wb[sheet] if sheet and sheet in wb.sheetnames else wb.worksheets[0]
        rows = list(ws.iter_rows(values_only=True))
        wb.close()
        if not rows:
            return json.dumps({"rows": []})
        headers = [str(h or "") for h in rows[0]]
        data_rows = [dict(zip(headers, [str(v) if v is not None else "" for v in r])) for r in rows[1:] if any(v is not None for v in r)]
        return json.dumps({"sheet": ws.title, "row_count": len(data_rows), "rows": data_rows}, default=str)

    return json.dumps({"error": f"Unknown tool: {name}"})


# ── approval parsing (same logic as chat_service) ────────────────────────

_RE_ACTION   = re.compile(r'^APPROVAL_REQUIRED:\s*(.+)$',   re.MULTILINE)
_RE_ACCOUNTS = re.compile(r'^ACCOUNTS_AFFECTED:\s*(.+)$',   re.MULTILINE)
_RE_AMOUNT   = re.compile(r'^AMOUNT:\s*(.+)$',              re.MULTILINE)
_RE_STRIP    = re.compile(
    r'\n*^(APPROVAL_REQUIRED|ACCOUNTS_AFFECTED|AMOUNT):\s*.+$',
    re.MULTILINE,
)


def _parse_approval(text: str) -> tuple[str, dict | None]:
    action_m = _RE_ACTION.search(text)
    if not action_m:
        return text, None
    accounts_m = _RE_ACCOUNTS.search(text)
    amount_m   = _RE_AMOUNT.search(text)
    approval = {
        "action":            action_m.group(1).strip(),
        "accounts_affected": accounts_m.group(1).strip() if accounts_m else "",
        "amount":            amount_m.group(1).strip()   if amount_m   else "",
    }
    cleaned = _RE_STRIP.sub("", text).strip()
    return cleaned, approval


# ── public API ───────────────────────────────────────────────────────────

def reset():
    """Clear conversation history and parsed data cache."""
    global conversation_history, _parsed_cache
    conversation_history = []
    _parsed_cache = {}


def invalidate_cache():
    """Force re-parse of Excel files on next audit (e.g. after new upload)."""
    global _parsed_cache
    _parsed_cache = {}


def get_history() -> list[dict[str, str]]:
    return [m for m in conversation_history if m["role"] in ("user", "assistant")]


def get_uploaded_file_summaries() -> list[dict]:
    return [summarize_workbook(f) for f in _uploaded_files()]


def chat(message: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Send a user message through the agent loop.

    The agent may invoke tools (inspect files, run audits, read data) before
    composing its final answer.  Returns the same shape as the original
    chat_service so the frontend stays compatible.
    """
    client = _get_client()

    conversation_history.append({"role": "user", "content": message})

    system_content = SYSTEM_PROMPT
    if context:
        system_content += f"\n\n## Additional Context\n```json\n{json.dumps(context)}\n```"

    file_list = _uploaded_files()
    if file_list:
        names = ", ".join(f.name for f in file_list)
        system_content += f"\n\nUploaded files available: {names}"

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_content},
        *conversation_history,
    ]

    max_rounds = 8
    total_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    model_name = MODEL

    for _ in range(max_rounds):
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            max_tokens=MAX_TOKENS,
            temperature=TEMPERATURE,
        )

        model_name = response.model
        if response.usage:
            total_usage["prompt_tokens"] += response.usage.prompt_tokens
            total_usage["completion_tokens"] += response.usage.completion_tokens
            total_usage["total_tokens"] += response.usage.total_tokens

        choice = response.choices[0]

        if choice.finish_reason == "tool_calls" or choice.message.tool_calls:
            messages.append(choice.message)

            for tc in choice.message.tool_calls:
                fn_name = tc.function.name
                fn_args = json.loads(tc.function.arguments)
                result = _handle_tool_call(fn_name, fn_args)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })
            continue

        raw_reply = choice.message.content or ""
        cleaned, approval = _parse_approval(raw_reply)
        conversation_history.append({"role": "assistant", "content": cleaned})

        return {
            "reply": cleaned,
            "model": model_name,
            "usage": total_usage,
            "history_length": len(conversation_history),
            "requires_approval": approval,
        }

    fallback = "I wasn't able to complete the analysis within the allowed steps. Please try a more specific question."
    conversation_history.append({"role": "assistant", "content": fallback})
    return {
        "reply": fallback,
        "model": model_name,
        "usage": total_usage,
        "history_length": len(conversation_history),
        "requires_approval": None,
    }
