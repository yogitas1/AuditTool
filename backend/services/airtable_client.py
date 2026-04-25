import os
from typing import Any
from urllib.parse import quote

import requests
from dotenv import load_dotenv

load_dotenv()

_BASE_URL = "https://api.airtable.com/v0"


def _headers() -> dict[str, str]:
    pat = os.getenv("AIRTABLE_PAT", "")
    return {
        "Authorization": f"Bearer {pat}",
    }


def _table_url() -> str:
    base_id = os.getenv("AIRTABLE_BASE_ID", "")
    table_name = os.getenv("AIRTABLE_TABLE_NAME", "")
    return f"{_BASE_URL}/{base_id}/{quote(table_name)}"


def _get_all_pages(params: dict | None = None) -> list[dict]:
    """Fetch all pages from the Airtable table using offset-based pagination."""
    url = _table_url()
    results: list[dict] = []
    params = dict(params or {})

    while True:
        resp = requests.get(url, headers=_headers(), params=params)
        if resp.status_code == 401:
            raise ValueError("Airtable authentication failed: invalid PAT.")
        resp.raise_for_status()
        data = resp.json()
        results.extend(data.get("records", []))
        offset = data.get("offset")
        if offset:
            params["offset"] = offset
        else:
            break

    return results


def _map_fields(fields: dict) -> dict:
    """Start with all original fields, then add normalised alias keys for recognised columns."""
    mapped = dict(fields)
    for key, value in fields.items():
        k_lower = key.lower()
        if "client" in k_lower:
            mapped.setdefault("client_name", value)
        elif "project" in k_lower or "name" in k_lower:
            mapped.setdefault("project_name", value)
        if "budget" in k_lower:
            mapped.setdefault("budget", value)
        if "status" in k_lower:
            mapped.setdefault("status", value)
        if "hours" in k_lower or "estimated" in k_lower:
            mapped.setdefault("hours_estimated", value)
    return mapped


def get_all_records() -> list[dict]:
    table_name = os.getenv("AIRTABLE_TABLE_NAME", "unknown")
    print(f"[Airtable] Fetching records from '{table_name}'...")
    raw = _get_all_pages()
    records = [
        {"id": r.get("id"), **_map_fields(r.get("fields", {}))}
        for r in raw
    ]
    print(f"[Airtable] Fetching records from '{table_name}'... found {len(records)}")
    return records


def get_record_by_name(project_name: str) -> dict | None:
    print(f"[Airtable] Searching for project: {project_name}...")
    formula = f"{{Project Name}}='{project_name}'"
    raw = _get_all_pages({"filterByFormula": formula})
    if not raw:
        return None
    r = raw[0]
    return {"id": r.get("id"), **_map_fields(r.get("fields", {}))}


def get_summary() -> dict[str, Any]:
    print("[Airtable] Building summary...")
    records = get_all_records()

    status_counts: dict[str, int] = {}
    total_budget = 0.0

    for r in records:
        status = r.get("status")
        if status:
            status_counts[str(status)] = status_counts.get(str(status), 0) + 1
        budget = r.get("budget")
        if isinstance(budget, (int, float)):
            total_budget += budget

    summary = {
        "total_projects": len(records),
        "statuses": status_counts,
        "total_budget": round(total_budget, 2),
        "source": "airtable_live",
    }
    print(f"[Airtable] Summary built: {summary}")
    return summary
