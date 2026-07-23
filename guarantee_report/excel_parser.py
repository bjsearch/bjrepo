"""
Excel 파일에서 보험 가입 정보를 읽고 분석 리포트 데이터로 변환.

지원 형식:
1. 구조화된 형식:
   - 시트 "고객정보": A1=고객명, B1=성별, C1=생년월일, D1=분석기준일, E1=담당자
   - 시트 "보험상품": 헤더행 + 데이터 (보험사, 상품명, 계약일, 월보험료, 총보험료 등)

2. 기타 형식:
   - 첫 번째 시트에서 자동 감지하여 파싱

pandas를 사용하여 손상된 포맷의 Excel도 읽을 수 있습니다.
"""
from __future__ import annotations

import re
import math
from datetime import date, datetime
from dataclasses import dataclass

from .parser import Customer, DetailItem, ParsedReport


@dataclass
class ExcelParseResult:
    """Excel 파일 파싱 결과."""
    customer_name: str
    gender: str | None
    birth_date: date | None
    basis_date: date | None
    handler: str
    insurance_products: list[dict]

    def to_parsed_report(self) -> ParsedReport:
        """PDF 파서와 호환되는 ParsedReport 형식으로 변환."""
        age = None
        if self.birth_date:
            today = datetime.now().date()
            age = today.year - self.birth_date.year
            if (today.month, today.day) < (self.birth_date.month, self.birth_date.day):
                age -= 1

        customer = Customer(
            name=self.customer_name,
            rrn_masked="***-****-**",
            birth_date=self.birth_date,
            gender=self.gender,
            age_insurance=age,
            handler=self.handler,
            basis_date=self.basis_date or datetime.now().date()
        )

        detail_items = []
        for product in self.insurance_products:
            coverages = product.get("coverages", [])
            category = ""
            if coverages:
                category = coverages[0].get("name", "")
            else:
                category = product.get("product_name", "")[:20]

            total_premium = product.get("total_premium", 0)
            if total_premium > 0:
                amount_man = total_premium // 10000
            else:
                monthly_premium = product.get("monthly_premium", 0)
                amount_man = (monthly_premium * 12) // 10000

            contract_date_str = product.get("contract_date", "")
            if contract_date_str:
                if isinstance(contract_date_str, date):
                    start_str = contract_date_str.strftime("%Y-%m-%d")
                else:
                    start_str = str(contract_date_str)
            else:
                start_str = ""

            end_str = product.get("contract_end", "") or "9999-12-31"
            if isinstance(end_str, date):
                end_str = end_str.strftime("%Y-%m-%d")

            detail_item = DetailItem(
                company=product.get("company", ""),
                product=product.get("product_name", ""),
                start=start_str,
                end=str(end_str),
                pay_years=None,
                pay_method="월납",
                premium_won=product.get("monthly_premium", 0),
                rider_name="",
                category=category,
                amount_man=int(amount_man) if amount_man > 0 else 0,
                status=""
            )
            detail_items.append(detail_item)

        return ParsedReport(customer=customer, detail_items=detail_items)


def parse_excel(file_path: str) -> ExcelParseResult:
    """Excel 파일을 파싱해서 보험 정보를 추출한다."""
    # 모든 Excel 파일을 ZIP 기반 파싱으로 처리 (색상 오류 완전 우회)
    try:
        result = _parse_excel_manual(file_path, None)
        # 파싱 결과 검증: 고객명이 "미입력"이고 상품이 없으면 다른 형식 시도
        if result.customer_name == "미입력" and not result.insurance_products:
            result = _parse_excel_alternative(file_path)
        return result
    except Exception as e:
        raise ReportParseError(f"Excel 파일을 읽을 수 없습니다: {str(e)[:100]}")


def _extract_products_from_df(df) -> list[dict]:
    """DataFrame에서 보험상품 정보를 추출한다."""
    products = []

    # 첫 행이 헤더로 보이는 경우 (빈 첫 행 제외)
    start_idx = 0
    for idx in range(len(df)):
        first_col = _safe_value(df.iloc[idx, 0])
        if first_col:
            start_idx = idx
            break

    # 시작 행부터 읽기
    for idx in range(start_idx + 1, len(df)):
        try:
            company = _safe_value(df.iloc[idx, 0])
            if not company:
                break

            product_name = _safe_value(df.iloc[idx, 1]) if len(df.columns) > 1 else None
            if not product_name:
                continue

            product = {
                "company": company,
                "product_name": product_name,
                "contract_date": _safe_value(df.iloc[idx, 2]) if len(df.columns) > 2 else "",
                "monthly_premium": _parse_number(_safe_value(df.iloc[idx, 3])) if len(df.columns) > 3 else 0,
                "total_premium": _parse_number(_safe_value(df.iloc[idx, 4])) if len(df.columns) > 4 else 0,
                "remaining_premium": _parse_number(_safe_value(df.iloc[idx, 5])) if len(df.columns) > 5 else 0,
                "coverages": _parse_coverages(_safe_value(df.iloc[idx, 6])) if len(df.columns) > 6 else [],
                "contract_end": _safe_value(df.iloc[idx, 7]) if len(df.columns) > 7 else ""
            }
            products.append(product)
        except Exception:
            continue

    return products


def _safe_value(val) -> str | None:
    """pandas DataFrame 셀 값을 안전하게 추출한다."""
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    if isinstance(val, date):
        return val.strftime("%Y-%m-%d")
    val_str = str(val).strip()
    return val_str if val_str else None


def _parse_excel_manual(file_path: str, sheet_names: list = None) -> ExcelParseResult:
    """ZIP 기반 Excel 파싱 (스타일 무시, 모든 색상 오류 우회)"""
    import zipfile
    import xml.etree.ElementTree as ET

    # Excel을 ZIP으로 열기 (xlsx는 ZIP 형식)
    with zipfile.ZipFile(file_path, 'r') as zf:
        # 공유 문자열(SharedStrings) 로드
        shared_strings = []
        try:
            ss_xml = zf.read('xl/sharedStrings.xml')
            ss_root = ET.fromstring(ss_xml)
            for si in ss_root.iter():
                if si.tag.endswith('}si'):
                    for t in si.iter():
                        if t.tag.endswith('}t'):
                            shared_strings.append(t.text or '')
                            break
        except KeyError:
            pass  # SharedStrings.xml이 없어도 괜찮음 (인라인 문자열만 사용)

        # 워크북 정보 읽기
        try:
            workbook_xml = zf.read('xl/workbook.xml')
        except KeyError:
            raise ReportParseError("유효한 Excel 파일이 아닙니다")

        root = ET.fromstring(workbook_xml)

        # 시트 목록 추출
        sheets = {}
        for sheet_elem in root.iter():
            if sheet_elem.tag.endswith('sheet'):
                name = sheet_elem.get('name', '')
                # r:id 속성에서 관계 ID 추출
                rid = sheet_elem.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id', '')
                if name and rid:
                    sheets[name] = rid

        # 관계 정보 (rel ID -> 파일명 매핑)
        rels_xml = zf.read('xl/_rels/workbook.xml.rels')
        rels_root = ET.fromstring(rels_xml)
        sheet_files = {}
        for rel in rels_root.iter():
            if rel.tag.endswith('Relationship'):
                rel_id = rel.get('Id', '')
                target = rel.get('Target', '')
                if rel_id and target.endswith('.xml'):
                    sheet_files[rel_id] = target

        # 고객 정보와 보험상품 추출
        customer_name = "미입력"
        gender = None
        birth_date = None
        basis_date = None
        handler = "사용자"
        insurance_products = []

        # 각 시트 읽기
        for sheet_name in sheets:
            rid = sheets[sheet_name]
            if rid not in sheet_files:
                continue

            target = sheet_files[rid]
            # 경로가 '/'로 시작하면 그대로, 아니면 'xl/' 앞에 붙이기
            sheet_path = target if target.startswith('/') else 'xl/' + target
            # '/'로 시작하는 경우 제거
            sheet_path = sheet_path.lstrip('/')
            try:
                sheet_xml = zf.read(sheet_path)
                sheet_root = ET.fromstring(sheet_xml)

                # 셀 데이터 추출
                cells = {}
                for c in sheet_root.iter():
                    if c.tag.endswith('}c'):
                        r = c.get('r', '')  # 셀 참조 (A1, B2 등)
                        cell_type = c.get('t', '')  # 셀 타입 (s=shared string, n=numeric, 등)
                        value = None

                        for child in c:
                            if child.tag.endswith('}v'):
                                value = child.text
                                break
                            elif child.tag.endswith('}is'):
                                # InlineString 타입 셀
                                for sub in child:
                                    if sub.tag.endswith('}t'):
                                        value = sub.text
                                        break
                                if value:
                                    break

                        # 공유 문자열 타입인 경우 인덱스를 실제 문자열로 변환
                        if cell_type == 's' and value and value.isdigit():
                            idx = int(value)
                            if idx < len(shared_strings):
                                value = shared_strings[idx]

                        if r and value:
                            cells[r] = value

                # 고객정보 시트인 경우
                if sheet_name == "고객정보":
                    customer_name = cells.get('A1', "미입력")
                    gender = cells.get('B1')
                    birth_str = cells.get('C1')
                    basis_str = cells.get('D1')
                    handler_val = cells.get('E1')

                    if birth_str:
                        birth_date = _parse_date(birth_str)
                    if basis_str:
                        basis_date = _parse_date(basis_str)
                    if handler_val:
                        handler = handler_val

                # 보험상품 시트인 경우
                elif sheet_name == "보험상품":
                    row = 2
                    while row <= 1000:  # 최대 1000행
                        company = cells.get(f'A{row}')
                        if not company:
                            break

                        product_name = cells.get(f'B{row}')
                        if product_name:
                            product = {
                                "company": company,
                                "product_name": product_name,
                                "contract_date": cells.get(f'C{row}', ''),
                                "monthly_premium": _parse_number(cells.get(f'D{row}')),
                                "total_premium": _parse_number(cells.get(f'E{row}')),
                                "remaining_premium": _parse_number(cells.get(f'F{row}')),
                                "coverages": _parse_coverages(cells.get(f'G{row}')),
                                "contract_end": cells.get(f'H{row}', '')
                            }
                            insurance_products.append(product)
                        row += 1
            except Exception as e:
                continue

    return ExcelParseResult(
        customer_name=customer_name,
        gender=gender,
        birth_date=birth_date,
        basis_date=basis_date,
        handler=handler,
        insurance_products=insurance_products
    )


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


def _parse_excel_alternative(file_path: str) -> ExcelParseResult:
    """보고서 형식 Excel 파싱 (행에 항목명, 열에 각 상품 데이터)"""
    import zipfile
    import xml.etree.ElementTree as ET

    with zipfile.ZipFile(file_path, 'r') as zf:
        # 공유 문자열 로드
        shared_strings = []
        try:
            ss_xml = zf.read('xl/sharedStrings.xml')
            ss_root = ET.fromstring(ss_xml)
            for si in ss_root.iter():
                if si.tag.endswith('}si'):
                    for t in si.iter():
                        if t.tag.endswith('}t'):
                            shared_strings.append(t.text or '')
                            break
        except KeyError:
            pass

        # 첫 번째 시트 찾기
        try:
            workbook_xml = zf.read('xl/workbook.xml')
            root = ET.fromstring(workbook_xml)
            sheets = {}
            for sheet_elem in root.iter():
                if sheet_elem.tag.endswith('sheet'):
                    name = sheet_elem.get('name', '')
                    rid = sheet_elem.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id', '')
                    if name and rid:
                        sheets[name] = rid

            rels_xml = zf.read('xl/_rels/workbook.xml.rels')
            rels_root = ET.fromstring(rels_xml)
            sheet_files = {}
            for rel in rels_root.iter():
                if rel.tag.endswith('Relationship'):
                    rel_id = rel.get('Id', '')
                    target = rel.get('Target', '')
                    if rel_id and target.endswith('.xml'):
                        sheet_files[rel_id] = target
        except:
            raise ReportParseError("Excel 파일 구조를 읽을 수 없습니다")

        customer_name = "미입력"
        gender = None
        birth_date = None
        basis_date = None
        handler = "사용자"
        insurance_products = []

        # 첫 번째 시트 파싱
        first_sheet = list(sheets.items())[0] if sheets else None
        if first_sheet:
            sheet_name, rid = first_sheet
            if rid in sheet_files:
                target = sheet_files[rid]
                sheet_path = target if target.startswith('/') else 'xl/' + target
                sheet_path = sheet_path.lstrip('/')

                try:
                    sheet_xml = zf.read(sheet_path)
                    sheet_root = ET.fromstring(sheet_xml)

                    # 셀 데이터 추출
                    cells = {}
                    for c in sheet_root.iter():
                        if c.tag.endswith('}c'):
                            r = c.get('r', '')
                            cell_type = c.get('t', '')
                            value = None

                            for child in c:
                                if child.tag.endswith('}v'):
                                    value = child.text
                                    break
                                elif child.tag.endswith('}is'):
                                    for sub in child:
                                        if sub.tag.endswith('}t'):
                                            value = sub.text
                                            break
                                    if value:
                                        break

                            if cell_type == 's' and value and value.isdigit():
                                idx = int(value)
                                if idx < len(shared_strings):
                                    value = shared_strings[idx]

                            if r and value:
                                cells[r] = value

                    # 보고서 형식에서 고객명 추출 (B2에서 "xxx님의 보장분석..." 형식)
                    if 'B2' in cells:
                        title = cells['B2']
                        if '님' in title:
                            customer_name = title.split('님')[0].strip()

                    # 각 열(E, F, G 등)을 하나의 상품으로 처리
                    # 행 6에서 상품명이 있는 열 찾기
                    product_cols = set()
                    for cell_ref in cells:
                        match = re.match(r'([A-Z]+)(\d+)', cell_ref)
                        if match:
                            col = match.group(1)
                            row = int(match.group(2))
                            # 행 6(보험명) 또는 행 7(보험사명)에 데이터가 있으면 해당 열이 상품 열
                            if row in [6, 7] and col in ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M']:
                                product_cols.add(col)

                    # 각 상품별로 데이터 추출
                    for col in sorted(product_cols):
                        company = cells.get(f'{col}7', '')
                        product_name = cells.get(f'{col}6', '')

                        if company or product_name:
                            contract_date = cells.get(f'{col}8', '')
                            monthly_premium_str = cells.get(f'{col}17', '')
                            monthly_premium = _parse_number(monthly_premium_str)
                            total_premium_str = cells.get(f'{col}20', '')
                            total_premium = _parse_number(total_premium_str)
                            remaining_premium_str = cells.get(f'{col}19', '')
                            remaining_premium = _parse_number(remaining_premium_str)
                            contract_end = cells.get(f'{col}15', '')

                            product = {
                                "company": company or "보험사 미입력",
                                "product_name": product_name or "상품명 미입력",
                                "contract_date": contract_date,
                                "monthly_premium": monthly_premium,
                                "total_premium": total_premium,
                                "remaining_premium": remaining_premium,
                                "coverages": [],
                                "contract_end": contract_end or "9999-12-31"
                            }
                            insurance_products.append(product)

                except Exception:
                    pass

    return ExcelParseResult(
        customer_name=customer_name,
        gender=gender,
        birth_date=birth_date,
        basis_date=basis_date,
        handler=handler,
        insurance_products=insurance_products if insurance_products else [{
            "company": "미입력",
            "product_name": "데이터 없음",
            "contract_date": "",
            "monthly_premium": 0,
            "total_premium": 0,
            "coverages": [{"name": "데이터 추출 실패", "amount": 0}],
            "contract_end": "9999-12-31"
        }]
    )


class ReportParseError(Exception):
    """Excel 파싱 오류."""
    pass
