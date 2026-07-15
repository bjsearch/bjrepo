"""
권장 보장금액 체크리스트 평가 엔진.

rules_default.json (또는 --rules로 지정한 커스텀 파일)에 정의된 표준 보장 항목별로,
파싱된 PDF의 category_totals(정액) / indemnity_items(실손) 데이터를 매칭해
가입금액 · 충족도 · 진단(적정/주의/부족/미가입)을 계산한다.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field

from .parser import CategoryTotal, DetailItem, IndemnityItem


@dataclass
class EvaluatedRow:
    label: str
    recommend_display: str
    held_display: str
    ratio: float  # 0.0 ~ 1.0+ (게이지용, 1.0 = 100%)
    status: str  # ok | warn | gap
    diagnosis: str
    source_brand_codes: list[str] = field(default_factory=list)


@dataclass
class EvaluatedSection:
    title: str
    rows: list[EvaluatedRow]


def load_rules(path: str | None = None) -> dict:
    if path is None:
        import importlib.resources as res

        path = str(res.files(__package__) / "rules_default.json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _held_for_categories(totals_by_cat: dict[str, int], categories: list[str]) -> int:
    return sum(totals_by_cat.get(c, 0) for c in categories)


def _held_for_contains(totals_by_cat: dict[str, int], needles: list[str]) -> int:
    total = 0
    for cat, amt in totals_by_cat.items():
        if any(n in cat for n in needles):
            total += amt
    return total


def _fmt(n: float) -> str:
    n = round(n)
    return f"{n:,.0f}"


def _classify(held: float, recommend: float | None) -> tuple[str, str, float]:
    """반환: (status, diagnosis_label, ratio)"""
    if recommend is None:
        status = "ok" if held > 0 else "gap"
        return status, ("보유" if held > 0 else "미가입"), (1.0 if held > 0 else 0.02)
    if held <= 0:
        return "gap", "미가입", 0.02
    ratio = held / recommend
    if ratio >= 1:
        diff = held - recommend
        label = "적정" if diff == 0 else f"적정 +{_fmt(diff)}"
        return "ok", label, min(ratio, 1.0) if ratio == 1 else 1.0
    diff = recommend - held
    word = "주의" if ratio >= 0.5 else "부족"
    return "warn", f"{word} −{_fmt(diff)}", ratio


def _source_brands(detail_items: list[DetailItem], categories: list[str], brand_registry) -> list[str]:
    codes = []
    seen = set()
    for d in detail_items:
        if d.category in categories and d.company not in seen:
            seen.add(d.company)
            codes.append(brand_registry.get(d.company).code)
    return codes


def evaluate(
    rules: dict,
    category_totals: list[CategoryTotal],
    indemnity_items: list[IndemnityItem],
    detail_items: list[DetailItem],
    brand_registry,
) -> tuple[list[EvaluatedSection], set[str]]:
    totals_by_cat = {c.category: c.total_amount_man for c in category_totals}
    consumed: set[str] = set()
    sections: list[EvaluatedSection] = []

    for sec in rules["sections"]:
        rows: list[EvaluatedRow] = []
        for r in sec["rows"]:
            kind = r.get("kind", "simple")
            categories = r.get("categories", [])
            for c in categories:
                consumed.add(c)

            if kind == "indemnity_pair" or kind == "indemnity_sum":
                match = r["match"]
                matched = [
                    i for i in indemnity_items
                    if match in i.detail_type or match in i.coverage_name
                ]
                disease = sum(i.amount_won for i in matched if "질병" in i.coverage_name) // 10000
                injury = sum(i.amount_won for i in matched if "질병" not in i.coverage_name) // 10000
                if kind == "indemnity_sum":
                    held = disease + injury
                    recommend = r.get("recommend")
                    status, diag, ratio = _classify(held, recommend)
                    held_disp = _fmt(held)
                    rec_disp = _fmt(recommend) if recommend is not None else "—"
                else:
                    recommend = r.get("recommend")
                    held_disp = f"{_fmt(injury)} / {_fmt(disease)}"
                    rec_disp = f"{_fmt(recommend)}" if recommend is not None else "—"
                    min_held = min(injury, disease) if matched else 0
                    status, diag, ratio = _classify(min_held, recommend)
                rows.append(EvaluatedRow(r["label"], rec_disp, held_disp, ratio, status, diag, []))
                continue

            if "categories_contains" in r:
                held = _held_for_contains(totals_by_cat, r["categories_contains"])
            else:
                held = _held_for_categories(totals_by_cat, categories)
                mult = r.get("multiplier")
                if mult:
                    held = held * mult

            recommend = r.get("recommend")

            if kind == "each_pair":
                a_cat, b_cat = categories[0], categories[1]
                a = totals_by_cat.get(a_cat, 0)
                b = totals_by_cat.get(b_cat, 0)
                held_disp = f"각 {_fmt(a)}" if a == b else f"{_fmt(a)} / {_fmt(b)}"
                rec_disp = f"각 {_fmt(recommend)}" if recommend is not None else "—"
                min_held = min(a, b)
                status, diag, ratio = _classify(min_held, recommend)
                if recommend and min_held > 0 and status == "warn":
                    word = "주의" if (min_held / recommend) >= 0.5 else "부족"
                    diag = f"{word} −{_fmt(recommend - min_held)}"
            elif kind == "info":
                held_disp = _fmt(held) if held else "—"
                rec_disp = "—"
                status, diag, ratio = _classify(held, None)
            else:
                held_disp = _fmt(held) if held else "—"
                rec_disp = _fmt(recommend) if recommend is not None else "—"
                status, diag, ratio = _classify(held, recommend)

            src = _source_brands(detail_items, categories, brand_registry) if categories else []
            rows.append(EvaluatedRow(r["label"], rec_disp, held_disp, ratio, status, diag, src))

        sections.append(EvaluatedSection(sec["title"], rows))

    return sections, consumed
