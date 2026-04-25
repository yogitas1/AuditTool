"""
Cross-system audit engine: Harvest (time tracking) × Airtable (project management).

Finds discrepancies in hours, billing, invoicing, and budget tracking
by joining the two data sources on project name (case-insensitive).
"""

from datetime import date, datetime
from typing import Any

from . import airtable_client, harvest_client


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def _norm(s: str) -> str:
    """Normalise a string for fuzzy matching."""
    return (s or "").strip().lower()


def _id(prefix: str, n: int) -> str:
    return f"{prefix}-{n:03d}"


def _finding(
    fid: str,
    audit_type: str,
    severity: str,
    title: str,
    description: str,
    amount_impact: float,
    affected_records: list[str],
    recommended_action: str,
    data_source: str,
    requires_approval: bool | None = None,
) -> dict[str, Any]:
    return {
        "id": fid,
        "audit_type": audit_type,
        "severity": severity,
        "title": title,
        "description": description,
        "amount_impact": round(amount_impact, 2),
        "affected_records": affected_records,
        "recommended_action": recommended_action,
        "requires_approval": requires_approval if requires_approval is not None else (severity == "high"),
        "data_source": data_source,
    }


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

def _aggregate_harvest(
    entries: list[dict],
) -> tuple[
    dict[str, float],   # total hours by normalised project name
    dict[str, float],   # billable hours
    dict[str, float],   # non-billable hours
    dict[str, str],     # norm -> display name
    dict[str, float],   # billable hours by normalised client name
]:
    hours: dict[str, float] = {}
    billable: dict[str, float] = {}
    nonbillable: dict[str, float] = {}
    display: dict[str, str] = {}
    billable_by_client: dict[str, float] = {}

    for e in entries:
        proj_raw = (e.get("project_name") or "").strip()
        client_raw = (e.get("client_name") or "").strip()
        if not proj_raw:
            continue
        key = _norm(proj_raw)
        h = e.get("hours") or 0.0
        hours[key] = hours.get(key, 0.0) + h
        display[key] = proj_raw
        if e.get("billable"):
            billable[key] = billable.get(key, 0.0) + h
            if client_raw:
                ck = _norm(client_raw)
                billable_by_client[ck] = billable_by_client.get(ck, 0.0) + h
        else:
            nonbillable[key] = nonbillable.get(key, 0.0) + h

    return hours, billable, nonbillable, display, billable_by_client


def _harvest_project_map(projects: list[dict]) -> dict[str, dict]:
    """Normalised project name -> Harvest project record."""
    return {_norm(p.get("name") or ""): p for p in projects}


def _invoiced_clients(invoices: list[dict]) -> set[str]:
    """Set of normalised client names that have at least one Harvest invoice."""
    return {
        _norm(inv.get("client_name") or "")
        for inv in invoices
        if inv.get("client_name")
    }


def _invoice_totals_by_client(invoices: list[dict]) -> dict[str, float]:
    """Total invoiced amount by normalised client name."""
    totals: dict[str, float] = {}
    for inv in invoices:
        cn = _norm(inv.get("client_name") or "")
        if cn:
            totals[cn] = totals.get(cn, 0.0) + (inv.get("amount") or 0.0)
    return totals


def _airtable_by_name(records: list[dict]) -> dict[str, dict]:
    """Normalised project name -> Airtable record."""
    result: dict[str, dict] = {}
    for r in records:
        key = _norm(r.get("project_name") or "")
        if key:
            result[key] = r
    return result


def _parse_date(s: str | None) -> date | None:
    if not s:
        return None
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Individual checks — return findings in standard format
# ---------------------------------------------------------------------------

def _check_hours_overrun(
    at_records: list[dict],
    hours_norm: dict[str, float],
    h_proj_map: dict[str, dict],
    id_start: int = 1,
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    seq = id_start

    for rec in at_records:
        project = (rec.get("project_name") or "").strip()
        if not project:
            continue
        estimated = rec.get("hours_estimated")
        if not isinstance(estimated, (int, float)) or estimated <= 0:
            continue

        actual = hours_norm.get(_norm(project))
        if actual is None or actual <= estimated:
            continue

        diff = round(actual - estimated, 2)
        pct_over = round((diff / estimated) * 100, 1)
        rate = (h_proj_map.get(_norm(project)) or {}).get("hourly_rate") or 0
        impact = round(diff * rate, 2) if rate else 0
        severity = "high" if pct_over > 20 else "medium" if pct_over >= 10 else "low"

        desc = (
            f"Project '{project}' has logged {actual:.1f} hours but was estimated at "
            f"{estimated:.1f} hours. That's {diff:.1f} extra hours"
        )
        desc += (
            f" at ${rate}/hr = ${impact:,.2f} potentially unbilled or over-delivered."
            if rate else "."
        )

        findings.append(_finding(
            fid=_id("TB", seq),
            audit_type="time_budget",
            severity=severity,
            title=f"Hours Overrun: {project}",
            description=desc,
            amount_impact=impact,
            affected_records=[project],
            recommended_action=(
                f"Review whether the {diff:.1f} extra hours on '{project}' should be "
                "invoiced to the client or absorbed as a scope overrun."
            ),
            data_source="both",
        ))
        seq += 1

    return findings


def _check_unbilled_work(
    nonbillable_norm: dict[str, float],
    display_names: dict[str, str],
    at_by_name: dict[str, dict],
    h_proj_map: dict[str, dict],
    id_start: int = 1,
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    seq = id_start

    for key, nb_hours in nonbillable_norm.items():
        if nb_hours <= 0:
            continue
        rec = at_by_name.get(key)
        if not rec:
            continue
        budget = rec.get("budget")
        if not isinstance(budget, (int, float)) or budget <= 0:
            continue

        project = display_names.get(key, key)
        rate = (h_proj_map.get(key) or {}).get("hourly_rate") or 0
        amount = round(nb_hours * rate, 2) if rate else 0

        desc = (
            f"Project '{project}' has {nb_hours:.1f} non-billable hours in Harvest "
            f"but has a ${budget:,.2f} budget in your project tracker."
        )
        desc += (
            f" This could be ${amount:,.2f} of work you forgot to invoice."
            if amount else " Review whether these hours should be billed to the client."
        )

        findings.append(_finding(
            fid=_id("TB", seq),
            audit_type="time_budget",
            severity="high",
            title=f"Unbilled Work: {project}",
            description=desc,
            amount_impact=amount,
            affected_records=[project],
            recommended_action=(
                f"Check whether the {nb_hours:.1f} non-billable hours on '{project}' "
                "were intentionally written off or should be converted to billable."
            ),
            data_source="both",
        ))
        seq += 1

    return findings


def _check_complete_not_invoiced(
    at_by_name: dict[str, dict],
    invoiced_client_set: set[str],
    id_start: int = 1,
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    seq = id_start

    for _key, rec in at_by_name.items():
        status = (rec.get("status") or "").strip().lower()
        if status != "complete":
            continue
        client = (rec.get("client_name") or "").strip()
        if client and _norm(client) in invoiced_client_set:
            continue

        project = (rec.get("project_name") or _key).strip()
        budget = rec.get("budget") or 0

        findings.append(_finding(
            fid=_id("CS", seq),
            audit_type="cross_system",
            severity="high",
            title=f"Complete But Not Invoiced: {project}",
            description=(
                f"Project '{project}' is marked Complete in your project tracker "
                f"but no invoice was found in Harvest for client '{client or 'unknown'}'. "
                "You may have finished the work but not billed for it."
            ),
            amount_impact=budget,
            affected_records=[project, client] if client else [project],
            recommended_action=(
                f"Create an invoice in Harvest for '{client or project}' "
                "or confirm the project was pro-bono / already paid outside Harvest."
            ),
            data_source="both",
        ))
        seq += 1

    return findings


def _check_budget_at_risk(
    at_records: list[dict],
    hours_norm: dict[str, float],
    h_proj_map: dict[str, dict],
    id_start: int = 1,
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    seq = id_start

    for rec in at_records:
        project = (rec.get("project_name") or "").strip()
        if not project:
            continue
        if (rec.get("status") or "").strip().lower() != "in progress":
            continue
        budget = rec.get("budget")
        if not isinstance(budget, (int, float)) or budget <= 0:
            continue

        actual = hours_norm.get(_norm(project), 0.0)
        if actual <= 0:
            continue
        rate = (h_proj_map.get(_norm(project)) or {}).get("hourly_rate") or 0
        if not rate:
            continue

        spent = round(actual * rate, 2)
        pct = round((spent / budget) * 100, 1)
        if pct < 80:
            continue

        severity = "high" if pct >= 95 else "medium"
        overage = round(spent - budget, 2) if spent > budget else 0

        findings.append(_finding(
            fid=_id("TB", seq),
            audit_type="time_budget",
            severity=severity,
            title=f"Budget at Risk: {project}",
            description=(
                f"Project '{project}' has used ${spent:,.2f} of its ${budget:,.2f} "
                f"budget ({pct}%) and is still in progress. "
                + (f"At current pace, you'll exceed the budget by ${overage:,.2f}." if overage
                   else "You're approaching the budget ceiling.")
            ),
            amount_impact=overage,
            affected_records=[project],
            recommended_action=(
                "Have a budget conversation with the client or adjust scope before "
                f"more hours are logged on '{project}'."
            ),
            data_source="both",
        ))
        seq += 1

    return findings


def _check_untracked_projects(
    hours_norm: dict[str, float],
    display_names: dict[str, str],
    at_by_name: dict[str, dict],
    id_start: int = 1,
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    seq = id_start

    for key, h_hours in hours_norm.items():
        if h_hours <= 0 or key in at_by_name:
            continue
        project = display_names.get(key, key)
        findings.append(_finding(
            fid=_id("CS", seq),
            audit_type="cross_system",
            severity="medium",
            title=f"Project Not in Tracker: {project}",
            description=(
                f"Project '{project}' exists in Harvest with {h_hours:.1f} hours logged "
                "but doesn't appear in your project tracker. "
                "It may be missing from your planning system."
            ),
            amount_impact=0,
            affected_records=[project],
            recommended_action=(
                f"Add '{project}' to your Airtable project tracker with estimated hours "
                "and budget, or confirm it's intentionally untracked."
            ),
            data_source="harvest",
        ))
        seq += 1

    return findings


def _check_contract_missing(
    at_records: list[dict],
    hours_norm: dict[str, float],
    id_start: int = 1,
) -> list[dict[str, Any]]:
    """Flag projects where work has started but contract is unsigned."""
    findings: list[dict[str, Any]] = []
    seq = id_start

    for rec in at_records:
        project = (rec.get("project_name") or "").strip()
        if not project:
            continue

        # Find any field whose key contains "contract"
        contract_status: str | None = None
        for field_key, field_val in rec.items():
            if "contract" in field_key.lower():
                contract_status = str(field_val).strip() if field_val is not None else None
                break

        if not contract_status:
            continue
        if contract_status.lower() not in ("no", "pending"):
            continue

        # Only flag if Harvest shows hours logged
        hours = hours_norm.get(_norm(project), 0.0)
        if hours <= 0:
            continue

        findings.append(_finding(
            fid=_id("CS", seq),
            audit_type="cross_system",
            severity="high",
            title=f"Work Started Without Contract: {project}",
            description=(
                f"Project '{project}' has {hours:.1f} hours logged in Harvest "
                f"but contract status is '{contract_status}'. "
                "Work has started without a signed agreement."
            ),
            amount_impact=0,
            affected_records=[project],
            recommended_action=(
                f"Pause billing on '{project}' until a signed contract is in place, "
                "or update the contract status in your project tracker."
            ),
            data_source="both",
            requires_approval=True,
        ))
        seq += 1

    return findings


# ---------------------------------------------------------------------------
# Invoicing checks
# ---------------------------------------------------------------------------

def _check_billable_no_invoice(
    billable_by_client: dict[str, float],
    invoiced_client_set: set[str],
    id_start: int = 1,
) -> list[dict[str, Any]]:
    """Clients with billable hours but no invoice in Harvest."""
    findings: list[dict[str, Any]] = []
    seq = id_start

    for client_key, b_hours in billable_by_client.items():
        if b_hours <= 0 or client_key in invoiced_client_set:
            continue

        findings.append(_finding(
            fid=_id("INV", seq),
            audit_type="invoicing",
            severity="high",
            title=f"Billable Hours Not Invoiced: {client_key.title()}",
            description=(
                f"Client '{client_key.title()}' has {b_hours:.1f} billable hours logged "
                "in Harvest but no invoice exists for them. "
                "This revenue has not been billed."
            ),
            amount_impact=0,
            affected_records=[client_key.title()],
            recommended_action=(
                f"Create an invoice in Harvest for '{client_key.title()}' "
                f"covering {b_hours:.1f} billable hours."
            ),
            data_source="harvest",
        ))
        seq += 1

    return findings


def _check_invoice_amount_vs_hours(
    entries: list[dict],
    invoices: list[dict],
    id_start: int = 1,
) -> list[dict[str, Any]]:
    """Flag invoices where amount differs significantly from hours × rate."""
    findings: list[dict[str, Any]] = []
    seq = id_start

    # Compute total billable value (hours * rate) by client
    value_by_client: dict[str, float] = {}
    for e in entries:
        if not e.get("billable"):
            continue
        client = _norm(e.get("client_name") or "")
        if not client:
            continue
        h = e.get("hours") or 0.0
        rate = e.get("billable_rate") or 0.0
        value_by_client[client] = value_by_client.get(client, 0.0) + (h * rate)

    invoice_totals = _invoice_totals_by_client(invoices)

    for client_key, expected in value_by_client.items():
        if expected <= 0:
            continue
        invoiced = invoice_totals.get(client_key, 0.0)
        if invoiced <= 0:
            continue  # covered by _check_billable_no_invoice

        diff = round(abs(expected - invoiced), 2)
        if diff < 1.0:
            continue

        pct_diff = round((diff / expected) * 100, 1)
        if pct_diff < 5:
            continue  # minor rounding, skip

        direction = "over-invoiced" if invoiced > expected else "under-invoiced"
        severity = "high" if pct_diff > 20 else "medium"

        findings.append(_finding(
            fid=_id("INV", seq),
            audit_type="invoicing",
            severity=severity,
            title=f"Invoice Mismatch: {client_key.title()}",
            description=(
                f"Client '{client_key.title()}' has been {direction} by ${diff:,.2f}. "
                f"Harvest time entries total ${expected:,.2f} in billable value "
                f"but invoices total ${invoiced:,.2f} ({pct_diff}% discrepancy)."
            ),
            amount_impact=diff,
            affected_records=[client_key.title()],
            recommended_action=(
                f"Reconcile Harvest time entries against invoices for "
                f"'{client_key.title()}' and issue a corrective invoice or credit note."
            ),
            data_source="harvest",
        ))
        seq += 1

    return findings


def _check_overdue_invoices(
    invoices: list[dict],
    today: date | None = None,
    id_start: int = 1,
) -> list[dict[str, Any]]:
    """Open invoices past their due date."""
    findings: list[dict[str, Any]] = []
    seq = id_start
    today = today or date.today()

    for inv in invoices:
        if (inv.get("status") or "").lower() != "open":
            continue
        due = _parse_date(inv.get("due_date"))
        if due is None or due >= today:
            continue

        days_over = (today - due).days
        client = (inv.get("client_name") or "unknown client").strip()
        amount = inv.get("amount") or 0
        inv_num = inv.get("number") or inv.get("id") or "unknown"

        findings.append(_finding(
            fid=_id("INV", seq),
            audit_type="invoicing",
            severity="high" if days_over > 30 else "medium",
            title=f"Overdue Invoice: {client} #{inv_num}",
            description=(
                f"Invoice #{inv_num} for '{client}' (${amount:,.2f}) is {days_over} days "
                f"past its due date of {inv.get('due_date')}. Status is still 'open'."
            ),
            amount_impact=amount,
            affected_records=[client, str(inv_num)],
            recommended_action=(
                f"Send a payment reminder to '{client}' for invoice #{inv_num} "
                f"(${amount:,.2f}) or escalate to collections if overdue by more than 30 days."
            ),
            data_source="harvest",
        ))
        seq += 1

    return findings


# ---------------------------------------------------------------------------
# Public API: named audit functions
# ---------------------------------------------------------------------------

def audit_time_vs_budget(
    harvest_data: dict,
    airtable_data: dict,
) -> list[dict[str, Any]]:
    """
    Cross-reference Harvest time entries against Airtable project budgets/estimates.
    harvest_data: {"projects": [...], "time_entries": [...], "invoices": [...]}
    airtable_data: {"records": [...]}
    """
    entries: list[dict] = harvest_data.get("time_entries", [])
    projects: list[dict] = harvest_data.get("projects", [])
    invoices: list[dict] = harvest_data.get("invoices", [])
    at_records: list[dict] = airtable_data.get("records", [])

    hours_norm, _bill, nonbill, display, _bbc = _aggregate_harvest(entries)
    h_proj_map = _harvest_project_map(projects)
    invoiced = _invoiced_clients(invoices)
    at_by_name = _airtable_by_name(at_records)

    findings: list[dict[str, Any]] = []

    tb_findings = (
        _check_hours_overrun(at_records, hours_norm, h_proj_map, id_start=1)
        + _check_unbilled_work(nonbill, display, at_by_name, h_proj_map,
                               id_start=100)
        + _check_budget_at_risk(at_records, hours_norm, h_proj_map, id_start=200)
    )
    cs_findings = (
        _check_complete_not_invoiced(at_by_name, invoiced, id_start=1)
        + _check_untracked_projects(hours_norm, display, at_by_name, id_start=100)
        + _check_contract_missing(at_records, hours_norm, id_start=200)
    )
    findings = tb_findings + cs_findings
    return findings


def audit_invoicing(harvest_data: dict) -> list[dict[str, Any]]:
    """
    Audit Harvest invoicing: unbilled hours, amount mismatches, overdue invoices.
    harvest_data: {"projects": [...], "time_entries": [...], "invoices": [...]}
    """
    entries: list[dict] = harvest_data.get("time_entries", [])
    invoices: list[dict] = harvest_data.get("invoices", [])

    _hours, _bill, _nb, _disp, billable_by_client = _aggregate_harvest(entries)
    invoiced = _invoiced_clients(invoices)

    findings: list[dict[str, Any]] = (
        _check_billable_no_invoice(billable_by_client, invoiced, id_start=1)
        + _check_invoice_amount_vs_hours(entries, invoices, id_start=100)
        + _check_overdue_invoices(invoices, id_start=200)
    )
    return findings


# ---------------------------------------------------------------------------
# Full live audit
# ---------------------------------------------------------------------------

def run_full_audit() -> dict[str, Any]:
    print("[LiveAudit] Fetching Harvest data...")
    h_projects = harvest_client.get_projects()
    h_entries = harvest_client.get_time_entries("2026-01-01", "2026-12-31")
    h_invoices = harvest_client.get_invoices()

    print("[LiveAudit] Fetching Airtable data...")
    at_records = airtable_client.get_all_records()

    harvest_data = {
        "projects": h_projects,
        "time_entries": h_entries,
        "invoices": h_invoices,
    }
    airtable_data = {"records": at_records}

    print("[LiveAudit] Running cross-system checks...")
    findings: list[dict[str, Any]] = (
        audit_time_vs_budget(harvest_data, airtable_data)
        + audit_invoicing(harvest_data)
    )

    # Summary
    sev: dict[str, int] = {"high": 0, "medium": 0, "low": 0}
    total_impact = 0.0
    for f in findings:
        s = f.get("severity", "low")
        sev[s] = sev.get(s, 0) + 1
        total_impact += f.get("amount_impact") or 0

    # Data summaries (reuse already-fetched data)
    hours_norm, billable_norm, _nb, _disp, _bbc = _aggregate_harvest(h_entries)
    total_hours = sum(hours_norm.values())
    billable_hours = sum(billable_norm.values())

    at_status_counts: dict[str, int] = {}
    at_total_budget = 0.0
    for r in at_records:
        status = r.get("status")
        if status:
            at_status_counts[str(status)] = at_status_counts.get(str(status), 0) + 1
        b = r.get("budget")
        if isinstance(b, (int, float)):
            at_total_budget += b

    print(f"[LiveAudit] Complete — {len(findings)} findings, ${total_impact:,.2f} total impact")

    return {
        "findings": findings,
        "summary": {
            "total": len(findings),
            **sev,
            "total_impact": round(total_impact, 2),
        },
        "sources": {
            "harvest": "live",
            "airtable": "live",
            "quickbooks": "excel_upload",
        },
        "data_summary": {
            "harvest": {
                "projects": len(h_projects),
                "hours": round(total_hours, 2),
                "billable_hours": round(billable_hours, 2),
                "unbillable_hours": round(total_hours - billable_hours, 2),
                "invoices": len(h_invoices),
                "source": "harvest_live",
            },
            "airtable": {
                "projects": len(at_records),
                "statuses": at_status_counts,
                "total_budget": round(at_total_budget, 2),
                "source": "airtable_live",
            },
        },
    }
