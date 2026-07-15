"""
'보험신용정보 통합조회 결과서' (신용정보원 제공, 실손/정액 보장분석 원본) PDF 파서.

이 포맷은 GA/FC 업계에서 널리 쓰이는 표준 조회서 양식으로, 고객명 · RRN 마스킹 ·
실손보상담보조회 내역 · 정액담보계약정보조회 내역(보장별 합계) ·
정액담보계약정보조회 상세내역(계약별 라인아이템)의 4개 구획으로 고정되어 있다.
이 구조를 가정하고 파싱한다 — 다른 양식의 PDF는 지원하지 않는다.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date


@dataclass
class Customer:
    name: str
    rrn_masked: str
    birth_date: date | None
    gender: str | None  # "남" | "여"
    age_insurance: int | None
    handler: str
    basis_date: date | None


@dataclass
class IndemnityItem:
    """실손(비례) 보상담보 — 실제 손해액 기준으로 보상하는 담보."""
    seq: int
    company: str
    start: str
    end: str
    amount_won: int
    coverage_name: str  # 보장내용 (예: "상해(일반상해...)", "가족생활배상책임담보")
    detail_type: str = ""  # 담보특성 (예: "입원의료비", "외래의료비")


@dataclass
class CategoryTotal:
    """정액담보 보장명별 합계 (요약 테이블)."""
    seq: int
    category: str
    count: int
    total_amount_man: int  # 만원


@dataclass
class DetailItem:
    """정액담보 상세내역 — 계약(상품) 단위 라인아이템."""
    company: str
    product: str
    start: str
    end: str
    pay_years: int | None
    pay_method: str
    premium_won: int
    rider_name: str
    category: str
    amount_man: int
    status: str


@dataclass
class ParsedReport:
    customer: Customer
    indemnity_items: list[IndemnityItem] = field(default_factory=list)
    category_totals: list[CategoryTotal] = field(default_factory=list)
    detail_items: list[DetailItem] = field(default_factory=list)


def _to_int(s: str | None) -> int:
    if not s:
        return 0
    s = s.replace(",", "").replace(" ", "").strip()
    if s in ("", "-"):
        return 0
    try:
        return int(s)
    except ValueError:
        m = re.search(r"-?\d+", s)
        return int(m.group()) if m else 0


def _join_cell(v) -> str:
    if v is None:
        return ""
    return re.sub(r"\s*\n\s*", "", str(v)).strip()


def _tidy_product_name(name: str) -> str:
    """개행 접합으로 붙어버린 상품코드(끝 3~4자리 숫자) 앞에 공백을 되살린다."""
    return re.sub(r"(?<=[가-힣\)가-힣])(\d{3,4})$", r" \1", name)


def _parse_rrn(rrn_part: str) -> tuple[date | None, str | None]:
    m = re.search(r"(\d{2})(\d{2})(\d{2})-(\d)", rrn_part)
    if not m:
        return None, None
    yy, mm, dd, g = m.groups()
    g = int(g)
    century = 1900 if g in (1, 2, 5, 6) else 2000
    try:
        birth = date(century + int(yy), int(mm), int(dd))
    except ValueError:
        return None, None
    gender = "남" if g % 2 == 1 else "여"
    return birth, gender


def _insurance_age(birth: date, basis: date) -> int:
    """보험나이 = 만나이, 6개월 이상 경과 시 올림."""
    years = basis.year - birth.year
    anniversary = date(basis.year, birth.month, birth.day) if _valid_date(basis.year, birth.month, birth.day) else date(basis.year, birth.month, 28)
    if basis < anniversary:
        years -= 1
        anniversary = date(basis.year - 1, birth.month, birth.day) if _valid_date(basis.year - 1, birth.month, birth.day) else date(basis.year - 1, birth.month, 28)
    months_since = (basis.year - anniversary.year) * 12 + (basis.month - anniversary.month) - (1 if basis.day < anniversary.day else 0)
    return years + (1 if months_since >= 6 else 0)


def _valid_date(y: int, m: int, d: int) -> bool:
    try:
        date(y, m, d)
        return True
    except ValueError:
        return False


def _parse_pay_years(text: str) -> int | None:
    m = re.search(r"(\d+)\s*년", text)
    return int(m.group(1)) if m else None


class ReportParseError(Exception):
    pass


def parse_pdf(pdf_path: str) -> ParsedReport:
    import pdfplumber

    full_text_pages: list[str] = []
    all_tables: list[list[list]] = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            full_text_pages.append(page.extract_text() or "")
            all_tables.extend(page.extract_tables())

    full_text = "\n".join(full_text_pages)

    if "정액담보계약정보조회" not in full_text and "실손보상담보" not in full_text:
        raise ReportParseError(
            "'보험신용정보 통합조회 결과서' 형식의 PDF가 아닙니다. "
            "신용정보원 제공 보장분석 조회서만 지원합니다."
        )

    customer = _parse_customer(full_text)
    indemnity_items = _parse_indemnity_table(all_tables)
    category_totals = _parse_category_totals(all_tables)
    detail_items = _parse_detail_items(all_tables)

    return ParsedReport(
        customer=customer,
        indemnity_items=indemnity_items,
        category_totals=category_totals,
        detail_items=detail_items,
    )


def _parse_customer(full_text: str) -> Customer:
    m_name = re.search(r"조회대상자\s+(\S+)\s*\(([\d-]+\*+)\)", full_text)
    name = m_name.group(1) if m_name else "고객"
    rrn_masked = m_name.group(2) if m_name else ""

    m_handler = re.search(r"취급자\s+(.+?)\s*\(\d+\)", full_text)
    handler = m_handler.group(1).strip() if m_handler else ""

    m_basis = re.search(r"조회일시\s+\S+\s*/\s*(\d{4}-\d{2}-\d{2})", full_text)
    basis_date = None
    if m_basis:
        y, mo, d = m_basis.group(1).split("-")
        basis_date = date(int(y), int(mo), int(d))

    birth, gender = _parse_rrn(rrn_masked) if rrn_masked else (None, None)
    age = _insurance_age(birth, basis_date) if birth and basis_date else None

    return Customer(
        name=name,
        rrn_masked=rrn_masked,
        birth_date=birth,
        gender=gender,
        age_insurance=age,
        handler=handler,
        basis_date=basis_date,
    )


def _looks_like_indemnity_header(row) -> bool:
    joined = "".join(_join_cell(c) for c in row)
    return "보장내용" in joined and "담보특성" in joined


def _looks_like_summary_header(row) -> bool:
    joined = "".join(_join_cell(c) for c in row)
    return ("보장명" in joined and "가입" in joined and "합계" in joined) or (
        "보장명" in joined and "가입" in joined and "건" in joined and "회사명" not in joined
    )


def _looks_like_detail_header(row) -> bool:
    joined = "".join(_join_cell(c) for c in row)
    return "회사명" in joined and "상품명" in joined and "담보명" in joined


def _parse_indemnity_table(all_tables) -> list[IndemnityItem]:
    items: list[IndemnityItem] = []
    for table in all_tables:
        if not table or not _looks_like_indemnity_header(table[0]):
            continue
        for row in table[1:]:
            cells = [_join_cell(c) for c in row]
            if not cells or not re.match(r"^\d+$", cells[0] or ""):
                continue
            seq, company, start, end, amount, cov_name = cells[0], cells[1], cells[2], cells[3], cells[4], cells[5]
            detail_type = cells[6] if len(cells) > 6 else ""
            items.append(
                IndemnityItem(
                    seq=int(seq),
                    company=company,
                    start=start,
                    end=end,
                    amount_won=_to_int(amount),
                    coverage_name=cov_name,
                    detail_type=detail_type,
                )
            )
    return items


def _parse_category_totals(all_tables) -> list[CategoryTotal]:
    totals: list[CategoryTotal] = []
    seen_seq = set()
    for table in all_tables:
        if not table or not _looks_like_summary_header(table[0]):
            continue
        for row in table:
            cells = [_join_cell(c) for c in row]
            if not cells or not re.match(r"^\d+$", cells[0] or ""):
                continue
            seq = int(cells[0])
            if seq in seen_seq:
                continue
            category = cells[1]
            count = _to_int(cells[2]) if len(cells) > 2 else 0
            amount_won = _to_int(cells[3]) if len(cells) > 3 else 0
            if not category:
                continue
            seen_seq.add(seq)
            totals.append(
                CategoryTotal(
                    seq=seq,
                    category=category,
                    count=count,
                    total_amount_man=round(amount_won / 10000),
                )
            )
    totals.sort(key=lambda t: t.seq)
    return totals


def _parse_detail_items(all_tables) -> list[DetailItem]:
    items: list[DetailItem] = []
    for table in all_tables:
        if not table or not any(_looks_like_detail_header(r) for r in table[:2]):
            continue
        for row in table:
            n = len(row)
            cells = [_join_cell(c) for c in row]
            if not cells or not cells[0]:
                continue
            if cells[0] in ("회사명",) or "계 약 정 보" in "".join(cells):
                continue
            # 납입기간이 2개 셀로 쪼개지는 경우(11컬럼) vs 1개 셀(10컬럼)
            if n >= 11:
                company, product, start, end, pay_a, pay_b, premium, rider, category, amount, status = cells[:11]
                pay_period = pay_a + pay_b
            elif n == 10:
                company, product, start, end, pay_period, premium, rider, category, amount, status = cells[:10]
            else:
                continue
            if status != "정상" and not re.match(r"^\d{4}-\d{2}-\d{2}$", start or ""):
                continue
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", start or ""):
                continue
            items.append(
                DetailItem(
                    company=company,
                    product=_tidy_product_name(product),
                    start=start,
                    end=end,
                    pay_years=_parse_pay_years(pay_period),
                    pay_method="월납" if "월납" in pay_period else pay_period,
                    premium_won=_to_int(premium),
                    rider_name=rider,
                    category=category,
                    amount_man=_to_int(amount),
                    status=status,
                )
            )
    return items
