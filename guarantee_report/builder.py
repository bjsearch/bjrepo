"""파싱된 PDF 데이터 + 평가된 체크리스트 → 템플릿에 주입할 리포트 JSON 스키마로 조립."""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import asdict
from datetime import date

from .brands import BrandRegistry
from .parser import ParsedReport, DetailItem
from .rules import EvaluatedRow, EvaluatedSection, evaluate, load_rules


def _fmt_man(n: float) -> str:
    return f"{round(n):,.0f}"


def _parse_leading_number(s: str) -> float:
    """'각 10', '10,000', '10 / 20', '—' 등에서 첫 숫자를 안전하게 뽑는다."""
    m = re.search(r"[\d,]+(?:\.\d+)?", s or "")
    return float(m.group().replace(",", "")) if m else 0.0


def _fmt_date_dot(d: date) -> str:
    return f"{d.year}.{d.month:02d}"


def _parse_ymd(s: str) -> date | None:
    try:
        if not s:
            return None
        y, m, d = (int(x) for x in s.split("-"))
        return date(y, m, d)
    except Exception:
        return None


def _months_between(a: date, b: date) -> int:
    return max(0, (b.year - a.year) * 12 + (b.month - a.month) - (1 if b.day < a.day else 0))


def _build_contracts(parsed: ParsedReport, brand_registry: BrandRegistry) -> list[dict]:
    groups: dict[tuple[str, str], list[DetailItem]] = defaultdict(list)
    order: list[tuple[str, str]] = []
    for d in parsed.detail_items:
        key = (d.company, d.product)
        if key not in groups:
            order.append(key)
        groups[key].append(d)

    basis = parsed.customer.basis_date or date.today()
    contracts = []
    covered_indemnity_ids = set()

    for key in order:
        company, product = key
        items = groups[key]
        brand = brand_registry.get(company)
        start = _parse_ymd(items[0].start)
        end_raw = items[0].end
        end = _parse_ymd(end_raw)
        pay_years = items[0].pay_years
        premium = items[0].premium_won

        is_lifetime = end_raw == "9999-12-31"
        end_label = "종신" if is_lifetime else (_fmt_date_dot(end) if end else "-")

        elapsed_months = _months_between(start, basis) if start else 0
        total_months = (pay_years or 0) * 12
        is_complete = total_months > 0 and elapsed_months >= total_months
        elapsed_months = min(elapsed_months, total_months) if total_months else elapsed_months
        complete_year = start.year + pay_years if (start and pay_years) else None

        badge = None
        if not is_lifetime and end:
            years_span = end.year - start.year if start else None
            label = "갱신" if (years_span and years_span <= 8) or "실손" in product else "만기"
            badge = f"{_fmt_date_dot(end)} {label}"

        cat_amounts: dict[str, int] = defaultdict(int)
        for it in items:
            cat_amounts[it.category] += it.amount_man
        top = sorted(cat_amounts.items(), key=lambda kv: -kv[1])
        top_str = " · ".join(f"{c} {_fmt_man(a)}" for c, a in top[:5])
        more = f" 등 {len(cat_amounts)}종" if len(cat_amounts) > 5 else ""

        period_str = f"{_fmt_date_dot(start)} ~ {end_label}" if start else end_label
        pay_str = f"{pay_years}년납" if pay_years else items[0].pay_method
        progress = f" ({elapsed_months}/{total_months}회, ~{complete_year}년)" if total_months else ""

        top_str_formatted = top_str.replace(' · ', '\n· ')
        detail_line = f"{period_str}\n· {pay_str}{progress}\n주요 담보:\n· {top_str_formatted}{more}"

        # 총 보험료 및 잔여 보험료 계산
        total_premium_won = (total_months * premium) if total_months else None
        remaining_months = max(0, total_months - elapsed_months) if total_months else None
        remaining_premium_won = (remaining_months * premium) if remaining_months is not None else None

        # 이 계약과 (company, start, end)가 일치하는 실손 항목을 매칭
        for idx, ind in enumerate(parsed.indemnity_items):
            if ind.company == company and ind.start == items[0].start and ind.end == items[0].end:
                covered_indemnity_ids.add(idx)

        contracts.append(
            {
                "company": company,
                "brand_code": brand.code,
                "brand_color": brand.color,
                "brand_color_bg": brand.color_bg,
                "logo_html": brand.logo_html,
                "title": product,
                "badge": badge,
                "end_date_iso": None if is_lifetime else end_raw,
                "detail": detail_line,
                "premium_won": premium,
                "premium_display": f"{premium:,}원",
                "total_premium_display": f"{total_premium_won:,}원" if total_premium_won is not None else "정보 없음",
                "remaining_premium_display": f"{remaining_premium_won:,}원" if remaining_premium_won is not None else "정보 없음",
                "is_complete": is_complete,
                "coverages": [
                    {"name": cat, "amount": f"{_fmt_man(amt)}"}
                    for cat, amt in top
                ],
            }
        )

    # 정액 상세내역에 없는(=순수 실손 전용) 계약: company+start+end로 그룹화
    indemnity_groups: dict[tuple[str, str, str], list] = defaultdict(list)
    for idx, ind in enumerate(parsed.indemnity_items):
        if idx in covered_indemnity_ids:
            continue
        indemnity_groups[(ind.company, ind.start, ind.end)].append(ind)

    for (company, start_s, end_s), items in indemnity_groups.items():
        brand = brand_registry.get(company)
        start = _parse_ymd(start_s)
        end = _parse_ymd(end_s)
        is_lifetime = end_s == "9999-12-31"
        end_label = "종신" if is_lifetime else (_fmt_date_dot(end) if end else "-")
        badge = None
        if not is_lifetime and end:
            badge = f"{_fmt_date_dot(end)} 갱신"
        cov_str = " · ".join(
            f"{i.coverage_name} {_fmt_man(i.amount_won / 10000)}" for i in items[:4]
        )
        title = "실손의료보험"
        detail_line = f"{_fmt_date_dot(start) if start else '-'} 가입 · {cov_str}"
        contracts.append(
            {
                "company": company,
                "brand_code": brand.code,
                "brand_color": brand.color,
                "brand_color_bg": brand.color_bg,
                "logo_html": brand.logo_html,
                "title": title,
                "badge": badge,
                "end_date_iso": None if is_lifetime else end_s,
                "detail": detail_line,
                "premium_won": None,
                "premium_display": "주계약 합산",
                "total_premium_display": "정보 없음",
                "remaining_premium_display": "정보 없음",
                "is_complete": False,
                "coverages": [
                    {"name": i.coverage_name, "amount": f"{_fmt_man(i.amount_won / 10000)}"}
                    for i in items
                ],
            }
        )

    return contracts


def _build_recommendations(sections: list[EvaluatedSection], contracts: list[dict]) -> list[dict]:
    recos = []

    maturing = sorted(
        (
            c
            for c in contracts
            if c["badge"] and "만기" in c["badge"] and any(k in c["title"] for k in ("암",))
        ),
        key=lambda c: c["end_date_iso"],
    )
    if maturing:
        c = maturing[0]
        recos.append(
            {
                "why": f"{c['badge']} 대비",
                "title": "유병자(간편심사) 암보험",
                "detail": (
                    f"{c['title']} 만기({c['badge']}) 전 대체 라인 확보 목적 · "
                    f"만기 후 해당 보험료({c['premium_display']})를 재원으로 전환 가능"
                ),
                "premium_note": "설계 필요 · 간편심사 기준",
            }
        )

    dementia_gap = False
    for sec in sections:
        if "치매" in sec.title or any("치매" in r.label for r in sec.rows):
            for r in sec.rows:
                if "치매" in r.label and r.status == "gap":
                    dementia_gap = True
    if dementia_gap:
        recos.append(
            {
                "why": "치매 · 간병 전면 공백",
                "title": "치매 · 간병보험 (LTC)",
                "detail": "치매(LTC) 진단 및 경증치매 진단 담보 신규 확보 · 간병인 지원 일당 보강",
                "premium_note": "설계 필요 · 진단형 우선",
            }
        )

    gaps = []
    for sec in sections:
        for r in sec.rows:
            if r.status == "gap" and r.recommend_display != "—":
                gaps.append((sec.title, r))
    gaps.sort(key=lambda t: -_parse_leading_number(t[1].recommend_display))
    for sec_title, r in gaps:
        if len(recos) >= 3:
            break
        if any(r.label in existing["title"] for existing in recos):
            continue
        recos.append(
            {
                "why": f"{r.label} 미가입",
                "title": f"{r.label} 보완 특약/보험",
                "detail": f"{sec_title} 영역 · 권장 {r.recommend_display}만원 수준 신규 확보 검토",
                "premium_note": "설계 필요",
            }
        )

    for i, r in enumerate(recos[:3]):
        r["rank"] = i + 1
    return recos[:3]


def _build_insights(
    sections: list[EvaluatedSection], contracts: list[dict], parsed: ParsedReport
) -> list[dict]:
    insights = []

    # 1. 만기 도래 계약 분석
    maturing = sorted(
        (c for c in contracts if c["badge"] and "만기" in c["badge"]),
        key=lambda c: c["end_date_iso"],
    )
    if maturing:
        c = maturing[0]
        insights.append(
            {
                "urgent": True,
                "title": f"가장 시급: {c['badge']} — 계약 만기 이후 보장 공백",
                "text": (
                    f"{c['title']} 계약이 {c['badge']} 시점에 소멸합니다. 만기 시점 이후 보험나이가 높아져 "
                    f"신규 가입 문턱이 크게 높아지므로, 만기 전 대체 라인 확보를 검토해야 합니다."
                ),
            }
        )

    # 2. 섹션별 보장 공백 분석
    for sec in sections:
        gap_rows = [r for r in sec.rows if r.status == "gap"]
        if len(gap_rows) >= 1:  # 1개 이상으로 변경 (이전: 2개 이상)
            labels = ", ".join(r.label for r in gap_rows[:4])
            insights.append(
                {
                    "urgent": len(gap_rows) >= 3,
                    "title": f"{sec.title} 영역 보장 공백",
                    "text": f"{labels} 등이 미가입 상태입니다. 연령·리스크를 고려한 우선순위 보완이 필요합니다.",
                }
            )

    # 3. 사망보장 구조 분석
    death_sec = next((s for s in sections if "사망" in s.title), None)
    if death_sec:
        by_label = {r.label: r for r in death_sec.rows}
        injury = by_label.get("상해사망")
        disease = by_label.get("질병사망")
        if injury and disease:
            iv = _parse_leading_number(injury.held_display)
            dv = _parse_leading_number(disease.held_display)
            if iv > 0 and dv > 0 and iv > dv * 2:
                insights.append(
                    {
                        "urgent": False,
                        "title": "사망보장의 상해 편중 — 질병 계열 보강 필요",
                        "text": (
                            f"상해사망 {_fmt_man(iv)}만원 대비 질병사망은 {_fmt_man(dv)}만원으로 구조가 "
                            f"역전되어 있습니다. 연령이 높아질수록 실제 리스크는 질병 쪽이 커지므로, "
                            f"사망보장의 목적(생활비 · 정리자금)을 정한 뒤 질병 계열 중심으로 재배분할 필요가 있습니다."
                        ),
                    }
                )

    # 4. 실손 보험 갱신 관리
    renewing_indemnity = [c for c in contracts if c["premium_display"] == "주계약 합산" and c["badge"]]
    if renewing_indemnity:
        c = renewing_indemnity[0]
        detail_info = (c['detail'] or "").split(' 가입')[0] if c.get('detail') else ""
        insights.append(
            {
                "urgent": False,
                "title": f"실손은 {c['badge']} — 청구 이력 관리",
                "text": (
                    f"{c['title']}({detail_info} 가입)이 유일한 실손 계약입니다. "
                    f"갱신 시 연령 및 비급여 이용량에 따라 보험료가 오를 수 있어, 갱신 전 보장 구조와 "
                    f"보험료 변화를 함께 점검하는 것이 좋습니다."
                ),
            }
        )

    # 5. 보험료 구조 분석
    total_premium = sum(c["premium_won"] or 0 for c in contracts)
    top_contracts = sorted((c for c in contracts if c["premium_won"]), key=lambda c: -c["premium_won"])[:2]
    if top_contracts and total_premium:
        top_sum = sum(c["premium_won"] for c in top_contracts)
        pct = round(top_sum / total_premium * 100)
        names = " · ".join(c["company"] for c in top_contracts)
        insights.append(
            {
                "urgent": False,
                "title": f"보험료 구조: 월 {_fmt_man(total_premium/10000)}만원 중 {pct}%가 {names}",
                "text": (
                    f"{names} 계약의 보험료 비중이 전체의 {pct}%를 차지합니다. 만기가 도래하는 계약의 "
                    f"보험료를 만기 후 보완 설계 재원으로 전환하면 총 지출 증가 없이 공백을 메울 수 있습니다."
                ),
            }
        )

    # 6. 기본 리포트 - insights가 없으면 최소한 기본 분석 추가
    if not insights:
        ok_count = sum(len([r for r in sec.rows if r.status == "ok"]) for sec in sections)
        total_rows = sum(len(sec.rows) for sec in sections)
        insights.append(
            {
                "urgent": False,
                "title": "현재 보장 현황 분석",
                "text": (
                    f"총 {total_rows}개 항목 중 {ok_count}개 항목이 적정하게 보장되고 있습니다. "
                    f"보장 상태를 주기적으로 검토하여 변화하는 생활 상황과 리스크에 대응하는 것이 중요합니다."
                ),
            }
        )

    return insights


def build_report_data(parsed: ParsedReport, rules_path: str | None = None) -> dict:
    rules = load_rules(rules_path)
    registry = BrandRegistry()

    sections, consumed = evaluate(
        rules, parsed.category_totals, parsed.indemnity_items, parsed.detail_items, registry
    )

    contracts = _build_contracts(parsed, registry)
    reco = _build_recommendations(sections, contracts)
    insights = _build_insights(sections, contracts, parsed)

    # 브랜드 범례
    company_products: dict[str, set] = defaultdict(set)
    for c in contracts:
        company_products[c["company"]].add(c["title"])
    brands_legend = [
        {
            "logo_html": registry.get(company).logo_html,
            "name": company,
            "count_label": f"{len(products)}건",
        }
        for company, products in company_products.items()
    ]

    total_premium = sum(c["premium_won"] or 0 for c in contracts)
    basis = parsed.customer.basis_date or date.today()

    # KPI: 진단 결과 카운트
    ok = warn = gap = 0
    for sec in sections:
        for r in sec.rows:
            if r.status == "ok":
                ok += 1
            elif r.status == "warn":
                warn += 1
            else:
                gap += 1

    # 계약별 납입 완료/예정 (근사): 회차 계산은 _build_contracts와 동일 로직 재사용
    paid_total = 0
    scheduled_total = 0
    groups = defaultdict(list)
    for d in parsed.detail_items:
        groups[(d.company, d.product)].append(d)
    for (company, product), items in groups.items():
        start = _parse_ymd(items[0].start)
        pay_years = items[0].pay_years
        premium = items[0].premium_won
        if not (start and pay_years):
            continue
        elapsed = min(_months_between(start, basis), pay_years * 12)
        total = pay_years * 12
        paid_total += elapsed * premium
        scheduled_total += total * premium

    header = {
        "name": parsed.customer.name,
        "gender": parsed.customer.gender or "-",
        "birth_display": parsed.customer.birth_date.strftime("%Y.%m.%d") if parsed.customer.birth_date else "-",
        "age": parsed.customer.age_insurance,
        "basis_date_display": basis.strftime("%Y.%m.%d") if basis else "-",
        "total_contracts": len(contracts),
        "life_count": sum(1 for c in contracts if registry.get(c["company"]).kind == "생보"),
        "nonlife_count": sum(1 for c in contracts if registry.get(c["company"]).kind == "손보"),
        "coop_count": sum(1 for c in contracts if registry.get(c["company"]).kind == "공제"),
    }

    kpis = {
        "monthly_premium": f"{total_premium:,}",
        "paid_total_man": _fmt_man(paid_total / 10000),
        "scheduled_total_man": _fmt_man(scheduled_total / 10000),
        "grand_total_man": _fmt_man((paid_total + scheduled_total) / 10000),
        "ok_count": ok,
        "warn_count": warn,
        "gap_count": gap,
    }

    matrix = _build_matrix(parsed, contracts, registry, rules)

    return {
        "header": header,
        "brands_legend": brands_legend,
        "kpis": kpis,
        "contracts": contracts,
        "recommendations": reco,
        "coverage_sections": [
            {
                "title": sec.title,
                "rows": [asdict(r) for r in sec.rows],
            }
            for sec in sections
        ],
        "matrix": matrix,
    "insights": insights,
    }


def _build_matrix(parsed: ParsedReport, contracts: list[dict], registry: BrandRegistry, rules: dict) -> dict:
    # 컬럼 = 정액 상세내역이 있는 계약만 (실손전용 계약은 매트릭스 대상에서 제외)
    groups: dict[tuple[str, str], list[DetailItem]] = defaultdict(list)
    order: list[tuple[str, str]] = []
    for d in parsed.detail_items:
        key = (d.company, d.product)
        if key not in groups:
            order.append(key)
        groups[key].append(d)

    columns = []
    for company, product in order:
        items = groups[(company, product)]
        brand = registry.get(company)
        start = _parse_ymd(items[0].start)
        end_raw = items[0].end
        end_label = "종신" if end_raw == "9999-12-31" else (_fmt_date_dot(_parse_ymd(end_raw)) if _parse_ymd(end_raw) else "-")
        columns.append(
            {
                "key": f"{company}|{product}",
                "brand_code": brand.code,
                "brand_color": brand.color,
                "short_title": product[:14],
                "period": f"{_fmt_date_dot(start) if start else '-'}~{end_label}",
            }
        )

    cat_to_group: dict[str, str] = dict(rules.get("matrix_group_hints", {}))
    for sec in rules["sections"]:
        for r in sec["rows"]:
            for c in r.get("categories", []):
                cat_to_group[c] = sec["title"]

    all_categories = sorted({d.category for d in parsed.detail_items})
    grouped: dict[str, list[str]] = defaultdict(list)
    for cat in all_categories:
        grouped[cat_to_group.get(cat, "기타 보장")].append(cat)

    group_order = [s["title"] for s in rules["sections"]] + ["기타 보장"]
    matrix_groups = []
    for gtitle in group_order:
        cats = grouped.get(gtitle)
        if not cats:
            continue
        rows = []
        for cat in cats:
            cells = []
            total = 0
            for company, product in order:
                amt = sum(d.amount_man for d in groups[(company, product)] if d.category == cat)
                cells.append(amt if amt else None)
                total += amt
            rows.append({"label": cat, "cells": cells, "total": total})
        matrix_groups.append({"title": gtitle, "rows": rows})

    return {"columns": columns, "groups": matrix_groups}
