"""
OpenAI-backed chat service with multi-turn conversation history.

Conversation history is stored in module-level state (single-user dev tool).
For multi-user production use, move history into a session/DB store.
"""

import json
import os
import re
from typing import Any

from dotenv import load_dotenv
from openai import OpenAI, OpenAIError

from .audit_engine import run_inventory_audit, run_payroll_audit, run_revenue_audit

load_dotenv()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MODEL = "gpt-4o"
MAX_TOKENS = 1500
TEMPERATURE = 0.3

SYSTEM_PROMPT_TEMPLATE = """\
You are an AI audit assistant for small and mid-size businesses. You help non-experts understand and fix financial discrepancies.

You have access to audit findings from the user's connected systems (QuickBooks, Shopify, Amazon, warehouse, payroll). The findings are provided below.

Your job:
- Explain findings in plain, non-technical language
- When asked, draft specific corrections (journal entries, emails to suppliers, payroll adjustments)
- Always ask for human approval before suggesting any action that moves money, changes payroll, or contacts external parties
- Be proactive — if the user says "run an audit" or "check my books", present the findings organized by severity
- Use the company name "FreshGlow Skincare" and reference specific transaction IDs, employee names, and SKUs from the data

Format your responses with clear sections. Use markdown. Be concise but thorough.

## Correction Approval Format

When recommending a specific corrective action that moves money, adjusts payroll, or requires contacting an external party, you MUST append a structured approval block at the very end of your response using this exact format:

APPROVAL_REQUIRED: [one-sentence description, e.g. "Reduce QuickBooks entry for TXN-002 by $200.00 to match Shopify invoice SH-4502"]
ACCOUNTS_AFFECTED: [comma-separated accounts/systems, e.g. "Accounts Receivable, Shopify Revenue"]
AMOUNT: [dollar amount with sign, e.g. "-$200.00" or "+$720.00"]

Rules:
- Place the block at the very end of your response, with no text after it
- Each field must be on its own line with NO blank lines between the three lines
- Only one block per response — if multiple corrections are needed, ask the user which to address first
- Do NOT include the block for informational or analytical responses — only when proposing a single actionable correction

## Current Audit Findings

```json
{findings_json}
```
"""

# ---------------------------------------------------------------------------
# Approval block parsing
# ---------------------------------------------------------------------------

_RE_ACTION   = re.compile(r'^APPROVAL_REQUIRED:\s*(.+)$',   re.MULTILINE)
_RE_ACCOUNTS = re.compile(r'^ACCOUNTS_AFFECTED:\s*(.+)$',   re.MULTILINE)
_RE_AMOUNT   = re.compile(r'^AMOUNT:\s*(.+)$',              re.MULTILINE)
# Strips all three marker lines (and any leading blank line before the block)
_RE_STRIP    = re.compile(
    r'\n*^(APPROVAL_REQUIRED|ACCOUNTS_AFFECTED|AMOUNT):\s*.+$',
    re.MULTILINE,
)


def _parse_approval(text: str) -> tuple[str, dict | None]:
    """
    Extracts the APPROVAL_REQUIRED block from GPT output.
    Returns (cleaned_text_without_markers, approval_dict | None).
    The cleaned text is stored in conversation history so future turns
    don't see the raw markup.
    """
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

# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

_client: OpenAI | None = None
conversation_history: list[dict[str, str]] = []


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_client() -> OpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError(
                "OPENAI_API_KEY is not set. Add it to your .env file or environment."
            )
        _client = OpenAI(api_key=api_key)
    return _client


def _load_all_findings() -> dict[str, list]:
    return {
        "revenue": run_revenue_audit(),
        "inventory": run_inventory_audit(),
        "payroll": run_payroll_audit(),
    }


def _build_system_message(extra_context: dict[str, Any]) -> str:
    """
    Always loads fresh findings. Merges any extra_context from the frontend
    (e.g. current page, selected finding) into the JSON block.
    """
    findings = _load_all_findings()
    payload: dict[str, Any] = {"audit_findings": findings}
    if extra_context:
        payload["frontend_context"] = extra_context
    return SYSTEM_PROMPT_TEMPLATE.format(
        findings_json=json.dumps(payload, indent=2)
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def reset_history() -> None:
    """Clear conversation history (e.g. when user starts a new session)."""
    global conversation_history
    conversation_history = []


def get_history() -> list[dict[str, str]]:
    return list(conversation_history)


def chat(message: str, context: dict[str, Any]) -> dict[str, Any]:
    """
    Send a message and get a reply from GPT-4o.

    - Loads all audit findings fresh on every call so GPT always has current data.
    - Maintains full conversation history for multi-turn context.
    - Returns the reply text plus token usage stats.
    """
    client = _get_client()

    # Append user message to history
    conversation_history.append({"role": "user", "content": message})

    # Build messages: system (with findings) + full history
    messages: list[dict[str, str]] = [
        {"role": "system", "content": _build_system_message(context)},
        *conversation_history,
    ]

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            max_tokens=MAX_TOKENS,
            temperature=TEMPERATURE,
        )
    except OpenAIError as exc:
        # Roll back the user message so the broken turn isn't stored
        conversation_history.pop()
        raise exc

    raw_reply: str = response.choices[0].message.content or ""

    # Strip approval markers before storing in history so future turns
    # don't see the raw structured block.
    cleaned_reply, approval = _parse_approval(raw_reply)

    conversation_history.append({"role": "assistant", "content": cleaned_reply})

    return {
        "reply": cleaned_reply,
        "model": response.model,
        "usage": {
            "prompt_tokens": response.usage.prompt_tokens,
            "completion_tokens": response.usage.completion_tokens,
            "total_tokens": response.usage.total_tokens,
        },
        "history_length": len(conversation_history),
        "requires_approval": approval,
    }
