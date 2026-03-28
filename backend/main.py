from typing import Any, Literal

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAIError
from pydantic import BaseModel

from services.audit_engine import run_inventory_audit, run_payroll_audit, run_revenue_audit
from services import chat_service, audit_agent

app = FastAPI(title="Audit Agent API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class AuditRequest(BaseModel):
    audit_type: Literal["revenue", "inventory", "payroll", "all"]


class AuditFinding(BaseModel):
    type: str
    severity: Literal["high", "medium", "low"]
    explanation: str
    model_config = {"extra": "allow"}


class AuditResponse(BaseModel):
    audit_type: str
    total_findings: int
    findings_by_severity: dict[str, int]
    findings: list[dict[str, Any]]


class ChatRequest(BaseModel):
    message: str
    context: dict[str, Any] = {}


class TokenUsage(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class ApprovalData(BaseModel):
    action: str
    accounts_affected: str
    amount: str


class ChatResponse(BaseModel):
    reply: str
    model: str | None = None
    usage: TokenUsage | None = None
    history_length: int = 0
    requires_approval: ApprovalData | None = None


class HistoryResponse(BaseModel):
    history: list[dict[str, str]]
    history_length: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def severity_counts(findings: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {"high": 0, "medium": 0, "low": 0}
    for f in findings:
        sev = f.get("severity", "low")
        counts[sev] = counts.get(sev, 0) + 1
    return counts


def build_response(audit_type: str, findings: list[dict]) -> AuditResponse:
    return AuditResponse(
        audit_type=audit_type,
        total_findings=len(findings),
        findings_by_severity=severity_counts(findings),
        findings=findings,
    )


# ---------------------------------------------------------------------------
# File upload routes
# ---------------------------------------------------------------------------

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Accept an Excel file upload and save it to the uploads directory."""
    if not file.filename or not file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files are supported.")

    dest = audit_agent.UPLOAD_DIR / file.filename
    content = await file.read()
    dest.write_bytes(content)

    audit_agent.invalidate_cache()

    summary = audit_agent.get_uploaded_file_summaries()
    return {
        "status": "ok",
        "filename": file.filename,
        "files": summary,
    }


@app.get("/api/files")
def list_files():
    """Return summaries of all uploaded Excel files."""
    return {"files": audit_agent.get_uploaded_file_summaries()}


@app.delete("/api/files/{filename}")
def delete_file(filename: str):
    """Remove a single uploaded file."""
    fp = audit_agent.UPLOAD_DIR / filename
    if not fp.exists():
        raise HTTPException(status_code=404, detail="File not found.")
    fp.unlink()
    audit_agent.invalidate_cache()
    return {"status": "ok", "message": f"Deleted {filename}"}


# ---------------------------------------------------------------------------
# Legacy routes (JSON-backed, unchanged)
# ---------------------------------------------------------------------------

@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/api/audit", response_model=AuditResponse)
def run_audit(request: AuditRequest):
    """
    Run audits.  If Excel files have been uploaded the agent uses those;
    otherwise falls back to the bundled JSON fixtures.
    """
    audit_type = request.audit_type

    try:
        has_uploads = bool(list(audit_agent.UPLOAD_DIR.glob("*.xlsx")))

        if has_uploads:
            findings = audit_agent._run_audit(audit_type)
        else:
            if audit_type == "revenue":
                findings = run_revenue_audit()
            elif audit_type == "inventory":
                findings = run_inventory_audit()
            elif audit_type == "payroll":
                findings = run_payroll_audit()
            elif audit_type == "all":
                findings = (
                    [{"_audit": "revenue"} | f for f in run_revenue_audit()]
                    + [{"_audit": "inventory"} | f for f in run_inventory_audit()]
                    + [{"_audit": "payroll"} | f for f in run_payroll_audit()]
                )
            else:
                raise HTTPException(status_code=400, detail="Unknown audit_type")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return build_response(audit_type, findings)


# ---------------------------------------------------------------------------
# Agent chat (replaces old chat when files are uploaded)
# ---------------------------------------------------------------------------

@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    """
    Smart routing: if Excel files have been uploaded, use the agentic pipeline
    (function-calling with tools). Otherwise fall back to the original
    prompt-stuffing approach.
    """
    has_uploads = bool(list(audit_agent.UPLOAD_DIR.glob("*.xlsx")))

    try:
        if has_uploads:
            result = audit_agent.chat(request.message, request.context or None)
        else:
            result = chat_service.chat(request.message, request.context)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except OpenAIError as exc:
        raise HTTPException(status_code=502, detail=f"OpenAI error: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    approval_raw = result.get("requires_approval")
    return ChatResponse(
        reply=result["reply"],
        model=result["model"],
        usage=TokenUsage(**result["usage"]),
        history_length=result["history_length"],
        requires_approval=ApprovalData(**approval_raw) if approval_raw else None,
    )


@app.get("/api/chat/history", response_model=HistoryResponse)
def get_chat_history():
    has_uploads = bool(list(audit_agent.UPLOAD_DIR.glob("*.xlsx")))
    if has_uploads:
        history = audit_agent.get_history()
    else:
        history = chat_service.get_history()
    return HistoryResponse(history=history, history_length=len(history))


@app.delete("/api/chat/history")
def reset_chat_history():
    chat_service.reset_history()
    audit_agent.reset()
    return {"status": "ok", "message": "Conversation history cleared."}
