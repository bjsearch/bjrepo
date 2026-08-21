"""파싱된 PDF 데이터 + 평가된 체크리스트 → 템플릿에 주입할 리포트 JSON 스키마로 조립."""
from __future__ import annotations

import json
import re
from collections import defaultdict
from dataclasses import asdict
from datetime import date
from pathlib import Path

from .brands import BrandRegistry
from .parser import ParsedReport, DetailItem
from .rules import EvaluatedRow, EvaluatedSection, evaluate, load_rules


# 5개 핵심 진단 항목 - 고정된 제목과 설명 (수정 가능)
# 이 5개 항목은 항상 추천에 포함되며, 각 항목의 제목과 설명을 직접 수정할 수 있습니다.
FIXED_RECOMMENDATIONS = [
    {
        "rank": 1,
        "title": "암,뇌,심장 진단비",
        "explanation": "진단비는 병마 앞에서 소득이 끊겨도 일상이 무너지지 않도록 지켜주는 삶의 긴급 생존자금입니다.",
    },
    {
        "rank": 2,
        "title": "하이클래스암주요치료비",
        "explanation": "평균 암치료비 6천만원~1억원 이상 소요됩니다. 준비하고 계신 치료비로는 부족합니다.",
    },
    {
        "rank": 3,
        "title": "순환계 주요치료비",
        "explanation": "뇌,심장 질환의 반복되는 수술과 고가의 첨단 치료를 통장 잔고 걱정 없이 계속 이어나가게 해주는 필수 치료 연속권입니다.",
    },
    {
        "rank": 4,
        "title": "질병 / 상해 수술비",
        "explanation": "병원에서 수술을 받을 때마다 차곡차곡 돌려받는 실질적인 만능 생활 방어막입니다.",
    },
    {
        "rank": 5,
        "title": "간병인 입원일당",
        "explanation": "가족에게 짐이 되지 않고 '간병 파산'을 막아주는 최후의 방파제 입니다.",
    },
]


def _fmt_man(n: float) -> str:
    return f"{round(n):,.0f}"


def _fmt_currency(n: float) -> str:
    """큰 단위 통화 포맷: 억 단위, 천만 단위, 만원 단위"""
    if n == 0:
        return "0"
    abs_n = abs(n)

    if abs_n >= 10000:  # 억 단위 (10000 만원 = 1억)
        eok = n / 10000
        if abs_n >= 100000:  # 1000억 이상이면 정수로
            return f"{round(eok):,.0f}억"
        else:
            return f"{eok:,.1f}억".rstrip('0').rstrip('.')
    elif abs_n >= 1000:  # 천만 단위 (1000 만원 = 1천만)
        cheonman = n / 1000
        if abs_n >= 10000:  # 만 단위가 더 나을 때
            return f"{round(n):,.0f}만원"
        else:
            return f"{cheonman:,.1f}천만원".rstrip('0').rstrip('.')
    else:
        return f"{round(n):,.0f}만원"


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


def _load_shortfall_coverage() -> dict:
    """부족 보장 추가 데이터 로드"""
    try:
        path = Path(__file__).parent / "shortfall_coverage.json"
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"items": [], "premiums_by_age": {}}


_gender_premiums_cache = None

def _load_gender_premiums() -> dict:
    """성별별 프리미엄 데이터 로드 (캐시됨)"""
    global _gender_premiums_cache
    if _gender_premiums_cache is not None:
        return _gender_premiums_cache

    try:
        path = Path(__file__).parent / "shortfall_premiums_by_gender.json"
        with open(path, "r", encoding="utf-8") as f:
            _gender_premiums_cache = json.load(f)
            return _gender_premiums_cache
    except Exception:
        _gender_premiums_cache = {"M": {}, "F": {}}
        return _gender_premiums_cache


def _calculate_current_age(birth_date: date) -> int:
    """생년월일로부터 현재 나이 계산 (만 나이)"""
    if not birth_date:
        return 0
    today = date.today()
    age = today.year - birth_date.year
    if (today.month, today.day) < (birth_date.month, birth_date.day):
        age -= 1
    return max(0, age)


def _calculate_calculation_age(birth_date: date, base_date: date | None = None) -> int:
    """
    보험 계산 나이 계산
    1. 기준일에서 만 나이 계산
    2. 기준일과 직전 생일 사이의 기간 계산
    3. 기간이 6개월 이상이면 만 나이 + 1
    4. 기간이 6개월 미만이면 만 나이 그대로
    """
    if not birth_date:
        return 0
    if base_date is None:
        base_date = date.today()

    # 1. 만 나이 계산
    age = base_date.year - birth_date.year
    if (base_date.month, base_date.day) < (birth_date.month, birth_date.day):
        age -= 1

    # 2. 직전 생일 계산
    birthday_this_year = birth_date.replace(year=base_date.year)
    if birthday_this_year > base_date:
        birthday_this_year = birthday_this_year.replace(year=base_date.year - 1)

    # 3. 기준일과 직전 생일 사이의 기간 계산 (일 수)
    days_since_birthday = (base_date - birthday_this_year).days

    # 4. 6개월 이상이면 나이 + 1 (180일 기준)
    if days_since_birthday >= 180:
        age += 1

    return max(0, age)


def _get_available_coverage_amounts(item_name: str) -> list[int]:
    """각 상품별 가능한 보장금액 리스트 반환"""
    try:
        gender_premiums_data = _load_gender_premiums()
        male_products = gender_premiums_data.get("M", {})

        # 상품명으로 시작하는 모든 항목에서 금액 추출
        coverage_amounts = []
        prefix = item_name + "_"
        for product_name in male_products.keys():
            if product_name.startswith(prefix):
                # "상품명_100만원" 형식에서 "100"만 추출
                amount_str = product_name[len(prefix):].replace("만원", "")
                try:
                    coverage_amounts.append(int(amount_str))
                except ValueError:
                    pass

        return sorted(set(coverage_amounts))
    except Exception:
        return []


def _calculate_shortfall_premium(
    selected_item_ids: list[int], current_age: int, payment_years: int = 30, gender: str = "M",
    coverage_amounts: dict[int, int] | None = None
) -> dict:
    """부족 보장 추가 항목별 월 납입료 계산 (성별 기반)"""
    debug_log_lines = []
    debug_log_lines.append(f"\n[_calculate_shortfall_premium] Called with:")
    debug_log_lines.append(f"  selected_item_ids: {selected_item_ids}")
    debug_log_lines.append(f"  current_age: {current_age}")
    debug_log_lines.append(f"  payment_years: {payment_years}")
    debug_log_lines.append(f"  gender: {gender}")

    shortfall_data = _load_shortfall_coverage()
    items_by_id = {item["id"]: item for item in shortfall_data.get("items", [])}

    # 성별 기반 프리미엄 데이터 로드
    gender_premiums_data = _load_gender_premiums()
    if gender_premiums_data:
        debug_log_lines.append(f"  Loaded gender premiums (cached)")

    # 유효한 성별 확인 (기본값: M)
    if gender not in gender_premiums_data:
        debug_log_lines.append(f"  WARNING: Gender {gender} not found in premiums, using M")
        gender = "M"

    debug_log_lines.append(f"  Loaded {len(items_by_id)} items from shortfall_coverage.json")
    debug_log_lines.append(f"  Using gender: {gender}")
    if coverage_amounts:
        debug_log_lines.append(f"  Coverage amounts override: {coverage_amounts}")

    result = {
        "items": [],
        "monthly_total": 0,
        "total_premium": 0,
    }

    age_key = str(current_age)

    for item_id in selected_item_ids:
        if item_id not in items_by_id:
            debug_log_lines.append(f"  WARNING: Item ID {item_id} not found in items_by_id")
            continue
        item = items_by_id[item_id]

        # 성별 프리미엄 데이터에서 상품명으로 검색
        # coverage_amounts에서 지정한 금액이 있으면 사용, 없으면 기본값 사용
        if coverage_amounts and item_id in coverage_amounts:
            coverage_amount_won = coverage_amounts[item_id]
        else:
            coverage_amount_won = item["coverage_amount"] // 10000
        product_name = f"{item['name']}_{coverage_amount_won}만원"

        debug_log_lines.append(f"  Item {item_id}: Looking for product '{product_name}' at age {age_key}")

        monthly_premium = None
        if product_name in gender_premiums_data.get(gender, {}):
            age_data = gender_premiums_data[gender][product_name]
            lookup_age_key = age_key
            if lookup_age_key not in age_data and age_data:
                # 나이가 요율표 범위(20~70세) 밖이거나 생년월일 파싱/입력 오류로
                # 범위 밖 나이가 들어온 경우에도 보장 항목이 통째로 누락되지
                # 않도록, 가장 가까운 나이의 요율로 대체한다.
                available_ages = sorted(int(a) for a in age_data.keys())
                nearest_age = min(available_ages, key=lambda a: abs(a - current_age))
                lookup_age_key = str(nearest_age)
                debug_log_lines.append(f"  Item {item_id}: age {age_key} not in table, using nearest age {lookup_age_key}")
            if lookup_age_key in age_data:
                # 성별 프리미엄 데이터는 Excel에서 직접 추출한 원화 단위
                monthly_premium = age_data[lookup_age_key]
                debug_log_lines.append(f"  Item {item_id}: Found premium {monthly_premium}원 from gender data")

        # 성별 데이터가 없으면 기본 premiums_by_age 사용 (하위호환성)
        if monthly_premium is None:
            premiums_by_age = shortfall_data.get("premiums_by_age", {})
            if age_key in premiums_by_age:
                age_premiums = premiums_by_age[age_key]
                item_idx = item_id - 1
                if item_idx < len(age_premiums):
                    monthly_premium = age_premiums[item_idx]
                    debug_log_lines.append(f"  Item {item_id}: Using fallback from premiums_by_age: {monthly_premium}")

        if monthly_premium is not None:
            total_premium = monthly_premium * payment_years * 12
            debug_log_lines.append(f"  Item {item_id}: monthly={monthly_premium}, total={total_premium}")
            result["items"].append({
                "id": item_id,
                "name": item["name"],
                "display_name": item["display_name"],
                "monthly_premium": monthly_premium,
                "total_premium": total_premium,
                "monthly_premium_display": f"{monthly_premium:,}",
                "total_premium_display": f"{total_premium:,}",
            })
            result["monthly_total"] += monthly_premium
            result["total_premium"] += total_premium
        else:
            debug_log_lines.append(f"  ERROR: Could not find premium for item {item_id} at age {age_key}")

    result["monthly_total_display"] = f"{result['monthly_total']:,}"
    result["total_premium_display"] = f"{result['total_premium']:,}"

    debug_log_lines.append(f"  Final result: {len(result['items'])} items, total monthly={result['monthly_total']}, total premium={result['total_premium']}")

    with open("/tmp/shortfall_debug.log", "a", encoding="utf-8") as f:
        f.write("\n".join(debug_log_lines) + "\n")

    return result


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
        renewal_type = items[0].renewal_type

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

        # 납입 및 보장기간 (별도 필드)
        period_info = f"{period_str} · {pay_str}{progress}"

        # 상품 설명 (주요 담보만)
        top_str_formatted = top_str.replace(' · ', '\n· ')
        detail_line = f"주요 담보:\n· {top_str_formatted}{more}"

        # 총 보험료, 납입한 보험료, 잔여 보험료 계산
        total_premium_won = (total_months * premium) if total_months else None
        paid_premium_won = (elapsed_months * premium) if elapsed_months else None
        remaining_months = max(0, total_months - elapsed_months) if total_months else None
        remaining_premium_won = (remaining_months * premium) if remaining_months is not None else None

        # 이 계약과 (company, start, end)가 일치하는 실손 항목을 매칭
        for idx, ind in enumerate(parsed.indemnity_items):
            if ind.company == company and ind.start == items[0].start and ind.end == items[0].end:
                covered_indemnity_ids.add(idx)

        # 갱신 타입별 라벨 생성
        renewal_label = ""
        renewal_color = "black"
        if renewal_type == "red":
            renewal_label = "갱신형보험"
            renewal_color = "red"
        elif renewal_type == "yellow":
            renewal_label = "갱신형 특약"
            renewal_color = "gold"
        else:  # black
            renewal_label = "비갱신형"
            renewal_color = "black"

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
                "period_info": period_info,
                "detail": detail_line,
                "premium_won": premium,
                "premium_display": f"{premium:,}원",
                "total_premium_display": f"{total_premium_won:,}원" if total_premium_won is not None else "정보 없음",
                "paid_premium_display": f"{paid_premium_won:,}원" if paid_premium_won is not None else "정보 없음",
                "remaining_premium_display": f"{remaining_premium_won:,}원" if remaining_premium_won is not None else "정보 없음",
                "is_complete": is_complete,
                "renewal_type": renewal_type,
                "renewal_label": renewal_label,
                "renewal_color": renewal_color,
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

        # 실손 항목의 첫 번째 프리미엄 사용 (모두 같은 계약의 프리미엄)
        premium_won = items[0].premium_won if items else 0

        # 실손 계약의 납입 기간 계산
        basis = parsed.customer.basis_date or date.today()
        elapsed_months = _months_between(start, basis) if start else 0

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
                "premium_won": premium_won,
                "premium_display": f"{premium_won:,}원" if premium_won else "정보 없음",
                "total_premium_display": "정보 없음",
                "paid_premium_display": f"{premium_won * elapsed_months:,}원" if premium_won and elapsed_months else "정보 없음",
                "remaining_premium_display": "정보 없음",
                "is_complete": False,
                "renewal_type": "black",
                "renewal_label": "비갱신형",
                "renewal_color": "black",
                "coverages": [
                    {"name": i.coverage_name, "amount": f"{_fmt_man(i.amount_won / 10000)}"}
                    for i in items
                ],
            }
        )

    return contracts


def _build_recommendations(sections: list[EvaluatedSection], contracts: list[dict]) -> list[dict]:
    """5개 고정된 핵심 진단 항목을 반환합니다. (수정 가능)"""
    # FIXED_RECOMMENDATIONS에서 정의된 5개 항목을 그대로 사용
    return [
        {
            "rank": item["rank"],
            "title": item["title"],
            "explanation": item["explanation"],
            "detail": item["title"],  # 제목을 detail로도 사용
            "why": f"{item['title']} 보완",
            "premium_note": "설계 필요",
        }
        for item in FIXED_RECOMMENDATIONS
    ]


def _build_insights(
    sections: list[EvaluatedSection], contracts: list[dict], parsed: ParsedReport
) -> list[dict]:
    """5개 고정 핵심 진단 항목을 반환합니다 (FIXED_RECOMMENDATIONS와 동일)"""
    insights = [
        {
            "urgent": False,
            "title": item["title"],
            "text": item["explanation"],
        }
        for item in FIXED_RECOMMENDATIONS
    ]

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
    excluded_labels_for_insights = {
        "상해 80% 이상 후유장해",
        "질병 80% 이상 후유장해",
        "치매(LTC) · 경증치매 진단",
    }
    for sec in sections:
        # LTC와 80% 후유장해 제외
        gap_rows = [
            r for r in sec.rows
            if r.status == "gap"
            and "치매" not in r.label
            and "간병" not in r.label
            and r.label not in excluded_labels_for_insights
        ]
        if len(gap_rows) >= 1:  # 1개 이상으로 변경 (이전: 2개 이상)
            labels = ", ".join(r.label for r in gap_rows[:4])
            insights.append(
                {
                    "urgent": len(gap_rows) >= 3,
                    "title": f"{sec.title} 영역 보장 공백",
                    "text": f"{labels} 등이 미가입 상태입니다. 연령·리스크를 고려한 우선순위 보완이 필요합니다.",
                }
            )

    # 3. 사망보장 구조 분석 (질병사망만 언급)
    death_sec = next((s for s in sections if "사망" in s.title), None)
    if death_sec:
        by_label = {r.label: r for r in death_sec.rows}
        disease = by_label.get("질병사망")
        if disease:
            dv = _parse_leading_number(disease.held_display)
            if dv > 0 and dv < 10000:  # 추천 수준(10,000만원)보다 낮으면
                insights.append(
                    {
                        "urgent": False,
                        "title": "질병사망 보장 확대 필요",
                        "text": (
                            f"질병사망 보장이 {_fmt_man(dv)}만원으로 충분하지 않습니다. "
                            f"연령이 높아질수록 질병 리스크가 커지므로, "
                            f"질병사망 보장을 우선적으로 확대하여 적절한 수준의 생활비 · 정리자금을 확보할 필요가 있습니다."
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

    # 5. 운전자보험 평가
    driver_sec = next((s for s in sections if any("교통" in r.label or "벌금" in r.label or "부상치료" in r.label for r in s.rows)), None)
    if driver_sec:
        # 운전자보험 관련 항목들의 합계 계산
        driver_items = [r for r in driver_sec.rows if "교통" in r.label or "벌금" in r.label or "부상치료" in r.label]
        total_driver = sum(_parse_leading_number(r.held_display) for r in driver_items)
        if total_driver > 0 and total_driver <= 300:  # 30만원 이하
            insights.append(
                {
                    "urgent": False,
                    "title": "운전자보험 보강 필요",
                    "text": (
                        f"교통사고 관련 보장이 {_fmt_man(total_driver)}만원으로 부족합니다. "
                        f"자동차부상치료비, 교통사고처리지원금, 벌금 등을 종합적으로 검토하여 적절한 수준으로 보강할 필요가 있습니다."
                    ),
                }
            )

    # 6. 보험료 구조 분석
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

    # 7. 기본 리포트 - insights가 없으면 최소한 기본 분석 추가
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

    # LTC(치매/간병) 관련 내용 제거
    filtered_insights = [
        i for i in insights
        if not any(ltc_keyword in (i.get("title", "") + i.get("text", ""))
                   for ltc_keyword in ["치매", "간병", "LTC"])
    ]

    return filtered_insights


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

    # 실손의료비 항목도 포함
    indemnity_groups = defaultdict(list)
    for ind in parsed.indemnity_items:
        indemnity_groups[(ind.company, ind.start, ind.end)].append(ind)
    for (company, start_s, end_s), items in indemnity_groups.items():
        start = _parse_ymd(start_s)
        premium = items[0].premium_won if items else 0
        if not premium or not start:
            continue
        elapsed = min(_months_between(start, basis), 600)  # 최대 50년
        paid_total += elapsed * premium
        scheduled_total += elapsed * premium  # 실손은 종신이므로 동일하게 계산

    header = {
        "name": parsed.customer.name,
        "gender": parsed.customer.gender or "-",
        "birth_display": parsed.customer.birth_date.strftime("%Y.%m.%d") if parsed.customer.birth_date else "-",
        "customer_birth_date": parsed.customer.birth_date.strftime("%Y-%m-%d") if parsed.customer.birth_date else "",
        "age": parsed.customer.age_insurance,
        "basis_date_display": basis.strftime("%Y.%m.%d") if basis else "-",
        "total_contracts": len(contracts),
        "life_count": sum(1 for c in contracts if registry.get(c["company"]).kind == "생보"),
        "nonlife_count": sum(1 for c in contracts if registry.get(c["company"]).kind == "손보"),
        "coop_count": sum(1 for c in contracts if registry.get(c["company"]).kind == "공제"),
    }

    grand_total = paid_total + scheduled_total
    kpis = {
        "monthly_premium": f"{total_premium:,}",
        "paid_total": f"{paid_total:,}",
        "scheduled_total": f"{scheduled_total:,}",
        "grand_total": f"{grand_total:,}",
        "paid_total_man": _fmt_man(paid_total / 10000000),
        "paid_total_currency": _fmt_currency(paid_total / 10000000),
        "scheduled_total_man": _fmt_man(scheduled_total / 10000000),
        "scheduled_total_currency": _fmt_currency(scheduled_total / 10000000),
        "grand_total_man": _fmt_man(grand_total / 10000000),
        "grand_total_currency": _fmt_currency(grand_total / 10000000),
        "ok_count": ok,
        "warn_count": warn,
        "gap_count": gap,
    }

    matrix = _build_matrix(parsed, contracts, registry, rules)

    # 리포트 편집에서 제외할 항목들 (90% 후유장해, 치매/간병 관련)
    excluded_labels = {
        "상해 80% 이상 후유장해",
        "질병 80% 이상 후유장해",
        "치매(LTC) · 경증치매 진단",
    }

    def should_exclude_from_editing(label: str) -> bool:
        if label in excluded_labels:
            return True
        if "간병" in label and "LTC" in label:
            return True
        return False

    # 부족 보장 추가 데이터 준비
    shortfall_data = _load_shortfall_coverage()
    current_age = _calculate_current_age(parsed.customer.birth_date)
    shortfall_items = []
    for item in shortfall_data.get("items", []):
        shortfall_items.append({
            "id": item["id"],
            "name": item["name"],
            "display_name": item["display_name"],
            "coverage_amount": item["coverage_amount"],
            "coverage_amount_display": f"{item['coverage_amount']:,}",
        })

    return {
        "header": header,
        "brands_legend": brands_legend,
        "kpis": kpis,
        "contracts": contracts,
        "recommendations": reco,
        "coverage_sections": [
            {
                "title": sec.title,
                "rows": [
                    {**asdict(r), "excluded_from_editing": should_exclude_from_editing(r.label)}
                    for r in sec.rows
                ],
            }
            for sec in sections
        ],
        "matrix": matrix,
        "insights": insights,
        "shortfall_coverage": {
            "items": shortfall_items,
            "current_age": current_age,
            "selected_ids": [],
            "premium_data": None,
        },
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
                cells.append(_fmt_currency(amt) if amt else None)
                total += amt
            rows.append({"label": cat, "cells": cells, "total": _fmt_currency(total) if total else "—"})
        matrix_groups.append({"title": gtitle, "rows": rows})

    return {"columns": columns, "groups": matrix_groups}
