"""
Excel 파일에서 보험 가입 정보를 읽고 분석 리포트 데이터로 변환.

지원 형식:
- 시트 "고객정보": 고객명, 성별, 생년월일, 분석기준일
- 시트 "보험상품": 보험사, 상품명, 계약일, 월보험료, 총보험료 등
"""
from __future__ import annotations

import re
from datetime import date, datetime
from dataclasses import dataclass, field

from .parser import Customer, DetailItem, ParsedReport


@dataclass
class ExcelParseResult:
    """Excel 파일 파싱 결과."""
    customer_name: str
    gender: str | None
    birth_date: date | None
    basis_date: date | None
    handler: str
    insurance_products: list[dict]  # 보험상품 정보

    def to_parsed_report(self) -> ParsedReport:
        """PDF 파서와 호환되는 ParsedReport 형식으로 변환."""
        # 보험나이 계산
        age = None
        if self.birth_date:
            today = datetime.now().date()
            age = today.year - self.birth_date.year
            if (today.month, today.day) < (self.birth_date.month, self.birth_date.day):
                age -= 1

        # Customer 정보 생성 (Customer는 parser.py에서 import)
        customer = Customer(
            name=self.customer_name,
            rrn_masked="***-****-**",
            birth_date=self.birth_date,
            gender=self.gender,
            age_insurance=age,
            handler=self.handler,
            basis_date=self.basis_date or datetime.now().date()
        )

        # DetailItem 목록 생성 (DetailItem은 parser.py에서 import)
        detail_items = []
        for idx, product in enumerate(self.insurance_products, 1):
            # 보장내용에서 category와 amount_man 추출
            coverages = product.get("coverages", [])

            # 첫 번째 보장을 category로 사용 (없으면 상품명 사용)
            category = ""
            if coverages:
                category = coverages[0].get("name", "")
            else:
                category = product.get("product_name", "")[:20]  # 첫 20글자

            # amount_man: 총보험료를 만원 단위로 (없으면 월보험료 * 12)
            total_premium = product.get("total_premium", 0)
            if total_premium > 0:
                amount_man = total_premium // 10000  # 원 → 만원
            else:
                monthly_premium = product.get("monthly_premium", 0)
                amount_man = (monthly_premium * 12) // 10000  # 연간 보험료 → 만원

            # start: YYYY-MM-DD 형식으로 변환
            contract_date_str = product.get("contract_date", "")
            if contract_date_str:
                # 이미 YYYY-MM-DD 형식이거나 date 객체인 경우
                if isinstance(contract_date_str, date):
                    start_str = contract_date_str.strftime("%Y-%m-%d")
                else:
                    start_str = contract_date_str
            else:
                start_str = ""

            # end: 제공되지 않으면 종신(9999-12-31)으로 설정
            end_str = product.get("contract_end", "") or "9999-12-31"
            if isinstance(end_str, date):
                end_str = end_str.strftime("%Y-%m-%d")

            detail_item = DetailItem(
                company=product.get("company", ""),
                product=product.get("product_name", ""),
                start=start_str,
                end=end_str,
                pay_years=None,
                pay_method="월납",
                premium_won=product.get("monthly_premium", 0),
                rider_name="",
                category=category,
                amount_man=int(amount_man) if amount_man > 0 else 0,
                status=""
            )
            detail_items.append(detail_item)

        return ParsedReport(
            customer=customer,
            detail_items=detail_items
        )


def parse_excel(file_path: str) -> ExcelParseResult:
    """Excel 파일을 파싱해서 보험 정보를 추출한다."""
    try:
        import openpyxl
    except ImportError:
        raise ReportParseError("openpyxl 패키지가 필요합니다")

    try:
        # 다양한 옵션 조합으로 파일 로드 시도 (손상된 파일이나 특수 포맷에 대응)
        try:
            wb = openpyxl.load_workbook(file_path, data_only=False)
        except Exception:
            # 첫 시도 실패 시 더 관대한 옵션으로 재시도
            wb = openpyxl.load_workbook(file_path, data_only=False, rich_text=False, keep_vba=False)
    except Exception as e:
        raise ReportParseError(f"Excel 파일을 읽을 수 없습니다: {e}")

    try:
        # 고객 정보 추출
        customer_name = "미입력"
        gender = None
        birth_date = None
        basis_date = None
        handler = "사용자"

        # 고객정보 시트가 있으면 그것에서 읽기
        if "고객정보" in wb.sheetnames:
            ws = wb["고객정보"]
            # 간단한 형식: A1=이름, B1=성별, C1=생년월일, D1=분석기준일, E1=담당자
            customer_name = _get_cell_value(ws, "A1") or "미입력"
            gender = _get_cell_value(ws, "B1")

            birth_str = _get_cell_value(ws, "C1")
            if birth_str:
                birth_date = _parse_date(birth_str)

            basis_str = _get_cell_value(ws, "D1")
            if basis_str:
                basis_date = _parse_date(basis_str)

            handler = _get_cell_value(ws, "E1") or "사용자"

        # 보험상품 정보 추출
        insurance_products = []
        if "보험상품" in wb.sheetnames:
            ws = wb["보험상품"]
            # 헤더: A=보험사, B=상품명, C=계약일, D=월보험료, E=총보험료, F=잔여보험료, ...
            try:
                for row_idx in range(2, min(ws.max_row + 1, 1000)):  # 최대 1000행
                    company = _get_cell_value(ws, f"A{row_idx}")
                    if not company:
                        break

                    product = {
                        "company": company,
                        "product_name": _get_cell_value(ws, f"B{row_idx}") or "",
                        "contract_date": _get_cell_value(ws, f"C{row_idx}") or "",
                        "contract_end": _get_cell_value(ws, f"H{row_idx}") or "",
                        "monthly_premium": _parse_number(_get_cell_value(ws, f"D{row_idx}")),
                        "total_premium": _parse_number(_get_cell_value(ws, f"E{row_idx}")),
                        "remaining_premium": _parse_number(_get_cell_value(ws, f"F{row_idx}")),
                        "coverages": _parse_coverages(_get_cell_value(ws, f"G{row_idx}"))
                    }
                    if product.get("product_name"):  # 상품명이 있을 때만 추가
                        insurance_products.append(product)
            except Exception as e:
                raise ReportParseError(f"보험상품 시트 읽기 오류: {e}")
        else:
            raise ReportParseError("'보험상품' 시트를 찾을 수 없습니다")

        if not insurance_products:
            raise ReportParseError("읽을 수 있는 보험상품이 없습니다")

        return ExcelParseResult(
            customer_name=customer_name,
            gender=gender,
            birth_date=birth_date,
            basis_date=basis_date,
            handler=handler,
            insurance_products=insurance_products
        )
    finally:
        wb.close()


def _get_cell_value(ws, cell_ref: str) -> str | None:
    """셀 값을 안전하게 가져온다."""
    try:
        cell = ws[cell_ref]
        value = cell.value
        if value is None:
            return None
        if isinstance(value, date):
            return value.strftime("%Y-%m-%d")
        return str(value).strip()
    except:
        return None


def _parse_date(date_str: str | None) -> date | None:
    """다양한 형식의 날짜 문자열을 파싱한다."""
    if not date_str:
        return None

    date_str = date_str.strip()

    # 이미 date 객체인 경우
    if isinstance(date_str, date):
        return date_str

    # 다양한 형식 시도
    formats = [
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%Y.%m.%d",
        "%Y년 %m월 %d일",
        "%m/%d/%Y",
        "%m-%d-%Y",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue

    return None


def _parse_number(value: str | int | float | None) -> int:
    """숫자 문자열을 정수로 파싱한다."""
    if value is None:
        return 0

    if isinstance(value, (int, float)):
        return int(value)

    value_str = str(value).strip()
    # 쉼표, 공백 제거
    value_str = re.sub(r'[,\s]', '', value_str)
    # 한글 단위 제거
    value_str = re.sub(r'[만원]', '', value_str)

    try:
        return int(float(value_str))
    except ValueError:
        return 0


def _parse_coverages(coverage_str: str | None) -> list[dict]:
    """보장내용 문자열을 파싱한다. 예: "상해보장 1000만원, 질병보장 500만원" """
    if not coverage_str:
        return []

    coverages = []
    # 간단한 파싱: 쉼표로 분리하고 각각을 "이름 금액" 형식으로 처리
    items = coverage_str.split(",")
    for item in items:
        item = item.strip()
        if not item:
            continue

        # 숫자 부분 추출
        match = re.search(r'(\d+)', item.replace(",", ""))
        if match:
            amount = int(match.group(1))
            name = re.sub(r'\d+[만원]*', '', item).strip()
            if name:
                coverages.append({"name": name, "amount": amount})

    return coverages


class ReportParseError(Exception):
    """Excel 파싱 오류."""
    pass
