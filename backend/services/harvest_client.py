import os
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv()

_BASE_URL = "https://api.harvestapp.com/v2"


def _headers() -> dict[str, str]:
    token = os.getenv("HARVEST_ACCESS_TOKEN", "")
    account_id = os.getenv("HARVEST_ACCOUNT_ID", "")
    return {
        "Authorization": f"Bearer {token}",
        "Harvest-Account-Id": account_id,
        "User-Agent": "AuditTool",
    }


def _get_all_pages(path: str, key: str, params: dict | None = None) -> list[dict]:
    """Fetch all pages from a paginated Harvest endpoint."""
    url = f"{_BASE_URL}{path}"
    results: list[dict] = []
    page = 1

    while url:
        resp = requests.get(url, headers=_headers(), params={**(params or {}), "page": page})
        if resp.status_code == 401:
            raise ValueError("Harvest authentication failed: invalid token or account ID.")
        resp.raise_for_status()
        data = resp.json()
        results.extend(data.get(key, []))
        links = data.get("links", {})
        next_url = links.get("next")
        if next_url:
            # next_url is a full URL; use it directly on next iteration
            url = next_url
            params = None  # params are already encoded in the next URL
        else:
            break
        page += 1

    return results


def get_projects() -> list[dict]:
    print("[Harvest] Fetching projects...")
    raw = _get_all_pages("/projects", "projects")
    projects = [
        {
            "id": p.get("id"),
            "name": p.get("name"),
            "client_name": (p.get("client") or {}).get("name"),
            "budget": p.get("budget"),
            "is_active": p.get("is_active"),
            "billable": p.get("billable"),
            "hourly_rate": p.get("hourly_rate"),
        }
        for p in raw
    ]
    print(f"[Harvest] Fetching projects... found {len(projects)}")
    return projects


def get_time_entries(from_date: str, to_date: str) -> list[dict]:
    print(f"[Harvest] Fetching time entries from {from_date} to {to_date}...")
    raw = _get_all_pages("/time_entries", "time_entries", {"from": from_date, "to": to_date})
    entries = [
        {
            "id": e.get("id"),
            "project_name": (e.get("project") or {}).get("name"),
            "client_name": (e.get("client") or {}).get("name"),
            "hours": e.get("hours"),
            "billable": e.get("billable"),
            "billable_rate": e.get("billable_rate"),
            "spent_date": e.get("spent_date"),
            "notes": e.get("notes"),
            "task_name": (e.get("task") or {}).get("name"),
        }
        for e in raw
    ]
    print(f"[Harvest] Fetching time entries... found {len(entries)}")
    return entries


def get_invoices() -> list[dict]:
    print("[Harvest] Fetching invoices...")
    raw = _get_all_pages("/invoices", "invoices")
    invoices = [
        {
            "id": inv.get("id"),
            "client_name": (inv.get("client") or {}).get("name"),
            "number": inv.get("number"),
            "amount": inv.get("amount"),
            "due_amount": inv.get("due_amount"),
            "status": inv.get("state"),
            "issue_date": inv.get("issue_date"),
            "due_date": inv.get("due_date"),
            "line_items": inv.get("line_items", []),
        }
        for inv in raw
    ]
    print(f"[Harvest] Fetching invoices... found {len(invoices)}")
    return invoices


def get_project_budget_report() -> list[dict]:
    print("[Harvest] Fetching project budget report...")
    raw = _get_all_pages("/reports/project_budget", "results")
    report = [
        {
            "project_name": r.get("project_name"),
            "client_name": r.get("client_name"),
            "budget": r.get("budget"),
            "budget_spent": r.get("budget_spent"),
            "budget_remaining": r.get("budget_remaining"),
            "budget_is_monthly": r.get("budget_is_monthly"),
        }
        for r in raw
    ]
    print(f"[Harvest] Fetching project budget report... found {len(report)} entries")
    return report


def get_summary() -> dict[str, Any]:
    print("[Harvest] Building summary...")
    projects = get_projects()
    # Use a broad date range for summary time entries
    entries = get_time_entries("2026-01-01", "2026-12-31")
    invoices = get_invoices()

    total_hours = sum(e.get("hours") or 0 for e in entries)
    billable_hours = sum((e.get("hours") or 0) for e in entries if e.get("billable"))
    unbillable_hours = total_hours - billable_hours

    summary = {
        "projects_count": len(projects),
        "total_hours": round(total_hours, 2),
        "total_billable_hours": round(billable_hours, 2),
        "total_unbillable_hours": round(unbillable_hours, 2),
        "invoices_count": len(invoices),
        "source": "harvest_live",
    }
    print(f"[Harvest] Summary built: {summary}")
    return summary
