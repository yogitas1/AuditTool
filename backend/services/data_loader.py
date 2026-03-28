import json
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"


def load_json(filename: str) -> dict:
    with open(DATA_DIR / filename, "r") as f:
        return json.load(f)


def load_quickbooks() -> dict:
    return load_json("quickbooks_revenue.json")


def load_shopify() -> dict:
    return load_json("shopify_invoices.json")


def load_amazon() -> dict:
    return load_json("amazon_orders.json")


def load_inventory() -> dict:
    return load_json("inventory_records.json")


def load_payroll() -> dict:
    return load_json("payroll_records.json")
