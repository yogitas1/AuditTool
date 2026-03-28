from datetime import date
from typing import Any

from .data_loader import load_amazon, load_inventory, load_payroll, load_quickbooks, load_shopify


# ---------------------------------------------------------------------------
# Revenue Audit
# ---------------------------------------------------------------------------

def run_revenue_audit() -> list[dict[str, Any]]:
    """
    Match QuickBooks transactions to Shopify invoices or Amazon orders via txn_ref.
    Flags amount discrepancies and wrong-period bookings.
    """
    qb = load_quickbooks()
    shopify = load_shopify()
    amazon = load_amazon()

    # Build lookup maps: txn_ref -> source record
    shopify_map: dict[str, dict] = {inv["txn_ref"]: inv for inv in shopify["invoices"]}
    amazon_map: dict[str, dict] = {ord_["txn_ref"]: ord_ for ord_ in amazon["orders"]}

    findings: list[dict[str, Any]] = []

    for txn in qb["transactions"]:
        txn_id = txn["id"]
        channel = txn["channel"]
        qb_amount = txn["amount"]
        qb_date = txn["date"]

        # Locate the source record
        source_record: dict | None = None
        source_name = ""
        if channel == "shopify":
            source_record = shopify_map.get(txn_id)
            source_name = "Shopify"
        elif channel == "amazon":
            source_record = amazon_map.get(txn_id)
            source_name = "Amazon"

        # --- No matching invoice ---
        if source_record is None:
            if channel in ("shopify", "amazon"):
                findings.append({
                    "type": "unmatched_transaction",
                    "severity": "high",
                    "txn_id": txn_id,
                    "customer": txn["customer"],
                    "channel": channel,
                    "qb_amount": qb_amount,
                    "source_amount": None,
                    "discrepancy": None,
                    "explanation": (
                        f"QuickBooks transaction {txn_id} ({txn['customer']}, "
                        f"${qb_amount:,.2f}) has no matching {source_name} invoice. "
                        f"Revenue may be unsubstantiated or recorded in the wrong channel."
                    ),
                })
            else:
                # Direct / other channels — no invoice expected, flag for review
                findings.append({
                    "type": "no_source_invoice",
                    "severity": "medium",
                    "txn_id": txn_id,
                    "customer": txn["customer"],
                    "channel": channel,
                    "qb_amount": qb_amount,
                    "source_amount": None,
                    "discrepancy": None,
                    "explanation": (
                        f"QuickBooks transaction {txn_id} ({txn['customer']}, "
                        f"${qb_amount:,.2f}) is recorded as a '{channel}' sale but no "
                        f"supporting invoice was found in Shopify or Amazon. "
                        f"Obtain supporting documentation."
                    ),
                })
            continue

        source_amount = source_record["amount"]
        discrepancy = round(qb_amount - source_amount, 2)

        # --- Amount mismatch ---
        if discrepancy != 0:
            discount = source_record.get("discount_applied", 0)
            if discount and abs(discrepancy) == discount:
                explanation = (
                    f"{source_name} invoice for {txn_id} ({txn['customer']}) shows a "
                    f"${discount:,.2f} discount applied, reducing the invoice amount to "
                    f"${source_amount:,.2f}. QuickBooks records ${qb_amount:,.2f} (full price). "
                    f"Confirm the discount was properly authorized and posted."
                )
                severity = "medium"
            else:
                explanation = (
                    f"Amount mismatch on {txn_id} ({txn['customer']}): QuickBooks shows "
                    f"${qb_amount:,.2f} but {source_name} shows ${source_amount:,.2f} "
                    f"(difference of ${abs(discrepancy):,.2f}). Investigate before period close."
                )
                severity = "high"

            findings.append({
                "type": "amount_mismatch",
                "severity": severity,
                "txn_id": txn_id,
                "customer": txn["customer"],
                "channel": channel,
                "qb_amount": qb_amount,
                "source_amount": source_amount,
                "discrepancy": discrepancy,
                "explanation": explanation,
            })

        # --- Wrong-period booking (date_booked differs from transaction date) ---
        date_booked = source_record.get("date_booked")
        if date_booked and date_booked != qb_date:
            txn_month = qb_date[:7]       # e.g. "2026-03"
            booked_month = date_booked[:7]
            cross_period = txn_month != booked_month

            findings.append({
                "type": "wrong_period",
                "severity": "high" if cross_period else "low",
                "txn_id": txn_id,
                "customer": txn["customer"],
                "channel": channel,
                "qb_amount": qb_amount,
                "transaction_date": qb_date,
                "date_booked": date_booked,
                "discrepancy": None,
                "explanation": (
                    f"Transaction {txn_id} ({txn['customer']}, ${qb_amount:,.2f}) has a "
                    f"transaction date of {qb_date} but was booked on {date_booked}. "
                    + (
                        f"This crosses a period boundary (transaction in {txn_month}, "
                        f"booked in {booked_month}), which may cause revenue to be reported "
                        f"in the wrong accounting period."
                        if cross_period
                        else "Booking date differs from transaction date within the same period."
                    )
                ),
            })

    return findings


# ---------------------------------------------------------------------------
# Inventory Audit
# ---------------------------------------------------------------------------

def run_inventory_audit() -> list[dict[str, Any]]:
    """
    Compare system_count vs expected_count. Check PO received vs ordered qty.
    Prioritize findings by ABC category (A first).
    """
    data = load_inventory()
    findings: list[dict[str, Any]] = []

    # Item-level count discrepancies
    for item in data["items"]:
        diff = item["system_count"] - item["expected_count"]
        if diff == 0:
            continue

        dollar_impact = round(abs(diff) * item["unit_cost"], 2)
        direction = "shortage" if diff < 0 else "overage"
        severity_map = {"A": "high", "B": "medium", "C": "low"}
        severity = severity_map.get(item["category"], "low")

        findings.append({
            "type": f"count_{direction}",
            "severity": severity,
            "sku": item["sku"],
            "name": item["name"],
            "category": item["category"],
            "system_count": item["system_count"],
            "expected_count": item["expected_count"],
            "variance": diff,
            "unit_cost": item["unit_cost"],
            "dollar_impact": dollar_impact,
            "explanation": (
                f"SKU {item['sku']} ({item['name']}) — Category {item['category']} item. "
                f"System count is {item['system_count']} but expected {item['expected_count']} "
                f"({abs(diff)} unit {direction}, ${dollar_impact:,.2f} impact). "
                f"{'Initiate physical recount and investigate shrinkage.' if direction == 'shortage' else 'Investigate potential double-receipt or data entry error.'}"
            ),
        })

    # Purchase order received vs ordered mismatches
    for po in data.get("purchase_orders", []):
        ordered = po["ordered_qty"]
        received = po["received_qty"]
        qty_diff = ordered - received

        if qty_diff == 0:
            continue

        # Estimate unit cost from invoice amount and ordered qty
        unit_cost_est = round(po["invoice_amount"] / ordered, 2) if ordered else 0
        dollar_shortfall = round(qty_diff * unit_cost_est, 2)

        findings.append({
            "type": "po_receipt_mismatch",
            "severity": "high",
            "po_id": po["po_id"],
            "supplier": po["supplier"],
            "sku": po["sku"],
            "ordered_qty": ordered,
            "received_qty": received,
            "qty_variance": qty_diff,
            "invoice_amount": po["invoice_amount"],
            "dollar_shortfall": dollar_shortfall,
            "explanation": (
                f"PO {po['po_id']} from {po['supplier']} for SKU {po['sku']}: "
                f"ordered {ordered} units but only received {received} "
                f"(short {qty_diff} units, ~${dollar_shortfall:,.2f}). "
                f"Full invoice amount of ${po['invoice_amount']:,.2f} was charged. "
                f"Issue a debit memo or claim with the supplier for the shortage."
            ),
        })

    # Sort: A > B > C, then by dollar_impact descending
    category_order = {"A": 0, "B": 1, "C": 2}

    def sort_key(f: dict) -> tuple:
        cat = f.get("category", "C")
        impact = f.get("dollar_impact", f.get("dollar_shortfall", 0))
        return (category_order.get(cat, 3), -impact)

    findings.sort(key=sort_key)
    return findings


# ---------------------------------------------------------------------------
# Payroll Audit
# ---------------------------------------------------------------------------

# California SDI rate effective 2024+
CA_SDI_RATE_CORRECT = 0.012
CONTRACTOR_HOURS_THRESHOLD = 40


def run_payroll_audit() -> list[dict[str, Any]]:
    """
    Checks:
    - Terminated employees still receiving pay
    - Contractor misclassification (40+ hrs/week + company equipment)
    - Payroll total vs GL entry discrepancy
    - Incorrect CA SDI withholding rates
    """
    data = load_payroll()
    findings: list[dict[str, Any]] = []

    for emp in data["employees"]:
        emp_id = emp["id"]
        name = emp["name"]
        gross = emp["gross_pay"]

        # --- Terminated employee still paid ---
        if emp["status"] == "terminated" and gross > 0:
            term_date = emp.get("termination_date", "unknown date")
            findings.append({
                "type": "terminated_employee_paid",
                "severity": "high",
                "employee_id": emp_id,
                "employee_name": name,
                "employee_type": emp["type"],
                "gross_pay": gross,
                "termination_date": term_date,
                "explanation": (
                    f"{name} ({emp_id}) was terminated on {term_date} but received "
                    f"${gross:,.2f} in gross pay this period. Stop payments immediately "
                    f"and recover any overpayment."
                ),
            })

        # --- Contractor misclassification risk ---
        if (
            emp["type"] == "contractor"
            and emp.get("hours_per_week", 0) >= CONTRACTOR_HOURS_THRESHOLD
            and emp.get("uses_company_equipment", False)
        ):
            findings.append({
                "type": "contractor_misclassification",
                "severity": "high",
                "employee_id": emp_id,
                "employee_name": name,
                "gross_pay": gross,
                "hours_per_week": emp["hours_per_week"],
                "uses_company_equipment": True,
                "explanation": (
                    f"{name} ({emp_id}) is classified as a contractor but works "
                    f"{emp['hours_per_week']} hrs/week using company equipment — both "
                    f"factors indicative of an employee relationship under IRS and CA AB5 "
                    f"criteria. Misclassification exposes the company to back taxes, penalties, "
                    f"and benefits liability. Review classification with employment counsel."
                ),
            })

        # --- CA SDI rate check ---
        if "ca_sdi_rate" in emp:
            actual_rate = emp["ca_sdi_rate"]
            correct_rate = emp.get("ca_sdi_correct_rate", CA_SDI_RATE_CORRECT)
            if round(actual_rate, 4) != round(correct_rate, 4):
                withheld = round(gross * actual_rate, 2)
                should_withhold = round(gross * correct_rate, 2)
                underpayment = round(should_withhold - withheld, 2)
                findings.append({
                    "type": "incorrect_ca_sdi_rate",
                    "severity": "medium",
                    "employee_id": emp_id,
                    "employee_name": name,
                    "gross_pay": gross,
                    "actual_rate": actual_rate,
                    "correct_rate": correct_rate,
                    "withheld": withheld,
                    "should_withhold": should_withhold,
                    "underpayment": underpayment,
                    "explanation": (
                        f"{name} ({emp_id}) has CA SDI withheld at {actual_rate*100:.1f}% "
                        f"(${withheld:,.2f}) but the correct rate is {correct_rate*100:.1f}% "
                        f"(${should_withhold:,.2f}). Under-withheld by ${underpayment:,.2f} "
                        f"this period. Update payroll system and remit the difference to the EDD."
                    ),
                })

    # --- Payroll total vs GL discrepancy ---
    payroll_total = data["payroll_total"]
    gl_entry = data["gl_payroll_entry"]
    gl_diff = round(payroll_total - gl_entry, 2)

    if gl_diff != 0:
        # The terminated employee's pay is likely the source
        terminated_pay = sum(
            e["gross_pay"] for e in data["employees"] if e["status"] == "terminated"
        )
        hint = ""
        if abs(gl_diff - terminated_pay) < 0.01:
            hint = (
                f" This matches the gross pay of terminated employee(s) (${terminated_pay:,.2f}), "
                f"suggesting the GL was not updated after the erroneous payment."
            )

        findings.append({
            "type": "payroll_gl_discrepancy",
            "severity": "high",
            "payroll_total": payroll_total,
            "gl_payroll_entry": gl_entry,
            "discrepancy": gl_diff,
            "explanation": (
                f"Payroll system total (${payroll_total:,.2f}) does not match the GL payroll "
                f"entry (${gl_entry:,.2f}) — a discrepancy of ${gl_diff:,.2f}.{hint} "
                f"Reconcile before period close."
            ),
        })

    return findings
