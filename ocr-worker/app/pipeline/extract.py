"""
Field extraction from raw OCR text.
Uses regex patterns to find structured invoice fields.
"""

import re
from datetime import datetime
from typing import Optional, List, Dict, Any


# ─── Date parsing ─────────────────────────────────────────────────────────────

DATE_PATTERNS = [
    r"(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})",    # DD/MM/YYYY or MM/DD/YYYY
    r"(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})",       # YYYY-MM-DD
    # DD MonthName YYYY — both Indonesian and English month names
    r"(\d{1,2})\s+(Jan(?:uari|uary)?|Feb(?:ruari|ruary)?|Mar(?:et|ch)?|Apr(?:il)?|Mei|May|Jun(?:i|e)?|Jul(?:i|y)?|Agu(?:stus)?|Aug(?:ust)?|Sep(?:tember)?|Okt(?:ober)?|Oct(?:ober)?|Nov(?:ember)?|Des(?:ember)?|Dec(?:ember)?)\s+(\d{4})",
    # MonthName DD, YYYY
    r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})",
]

MONTH_MAP = {
    "jan": 1, "januari": 1, "january": 1,
    "feb": 2, "februari": 2, "february": 2,
    "mar": 3, "mare": 3, "marc": 3, "march": 3, "maret": 3,
    "apr": 4, "april": 4,
    "mei": 5, "may": 5,
    "jun": 6, "juni": 6, "june": 6,
    "jul": 7, "juli": 7, "july": 7,
    "agu": 8, "aug": 8, "agustus": 8, "august": 8,
    "sep": 9, "september": 9,
    "okt": 10, "oct": 10, "oktober": 10, "october": 10,
    "nov": 11, "november": 11,
    "des": 12, "dec": 12, "desember": 12, "december": 12,
}


def _parse_date(text: str) -> Optional[str]:
    for pat in DATE_PATTERNS:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            try:
                groups = m.groups()
                if len(groups) == 3:
                    g0, g1, g2 = groups
                    if g1.isdigit():
                        d, mo, y = int(g0), int(g1), int(g2)
                        if y < 100:
                            y += 2000
                        return f"{y:04d}-{mo:02d}-{d:02d}"
                    else:
                        month_num = MONTH_MAP.get(g1.lower()[:3])
                        if month_num:
                            return f"{int(g2):04d}-{month_num:02d}-{int(g0):02d}"
            except Exception:
                continue
    return None


# ─── Amount parsing ────────────────────────────────────────────────────────────

def _parse_amount(text: str) -> Optional[float]:
    # Strip currency symbols, IDR prefix, whitespace
    cleaned = re.sub(r"(?:IDR|Rp|USD|EUR|GBP|[\$€£])\s*", "", text, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s", "", cleaned)
    # Remove thousand-separator dots (dot followed by exactly 3 digits, possibly repeated)
    # e.g. "17.100.000" → "17100000", "1.881.000" → "1881000"
    cleaned = re.sub(r"\.(?=\d{3}(?:[.,]|$))", "", cleaned)
    # Remove thousand-separator commas (comma followed by exactly 3 digits)
    cleaned = re.sub(r",(?=\d{3}(?:[.,]|$))", "", cleaned)
    # Remaining comma or dot is decimal separator
    cleaned = cleaned.replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def _extract_amount_from_line(line: str) -> Optional[float]:
    """Extract a formatted amount (with thousand separators) from a text line."""
    # Match number with at least one thousand-separator group: 1.000 or 1,000 or 1.000.000
    m = re.search(r"(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?)", line)
    if m:
        return _parse_amount(m.group(1))
    # Fallback: plain number
    m = re.search(r"(\d+(?:[.,]\d+)?)", line)
    if m:
        return _parse_amount(m.group(1))
    return None


# ─── Main extractor ────────────────────────────────────────────────────────────

def extract_invoice_fields(raw_text: str) -> Dict[str, Any]:
    lines = [l.strip() for l in raw_text.splitlines() if l.strip()]
    full_text = raw_text

    result: Dict[str, Any] = {
        "invoiceNumber": None,
        "vendorName": None,
        "vendorAddress": None,
        "issueDate": None,
        "dueDate": None,
        "currency": "IDR",
        "subtotal": None,
        "taxAmount": None,
        "totalAmount": None,
        "paymentTerms": None,
        "notes": None,
    }

    # Invoice number — prefer alphanumeric with dashes/slashes (e.g. NV-2026-001)
    # Try structured format first (contains at least one letter and one dash/slash)
    inv_match = re.search(
        r"(?:invoice\s*(?:number|no\.?|#)|nomor\s*faktur|no\.\s*faktur)[:\s#\-]*([A-Z][A-Z0-9\-\/\.]{2,20})",
        full_text, re.IGNORECASE,
    )
    if not inv_match:
        inv_match = re.search(
            r"(?:invoice|faktur|no\.?|nomor)[:\s#\-]*([A-Z][A-Z0-9\-\/\.]{2,20})",
            full_text, re.IGNORECASE,
        )
    if inv_match:
        result["invoiceNumber"] = inv_match.group(1).strip()

    # Vendor name (first non-empty line or "from/dari" label)
    from_match = re.search(r"(?:from|dari|vendor|supplier|penjual)[:\s]+(.+)", full_text, re.IGNORECASE)
    if from_match:
        result["vendorName"] = from_match.group(1).strip()[:100]
    elif lines:
        result["vendorName"] = lines[0][:100]

    # Dates
    issue_match = re.search(
        r"(?:tanggal|issue\s*date|tgl|date|invoice\s*date)[:\s]+(.{5,30})",
        full_text, re.IGNORECASE,
    )
    if issue_match:
        result["issueDate"] = _parse_date(issue_match.group(1))

    due_match = re.search(
        r"(?:due\s*date|jatuh\s*tempo|payment\s*due|batas\s*pembayaran)[:\s]+(.{5,30})",
        full_text, re.IGNORECASE,
    )
    if due_match:
        result["dueDate"] = _parse_date(due_match.group(1))

    # Currency
    if re.search(r"\$|USD", full_text):
        result["currency"] = "USD"
    elif re.search(r"€|EUR", full_text):
        result["currency"] = "EUR"
    else:
        result["currency"] = "IDR"

    # Subtotal — optionally skip currency prefix before number
    sub_match = re.search(
        r"(?:subtotal|sub\s*total|dpp)[:\s]+(?:(?:IDR|Rp|USD|\$|€)\s*)?([\d\.,]+)",
        full_text, re.IGNORECASE,
    )
    if sub_match:
        result["subtotal"] = _parse_amount(sub_match.group(1))

    # Tax — skip percentage-only values; require thousand-separator format for real amounts
    # e.g. "PPN 11%: IDR 1.881.000" → capture "1.881.000", not "11"
    tax_match = re.search(
        r"(?:tax|pajak|ppn|vat|gst)[^\n]*?(?:IDR|Rp|USD|\$|€)?\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?)",
        full_text, re.IGNORECASE,
    )
    if tax_match:
        result["taxAmount"] = _parse_amount(tax_match.group(1))
    else:
        # Fallback: any number after tax keyword that is not just a percentage
        tax_fb = re.search(
            r"(?:tax|pajak|ppn|vat|gst)[:\s]+(\d+(?:[.,]\d+)?)(?!\s*%)",
            full_text, re.IGNORECASE,
        )
        if tax_fb:
            result["taxAmount"] = _parse_amount(tax_fb.group(1))

    # Total — prefer "Total Amount" / "Grand Total" / "Amount Due" over bare "Total"
    # Also require a formatted amount (with thousand separators) to avoid table headers
    total_match = re.search(
        r"(?:total\s+amount|grand\s*total|amount\s*due|jumlah\s*total)[:\s]+(?:(?:IDR|Rp|USD|\$|€)\s*)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?)",
        full_text, re.IGNORECASE,
    )
    if not total_match:
        # Fallback: any line with "total:" and a big formatted number
        total_match = re.search(
            r"(?<!\w)total[:\s]+(?:(?:IDR|Rp|USD|\$|€)\s*)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?)",
            full_text, re.IGNORECASE,
        )
    if total_match:
        result["totalAmount"] = _parse_amount(total_match.group(1))

    # Payment terms — colon is optional (handles "Payment TermsNet 30" with no separator)
    terms_match = re.search(
        r"payment\s*terms?\s*[:\s]*([A-Za-z][\w\s]{2,59})",
        full_text, re.IGNORECASE,
    )
    if terms_match:
        result["paymentTerms"] = terms_match.group(1).strip()[:100]
    else:
        terms_match2 = re.search(
            r"(?:syarat\s*pembayaran|terms?)[:\s]+(.{3,60})",
            full_text, re.IGNORECASE,
        )
        if terms_match2:
            result["paymentTerms"] = terms_match2.group(1).strip()[:100]

    return result


def extract_line_items(raw_text: str) -> List[Dict[str, Any]]:
    """
    Attempt to extract line items from tabular OCR text.
    Handles two formats:
      1. Pipe-separated:  Description | qty | unit_price | total
      2. Space-separated: Description   qty   unit_price   total
    """
    items = []
    lines = raw_text.splitlines()

    # Pattern 1: pipe-separated columns
    pipe_pat = re.compile(
        r"^([^|]+?)\s*\|\s*(\d+[\.,]?\d*)\s*\|\s*([\d\.,]+)\s*\|\s*([\d\.,]+)\s*$"
    )

    # Pattern 2: multiple spaces between fields
    space_pat = re.compile(
        r"^(.+?)\s{2,}(\d+[\.,]?\d*)\s{2,}([\d\.,]+)\s{2,}([\d\.,]+)\s*$"
    )

    # Pattern 3: description followed by 3 numbers (qty unit total) with any whitespace
    # Handles formats like "Jasa Konsultasi IT 2 5.000.000 10.000.000"
    # where numbers have thousand-separator dots
    num3_pat = re.compile(
        r"^(.+?)\s+(\d+)\s+([\d\.,]+)\s+([\d\.,]+)\s*$"
    )

    for line in lines:
        stripped = line.strip()
        if not stripped or len(stripped) < 5:
            continue

        m = pipe_pat.match(stripped) or space_pat.match(stripped)
        if m:
            desc, qty, unit_price, total = m.groups()
            # Skip header rows
            if re.match(r"(?:description|deskripsi|item|qty|jumlah|harga|total)", desc, re.IGNORECASE):
                continue
            items.append({
                "description": desc.strip(),
                "quantity": _parse_amount(qty),
                "unitPrice": _parse_amount(unit_price),
                "total": _parse_amount(total),
            })
            continue

        m3 = num3_pat.match(stripped)
        if m3:
            desc, qty, unit_price, total = m3.groups()
            # Filter: description must be text-like and last two numbers must have separators
            if re.match(r"(?:description|deskripsi|item|qty|jumlah|harga|total)", desc, re.IGNORECASE):
                continue
            # Only accept if at least one amount looks like a real price (>= 4 digits)
            unit_val = _parse_amount(unit_price)
            total_val = _parse_amount(total)
            if unit_val is not None and unit_val >= 1000:
                items.append({
                    "description": desc.strip(),
                    "quantity": _parse_amount(qty),
                    "unitPrice": unit_val,
                    "total": total_val,
                })

    return items
