"""Aggregate public CMS Federal IDR rows into a compact rate table.

Reads only CMS PUF line items and supplemental tables. Does not read private
case files, corrected determinations, training notes, or partner template text.

Dispute numbers, names, NPIs, emails, and certified IDR entity names are never
written. Outcome dispersion across entities is stored without names. One
certified entity is excluded from that dispersion and is not named in the output.
"""

from __future__ import annotations

import csv
import io
import math
import re
import zipfile
from collections import Counter, defaultdict

SENT = {"", "N/A", "N/R", "NR", "+", "^", "*", "REDACTED", "NONE", "None"}
CODE_KEEP = {
    "99285", "99284", "99283", "99282", "99281", "99213", "99291", "99292",
    "70553", "74177", "72148", "00740", "00840", "01967", "88305", "88307",
    "27447", "29881", "93458", "93306", "A0431", "A0430",
}
MIN_CODE_N = 200
MAX_CODES = 300
MIN_ENTITY_N = 25
MAX_DISPERSION_CELLS = 800

STATES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "district of columbia": "DC", "washington dc": "DC", "washington, d.c.": "DC",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
    "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
    "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
    "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
    "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
    "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
    "wisconsin": "WI", "wyoming": "WY", "puerto rico": "PR", "guam": "GU",
    "virgin islands": "VI", "american samoa": "AS",
    "northern mariana islands": "MP",
}


def excluded_from_dispersion(name: str | None) -> bool:
    """Drop one certified entity from cross-entity dispersion. The name is not returned."""
    if not name:
        return False
    return "improve" in str(name).casefold()


def published_percent(value: float | None) -> float | None:
    """Supplemental medians are percent of QPA. The 2024 Q4 workbook stores 553% as 5.53."""
    if value is None:
        return None
    if abs(value) <= 30:
        return value * 100.0
    return value


def parse_num(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        if isinstance(value, float) and math.isnan(value):
            return None
        return float(value)
    text = str(value).strip()
    if text in SENT:
        return None
    text = text.replace("%", "").replace(",", "").replace("$", "")
    try:
        return float(text)
    except ValueError:
        return None


def as_percent_of_qpa(value: float | None, unit: str) -> float | None:
    if value is None:
        return None
    return value if unit == "pct" else value * 100.0


def detect_unit(sample: list[float]) -> str:
    if not sample:
        return "pct"
    xs = sorted(sample)
    return "pct" if xs[len(xs) // 2] >= 40 else "ratio"


def ratio_band(pct: float | None) -> str | None:
    if pct is None:
        return None
    if pct < 150:
        return "under_1_5"
    if pct < 250:
        return "under_2_5"
    if pct < 500:
        return "under_5"
    return "over_5"


def clean_code(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip().upper()
    if text in SENT or text in {"NAN"}:
        return None
    if text.endswith(".0") and text[:-2].isdigit():
        text = text[:-2]
    if not re.fullmatch(r"[A-Z0-9]{4,5}", text):
        return None
    return text


def clean_pos(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        text = str(int(value))
    else:
        text = str(value).strip()
        if text.endswith(".0") and text[:-2].isdigit():
            text = text[:-2]
    if text in SENT or not re.fullmatch(r"\d{2}", text):
        return None
    return text


def clean_state(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip().upper()
    if re.fullmatch(r"[A-Z]{2}", text):
        return text
    return None


def provider_bucket(specialty: str | None, code: str | None, kind: str) -> str:
    if kind == "air" or (code or "").startswith("A043"):
        return "air_ambulance"
    text = (specialty or "").casefold()
    if re.search(r"radiolog", text):
        return "radiology"
    if re.search(r"anesthes", text):
        return "anesthesiology"
    if re.search(r"patholog", text):
        return "pathology"
    if re.search(r"orthop", text):
        return "orthopedics"
    if re.search(r"cardio", text):
        return "cardiology"
    if re.search(r"emergency|\bed\b|er services|emergency room", text):
        return "emergency_medicine"
    if code in {"99281", "99282", "99283", "99284", "99285", "99291", "99292"}:
        return "emergency_medicine"
    return "other"


def case_type_for(kind: str, code: str | None, pos: str | None) -> str:
    if kind == "air" or (code or "").startswith("A043"):
        return "air_ambulance"
    if pos in {"20", "23"} or code in {"99281", "99282", "99283", "99284", "99285", "99291", "99292"}:
        return "emergency"
    return "non_emergency"


def party_bucket(value) -> str | None:
    if value is None:
        return None
    text = str(value).casefold()
    if "air ambulance" in text:
        return "air"
    if "facility" in text:
        return "facility"
    if "provider" in text:
        return "provider"
    if "plan" in text or "issuer" in text or "fehb" in text or "carrier" in text:
        return "plan"
    return "other"


def selected_side(value) -> str | None:
    if value is None:
        return None
    text = str(value)
    if "Provider" in text or "Facility" in text or "Air" in text:
        return "provider"
    if "Plan" in text or "Issuer" in text:
        return "plan"
    return None


class Accumulator:
    def __init__(self, min_entity_n: int = MIN_ENTITY_N):
        self.min_entity_n = min_entity_n
        self.line_items = 0
        self.provider_n = 0
        self.plan_n = 0
        self.split_n = 0
        self.codes = defaultdict(lambda: [0, 0, 0])  # n, provider, plan
        self.states = defaultdict(lambda: [0, 0, 0])
        self.places = defaultdict(lambda: [0, 0, 0])
        self.buckets = defaultdict(lambda: [0, 0, 0])
        self.bands = defaultdict(lambda: [0, 0, 0])
        self.case_types = defaultdict(lambda: [0, 0, 0])
        self.parties = Counter()
        self.unit_sample: list[float] = []
        self.excluded_dispersion_lines = 0
        # (code, state, case_type) -> entity_key -> [n, provider]
        # entity_key is an in-memory intern id, not written out.
        self._entity_ids: dict[str, int] = {}
        self._next_entity = 1
        self.dispersion = defaultdict(lambda: defaultdict(lambda: [0, 0]))

    def _bump(self, bucket, key, side: str | None):
        row = bucket[key]
        row[0] += 1
        if side == "provider":
            row[1] += 1
        elif side == "plan":
            row[2] += 1

    def _entity_id(self, name: str) -> int:
        found = self._entity_ids.get(name)
        if found is not None:
            return found
        self._next_entity += 1
        self._entity_ids[name] = self._next_entity
        return self._next_entity

    def add(self, row: dict, kind: str, track_dispersion: bool = False):
        code = clean_code(row.get("Service Code"))
        pos = clean_pos(row.get("Place of Service Code"))
        state = clean_state(row.get("Location of Service"))
        specialty = row.get("Practice/Facility Specialty or Type")
        side = selected_side(row.get("Offer Selected from Provider or Issuer"))
        outcome = str(row.get("Payment Determination Outcome") or "")
        raw_offer = row.get("Provider/Facility Offer as % of QPA")
        offer_num = parse_num(raw_offer)
        if offer_num is not None and len(self.unit_sample) < 5000:
            self.unit_sample.append(offer_num)
        party = party_bucket(row.get("Initiating Party"))
        ctype = case_type_for(kind, code, pos)
        bucket = provider_bucket(None if specialty is None else str(specialty), code, kind)

        self.line_items += 1
        if "Split" in outcome:
            self.split_n += 1
        if side == "provider":
            self.provider_n += 1
        elif side == "plan":
            self.plan_n += 1
        if code:
            self._bump(self.codes, code, side)
        if state:
            self._bump(self.states, state, side)
        if pos:
            self._bump(self.places, pos, side)
        self._bump(self.buckets, bucket, side)
        self._bump(self.case_types, ctype, side)
        if party:
            self.parties[party] += 1

        if track_dispersion:
            entity = row.get("Certified IDR Entity")
            entity_text = None if entity is None else str(entity).strip()
            if entity_text in SENT or entity_text is None:
                entity_text = None
            if entity_text and excluded_from_dispersion(entity_text):
                self.excluded_dispersion_lines += 1
            elif entity_text and code and state:
                eid = self._entity_id(entity_text)
                cell = self.dispersion[(code, state, ctype)][eid]
                cell[0] += 1
                if side == "provider":
                    cell[1] += 1
        return offer_num

    def apply_offer_band(self, raw_offer: float | None, side: str | None, unit: str):
        band = ratio_band(as_percent_of_qpa(raw_offer, unit))
        if band:
            self._bump(self.bands, band, side)

    def finish_units_and_bands(self, pending: list[tuple[float | None, str | None]]):
        unit = detect_unit(self.unit_sample)
        for raw, side in pending:
            self.apply_offer_band(raw, side, unit)
        return unit


def _rate(n: int, provider: int, plan: int) -> float | None:
    decided = provider + plan
    if decided <= 0:
        return None
    return provider / decided


def _rows(counter, min_n: int, key: str):
    rows = []
    for name, (n, provider, plan) in counter.items():
        if n < min_n and name not in CODE_KEEP:
            continue
        rows.append({
            key: name,
            "n": n,
            "share": None,
            "provider_prevailing_n": provider,
            "plan_prevailing_n": plan,
            "provider_prevailing_rate": _rate(n, provider, plan),
        })
    rows.sort(key=lambda item: -item["n"])
    return rows


def _median(values: list[float]) -> float | None:
    if not values:
        return None
    xs = sorted(values)
    mid = len(xs) // 2
    if len(xs) % 2:
        return xs[mid]
    return (xs[mid - 1] + xs[mid]) / 2


def dispersion_rows(acc: Accumulator):
    cells = []
    for (code, state, ctype), entities in acc.dispersion.items():
        rates = []
        n_lines = 0
        for n, provider in entities.values():
            if n < acc.min_entity_n:
                continue
            rates.append(provider / n)
            n_lines += n
        if len(rates) < 2:
            continue
        mean = sum(rates) / len(rates)
        var = sum((rate - mean) ** 2 for rate in rates) / len(rates)
        cells.append({
            "service_code": code,
            "state": state,
            "case_type": ctype,
            "n_entities": len(rates),
            "n_lines": n_lines,
            "outcome_dispersion": math.sqrt(var),
        })
    cells.sort(key=lambda item: -item["n_lines"])
    return cells[:MAX_DISPERSION_CELLS]


def snapshot(acc: Accumulator, unit: str) -> dict:
    total = acc.line_items or 1
    codes = _rows(acc.codes, MIN_CODE_N, "code")[:MAX_CODES]
    # Always retain the demo/service allowlist when present, even below the cap cut.
    kept = {row["code"] for row in codes}
    for code, (n, provider, plan) in acc.codes.items():
        if code in CODE_KEEP and code not in kept:
            codes.append({
                "code": code,
                "n": n,
                "share": None,
                "provider_prevailing_n": provider,
                "plan_prevailing_n": plan,
                "provider_prevailing_rate": _rate(n, provider, plan),
            })
    for row in codes:
        row["share"] = row["n"] / total
    states = _rows(acc.states, 1, "state")
    places = _rows(acc.places, 1, "pos")
    buckets = _rows(acc.buckets, 1, "bucket")
    bands = []
    for band in ("under_1_5", "under_2_5", "under_5", "over_5"):
        n, provider, plan = acc.bands.get(band, [0, 0, 0])
        bands.append({
            "band": band,
            "n": n,
            "share": n / total,
            "provider_prevailing_n": provider,
            "plan_prevailing_n": plan,
            "provider_prevailing_rate": _rate(n, provider, plan),
        })
    case_types = _rows(acc.case_types, 1, "case_type")
    for group in (states, places, buckets, case_types):
        for row in group:
            row["share"] = row["n"] / total
    decided = acc.provider_n + acc.plan_n
    dispersion = dispersion_rows(acc)
    disp_values = [row["outcome_dispersion"] for row in dispersion]
    return {
        "data_source": "CMS public IDR PUF",
        "offer_unit": unit,
        "line_items": acc.line_items,
        "provider_prevailing_n": acc.provider_n,
        "plan_prevailing_n": acc.plan_n,
        "split_n": acc.split_n,
        "provider_prevailing_rate": (acc.provider_n / decided) if decided else None,
        "excluded_from_dispersion_lines": acc.excluded_dispersion_lines,
        "service_codes": codes,
        "states": states,
        "places": places,
        "provider_type_buckets": buckets,
        "offer_to_qpa_bands": bands,
        "case_types": case_types,
        "initiating_party": dict(acc.parties),
        "arbiter_dispersion": dispersion,
        "baselines": {
            "service_code_median_share": _median([row["share"] for row in codes]),
            "state_median_share": _median([row["share"] for row in states if row["n"] > 0]),
            "place_median_share": _median([row["share"] for row in places]),
            "provider_type_median_share": _median([row["share"] for row in buckets if row["bucket"] != "other"]),
            "overall_provider_prevailing_rate": (acc.provider_n / decided) if decided else None,
            "dispersion_median": _median(disp_values),
        },
    }


def iter_csv_dicts(handle):
    reader = csv.DictReader(handle)
    for row in reader:
        yield row


def consume_rows(acc: Accumulator, rows, kind: str, track_dispersion: bool) -> str:
    """Stream rows. Offer-to-QPA bands use the unit detected from the first offers in this file."""
    buffer: list[tuple[float | None, str | None]] = []
    unit: str | None = None
    sample_start = len(acc.unit_sample)

    def flush(detected: str):
        for raw, side in buffer:
            acc.apply_offer_band(raw, side, detected)
        buffer.clear()

    for row in rows:
        acc.add(row, kind, track_dispersion=track_dispersion)
        raw = parse_num(row.get("Provider/Facility Offer as % of QPA"))
        side = selected_side(row.get("Offer Selected from Provider or Issuer"))
        if unit is None:
            buffer.append((raw, side))
            if len(acc.unit_sample) - sample_start >= 400:
                unit = detect_unit(acc.unit_sample[sample_start:])
                flush(unit)
        else:
            acc.apply_offer_band(raw, side, unit)
    if unit is None:
        unit = detect_unit(acc.unit_sample[sample_start:])
        flush(unit)
    return unit


def kind_for_name(name: str) -> str | None:
    lower = name.lower()
    if "qpa" in lower or "content" in lower:
        return None
    if "air" in lower:
        return "air"
    if "emergency" in lower or "oon" in lower:
        return "oon"
    return None


def consume_xlsx(acc: Accumulator, path: str, track_dispersion: bool) -> str:
    from python_calamine import CalamineWorkbook

    workbook = CalamineWorkbook.from_path(path)
    last_unit = "pct"
    for sheet_name in workbook.sheet_names:
        kind = kind_for_name(sheet_name)
        if kind is None:
            continue
        sheet = workbook.get_sheet_by_name(sheet_name)
        iterator = sheet.iter_rows()
        header = next(iterator)
        index = {str(cell): i for i, cell in enumerate(header) if cell}
        wanted = [
            "Service Code",
            "Place of Service Code",
            "Location of Service",
            "Practice/Facility Specialty or Type",
            "Offer Selected from Provider or Issuer",
            "Provider/Facility Offer as % of QPA",
            "Payment Determination Outcome",
            "Initiating Party",
            "Certified IDR Entity",
        ]
        cols = {name: index.get(name) for name in wanted}

        def rows():
            for raw in iterator:
                out = {}
                for name, idx in cols.items():
                    out[name] = None if idx is None or idx >= len(raw) else raw[idx]
                yield out

        last_unit = consume_rows(acc, rows(), kind, track_dispersion and "Certified IDR Entity" in index)
    return last_unit


def consume_zip(acc: Accumulator, path: str, track_dispersion: bool) -> str:
    last_unit = "pct"
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            if not name.lower().endswith(".csv"):
                continue
            kind = kind_for_name(name)
            if kind is None:
                continue
            with archive.open(name) as raw:
                text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
                reader = csv.DictReader(text)
                fields = reader.fieldnames or []
                has_entity = "Certified IDR Entity" in fields
                last_unit = consume_rows(acc, reader, kind, track_dispersion and has_entity)
    return last_unit


def state_code(label: str) -> str | None:
    text = label.replace("\xa0", " ").replace("+", "").strip()
    text = re.sub(r"\s+", " ", text)
    if text.endswith("*"):
        text = text[:-1].strip()
    return STATES.get(text.casefold())


def parse_supplemental(path: str, period: str) -> dict:
    from python_calamine import CalamineWorkbook

    workbook = CalamineWorkbook.from_path(path)
    summary = list(workbook.get_sheet_by_name("Summary Tables").iter_rows())
    states = list(workbook.get_sheet_by_name("Initiations by State").iter_rows())
    outcomes = list(workbook.get_sheet_by_name("Payment Determination Outcomes").iter_rows())

    initiated = {}
    for row in summary:
        label = str(row[0] or "")
        total = parse_num(row[3] if len(row) > 3 else None)
        if total is None:
            continue
        if label.startswith("Federal IDR disputes initiated by providers"):
            initiated["provider"] = int(total)
        elif label.startswith("Federal IDR disputes initiated by facilities"):
            initiated["facility"] = int(total)
        elif label.startswith("Federal IDR disputes initiated by health plans"):
            initiated["plan"] = int(total)
        elif label.startswith("Total Federal IDR disputes initiated"):
            initiated["total"] = int(total)

    initiations = {}
    for row in states:
        label = str(row[0] or "").strip()
        if not label or label.lower().startswith("table") or "state" in label.lower():
            continue
        code = state_code(label)
        total = parse_num(row[3] if len(row) > 3 else None)
        if code and total is not None:
            initiations[code] = int(total)

    payment = {}
    for row in outcomes:
        label = str(row[0] or "")
        total = parse_num(row[3] if len(row) > 3 else None)
        if total is None:
            continue
        if label.startswith("Total Payment Determinations Made"):
            payment["determinations"] = int(total)
        elif "Provider, Facility" in label and "Prevailing" in label:
            payment["provider"] = int(total)
        elif label.startswith("Number of Payment Determinations where the Health Plan"):
            payment["plan"] = int(total)
        elif "Split" in label:
            payment["split"] = int(total)

    specialties = []
    cost_bands = []
    mode = None
    for row in outcomes:
        label = str(row[0] or "")
        if label.startswith("Table 13"):
            mode = "band"
            continue
        if label.startswith("Table 14"):
            mode = "specialty"
            continue
        if label.startswith("QPA Range") or label.startswith("CPT Range"):
            continue
        if mode == "band" and label and parse_num(row[1] if len(row) > 1 else None) is not None:
            cost_bands.append({
                "period": period,
                "qpa_range": label.strip(),
                "median_prevailing_offer_pct_of_qpa": published_percent(parse_num(row[1])),
                "payment_determinations": int(parse_num(row[2]) or 0),
                "items": int(parse_num(row[3]) or 0),
            })
        if mode == "specialty" and label and label not in {"N/A"} and parse_num(row[2] if len(row) > 2 else None) is not None:
            specialties.append({
                "period": period,
                "cpt_range": label.strip(),
                "specialty": str(row[1] or "").strip(),
                "median_prevailing_offer_pct_of_qpa": published_percent(parse_num(row[2])),
                "payment_determinations": int(parse_num(row[3]) or 0),
                "items": int(parse_num(row[4]) or 0),
            })
    return {
        "period": period,
        "initiated_by_party_type": initiated,
        "state_initiations": initiations,
        "payment_outcomes": payment,
        "qpa_cost_bands": cost_bands,
        "specialties": specialties,
    }


def merge_supplemental(parts: list[dict]) -> dict:
    states = Counter()
    initiated = Counter()
    payment = Counter()
    for part in parts:
        states.update(part["state_initiations"])
        initiated.update(part["initiated_by_party_type"])
        payment.update(part["payment_outcomes"])
    total_init = sum(states.values()) or 1
    return {
        "periods": [part["period"] for part in parts],
        "initiated_by_party_type": dict(initiated),
        "state_initiations": dict(states),
        "state_initiation_share": {code: count / total_init for code, count in states.items()},
        "payment_outcomes": dict(payment),
        "qpa_cost_bands": [row for part in parts for row in part["qpa_cost_bands"]],
        "specialties": [row for part in parts for row in part["specialties"]],
    }
