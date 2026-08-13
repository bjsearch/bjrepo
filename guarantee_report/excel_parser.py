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

from .parser import Customer, DetailItem, ParsedReport, CategoryTotal, IndemnityItem


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
        indemnity_items = []
        category_map = {}
        indemnity_seq = 1

        for product in self.insurance_products:
            # 계약 정보 준비
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

            monthly_premium = product.get("monthly_premium", 0)
            total_premium_val = product.get("total_premium", 0)

            pay_years = None
            if monthly_premium > 0 and total_premium_val > 0:
                pay_years = total_premium_val // (monthly_premium * 12)
                if pay_years < 1:
                    pay_years = 1

            product_name = product.get("product_name", "")
            company = product.get("company", "")
            is_indemnity = "실손" in product_name

            # 각 보장별로 아이템 생성
            coverages = product.get("coverages", [])
            if coverages:
                for coverage in coverages:
                    cov_name = coverage.get("name", "")
                    cov_amount = coverage.get("amount", 0)

                    if cov_name:
                        # 실손의료비 상품인 경우 IndemnityItem 생성
                        if is_indemnity:
                            detail_type = ""
                            if "입원의료비" in cov_name:
                                detail_type = "입원의료비"
                            elif "외래의료비" in cov_name:
                                detail_type = "외래의료비"
                            elif "처방조제료" in cov_name:
                                detail_type = "처방조제료"

                            indemnity_item = IndemnityItem(
                                seq=indemnity_seq,
                                company=company,
                                start=start_str,
                                end=str(end_str),
                                amount_won=int(cov_amount * 10000) if cov_amount > 0 else 0,
                                coverage_name=cov_name,
                                detail_type=detail_type
                            )
                            indemnity_items.append(indemnity_item)
                            indemnity_seq += 1
                        else:
                            # 정액담보 상품인 경우 DetailItem 생성
                            detail_item = DetailItem(
                                company=company,
                                product=product_name,
                                start=start_str,
                                end=str(end_str),
                                pay_years=pay_years,
                                pay_method="월납",
                                premium_won=monthly_premium,
                                rider_name="",
                                category=cov_name,
                                amount_man=int(cov_amount) if cov_amount > 0 else 0,
                                status="",
                                renewal_type=product.get("renewal_type", "black")
                            )
                            detail_items.append(detail_item)

                        # 카테고리 맵에 추가 (정액, 실손 모두 포함)
                        if cov_name not in category_map:
                            category_map[cov_name] = {"count": 0, "total": 0}
                        category_map[cov_name]["count"] += 1
                        category_map[cov_name]["total"] += cov_amount
            else:
                # 보장이 없는 경우 상품명을 카테고리로 사용
                if not is_indemnity:
                    detail_item = DetailItem(
                        company=company,
                        product=product_name,
                        start=start_str,
                        end=str(end_str),
                        pay_years=pay_years,
                        pay_method="월납",
                        premium_won=monthly_premium,
                        rider_name="",
                        category=product_name[:20],
                        amount_man=0,
                        status="",
                        renewal_type=product.get("renewal_type", "black")
                    )
                    detail_items.append(detail_item)

        category_totals = []
        seq = 1
        for category_name in sorted(category_map.keys()):
            data = category_map[category_name]
            category_totals.append(
                CategoryTotal(
                    seq=seq,
                    category=category_name,
                    count=data["count"],
                    total_amount_man=int(data["total"]) if data["total"] > 0 else 0
                )
            )
            seq += 1

        return ParsedReport(
            customer=customer,
            indemnity_items=indemnity_items,
            detail_items=detail_items,
            category_totals=category_totals
        )


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


def _get_font_colors(zf) -> dict:
    """styles.xml에서 폰트 색상 정보 추출 (style_id -> 'red'|'yellow'|'black')"""
    import xml.etree.ElementTree as ET
    try:
        styles_xml = zf.read('xl/styles.xml')
        styles_root = ET.fromstring(styles_xml)

        # namespace 처리
        ns = {'ss': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

        # 폰트 색상 맵
        color_map = {}

        def _classify_rgb_color(rgb_hex: str) -> str:
            """RGB hex값에서 색상 분류 (red/yellow/black)"""
            if not rgb_hex or len(rgb_hex) < 6:
                return None

            rgb_hex = rgb_hex.upper()
            # FF는 alpha channel
            if len(rgb_hex) == 8:
                r_hex, g_hex, b_hex = rgb_hex[2:4], rgb_hex[4:6], rgb_hex[6:8]
            else:
                r_hex, g_hex, b_hex = rgb_hex[0:2], rgb_hex[2:4], rgb_hex[4:6]

            try:
                r = int(r_hex, 16)
                g = int(g_hex, 16)
                b = int(b_hex, 16)

                # Black/Dark color (all values low)
                if r < 50 and g < 50 and b < 50:
                    return 'black'
                # Red (R is highest, significant red component)
                elif r > 150 and r > g and r > b and g < 150 and b < 150:
                    return 'red'
                # Yellow (R and G are high, B is low)
                elif r > 150 and g > 150 and b < 150:
                    return 'yellow'
                # Default to black
                return 'black'
            except:
                return None

        # fonts 섹션에서 색상 찾기
        font_colors = {}
        fonts = styles_root.find('.//ss:fonts', ns)
        if fonts is not None:
            for i, font in enumerate(fonts.findall('ss:font', ns)):
                color_elem = font.find('ss:color', ns)
                if color_elem is not None:
                    rgb = color_elem.get('rgb', '')
                    if rgb:
                        color = _classify_rgb_color(rgb)
                        if color:
                            font_colors[i] = color

        # cellXfs 섹션에서 각 style에 font 매핑
        cell_xfs = styles_root.find('.//ss:cellXfs', ns)
        if cell_xfs is not None:
            for i, xf in enumerate(cell_xfs.findall('ss:xf', ns)):
                font_id = int(xf.get('fontId', '0'))
                if font_id in font_colors:
                    color_map[i] = font_colors[font_id]

        return color_map
    except Exception:
        return {}


def _parse_excel_manual(file_path: str, sheet_names: list = None) -> ExcelParseResult:
    """ZIP 기반 Excel 파싱 (색상 정보 포함)"""
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

        # 폰트 색상 정보 로드
        font_colors = _get_font_colors(zf)

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

                # 셀 데이터 및 폰트 색상 추출
                cells = {}
                cell_colors = {}
                for c in sheet_root.iter():
                    if c.tag.endswith('}c'):
                        r = c.get('r', '')  # 셀 참조 (A1, B2 등)
                        cell_type = c.get('t', '')  # 셀 타입 (s=shared string, n=numeric, 등)
                        style_id = int(c.get('s', '0'))  # 스타일 ID
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
                            if style_id in font_colors:
                                cell_colors[r] = font_colors[style_id]

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
                    # 갱신유무 컬럼 찾기 (헤더 행 스캔) - 전체 범위 검색
                    renewal_column = None
                    for col in ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q']:
                        header = cells.get(f'{col}1', '').lower().strip()
                        if '갱신유무' in header or (header == '갱신' and cells.get(f'{col}1', '') != ''):
                            renewal_column = col
                            break

                    row = 2
                    while row <= 1000:  # 최대 1000행
                        company = cells.get(f'A{row}')
                        if not company:
                            break

                        product_name = cells.get(f'B{row}')
                        if product_name:
                            # 갱신유무 컬럼이 있으면 그 값으로 갱신형 타입 결정
                            # 없으면 제품명 셀의 폰트 색상으로 결정
                            renewal_type = 'black'  # default

                            if renewal_column:
                                renewal_value = cells.get(f'{renewal_column}{row}', '')
                                if renewal_value:
                                    renewal_value_lower = str(renewal_value).strip().lower()
                                    # 비갱신형 판별 (먼저 체크해야 '갱신' 포함 확인 전에)
                                    if any(x in renewal_value_lower for x in ['비갱신', 'non', 'fixed']) or renewal_value_lower in ['0', 'no', 'false', 'n']:
                                        renewal_type = 'black'
                                    # 혼합형 판별
                                    elif any(x in renewal_value_lower for x in ['혼합', 'mixed']) or renewal_value_lower == '2':
                                        renewal_type = 'yellow'
                                    # 갱신형 판별
                                    elif any(x in renewal_value_lower for x in ['갱신형', '갱신', 'renewal']) or renewal_value_lower in ['1', 'yes', 'true', 'y']:
                                        renewal_type = 'red'
                                else:
                                    # 값이 없으면 기본값 사용 (폰트 색상)
                                    renewal_type = cell_colors.get(f'B{row}', 'black')
                            else:
                                # 갱신유무 컬럼이 없으면 폰트 색상 사용
                                renewal_type = cell_colors.get(f'B{row}', 'black')

                            product = {
                                "company": company,
                                "product_name": product_name,
                                "contract_date": cells.get(f'C{row}', ''),
                                "monthly_premium": _parse_number(cells.get(f'D{row}')),
                                "total_premium": _parse_number(cells.get(f'E{row}')),
                                "remaining_premium": _parse_number(cells.get(f'F{row}')),
                                "coverages": _parse_coverages(cells.get(f'G{row}')),
                                "contract_end": cells.get(f'H{row}', ''),
                                "renewal_type": renewal_type
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
    if not coverage_str or not isinstance(coverage_str, str):
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

        # 폰트 색상 추출
        font_colors = _get_font_colors(zf)

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
                    cell_colors = {}
                    for c in sheet_root.iter():
                        if c.tag.endswith('}c'):
                            r = c.get('r', '')
                            cell_type = c.get('t', '')
                            style_id = int(c.get('s', '0'))
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
                                if style_id in font_colors:
                                    cell_colors[r] = font_colors[style_id]

                    # 보고서 형식에서 고객명 추출 (B2에서 "xxx님의 보장분석..." 형식)
                    if 'B2' in cells:
                        title = cells['B2']
                        if title and isinstance(title, str) and '님' in title:
                            customer_name = title.split('님')[0].strip()

                    # 각 열(E, F, G 등)을 하나의 상품으로 처리
                    # 행 6에서 상품명이 있는 열 찾기 (E열부터 시작, 제한 없음)
                    product_cols = set()
                    # 알파벳 순서로 열을 생성 (E부터 ZZ까지)
                    def col_num_to_letter(n):
                        """열 번호(0: A, 1: B...)를 알파벳으로 변환"""
                        result = ''
                        while n >= 0:
                            result = chr(ord('A') + (n % 26)) + result
                            n = n // 26 - 1
                        return result

                    for cell_ref in cells:
                        match = re.match(r'([A-Z]+)(\d+)', cell_ref)
                        if match:
                            col = match.group(1)
                            row = int(match.group(2))
                            # 행 6(보험명) 또는 행 7(보험사명)에 데이터가 있으면 해당 열이 상품 열
                            # E열(4) 이상의 모든 열 지원
                            if row in [6, 7] and col >= 'E':
                                product_cols.add(col)

                    # 카테고리 매핑: Excel 파일의 소분류명 -> 규칙 시스템의 표준 카테고리명
                    category_mapping = {
                        '질병입원의료비': '질병입원의료비',
                        '질병외래의료비': '질병외래의료비',
                        '질병처방조제료': '질병처방조제료',
                        '상해입원의료비': '상해입원의료비',
                        '상해외래의료비': '상해외래의료비',
                        '상해처방조제료': '상해처방조제료',
                        '일반암진단': '암진단',
                        '3대진단': '3대진단',
                        '소액암(유사암)진단': '소액암진단',
                        '고액암진단': '고액암진단',
                        '뇌혈관질환진단': '뇌혈관질환진단',
                        '뇌졸중질환진단': '뇌졸중진단',
                        '뇌출혈질환진단': '뇌출혈진단',
                        '심장질환진단': '심장질환진단',
                        '허혈성심장질환진단': '허혈성심장질환진단',
                        '급성심근경색진단': '급성심근경색진단',
                        '질병수술': '질병수술',
                        '상해수술': '상해수술',
                        '질병종수술': '질병종수술',
                        '상해종수술': '상해종수술',
                        '수술비': '질병수술',
                        '암수술': '암수술',
                        '뇌혈관질환수술': '뇌혈관질환수술',
                        '허혈성심장질환수술': '허혈성심장질환수술',
                        '질병입원': '질병입원일당',
                        '상해입원': '상해입원일당',
                        '입원일당': '질병입원일당',
                        '질병사망': '질병사망',
                        '상해사망': '상해사망',
                        '유병자상해사망': '상해사망',
                        '교통상해사망': '상해사망',
                        '질병80%이상후유장해': '질병후유장해',
                        '질병80%미만후유장해': '질병후유장해',
                        '상해80%이상후유장해': '상해후유장해',
                        '상해80%미만후유장해': '상해후유장해',
                        '재해장해': '상해후유장해',
                        '재해80%이상장해': '상해후유장해',
                        '재해80%미만장해': '상해후유장해',
                        '골절진단': '골절진단',
                        '중대골절진단': '골절진단',
                        '화상진단': '화상진단',
                        '중대화상진단': '중대화상진단',
                        '표적항암방사선치료': '표적항암방사선',
                        '표적항암방사선치료비': '표적항암방사선',
                        '표적항암약물치료': '표적항암약물',
                        '표적항암약물치료비': '표적항암약물',
                        '항암방사선약물치료비': '항암방사선약물치료비',
                        '특정질병입원일당': '특정질병입원일당',
                        '간병인지원질병입원일당': '간병인지원질병입원일당',
                        '간병인지원상해입원일당': '간병인지원상해입원일당',
                        '질병간호간병통합서비스사용일당': '질병간호간병통합서비스사용일당',
                        '상해간호간병통합서비스사용일당': '상해간호간병통합서비스사용일당',
                        '일상생활배상책임': '일상생활배상책임',
                        '가족생활배상책임': '일상생활배상책임',
                        '교통사고처리지원금': '교통사고처리지원금',
                        '벌금(대물)': '벌금(대물)',
                        '벌금(대인)': '벌금(대인)',
                        '자동차부상치료비': '자동차부상치료비',
                    }

                    # 카테고리 금액 추출 (행 25부터 끝까지)
                    # 구조: 행 25 = 헤더, 행 26~ = 데이터 (B=대분류, C=소분류, E~= 각 상품별 금액)
                    category_amounts_by_col = {}
                    for row_num in range(26, 200):  # 행 26부터 200까지 스캔 (행 54+ 추가 데이터 포함)
                        # 카테고리명은 C열에 있음 (B열은 대분류)
                        category_label_cell = cells.get(f'C{row_num}')
                        if not category_label_cell:
                            # C열이 없으면 B열을 시도
                            category_label_cell = cells.get(f'B{row_num}')
                        if not category_label_cell:
                            continue

                        # 카테고리명 정규화 (공백 제거)
                        category_label_cell = str(category_label_cell).strip()

                        mapped_category = category_mapping.get(category_label_cell)
                        if not mapped_category:
                            continue

                        # 각 상품 열에서 해당 카테고리의 금액 추출 (D열부터는 해당 상품의 열)
                        # 상품은 E, F, G... 열에 있으므로 D (Dㆍ즉 인덱스 3)부터 시작
                        for col in product_cols:
                            # D, E, F, G... 중 product_cols에 해당하는 열 찾기
                            amount_str = cells.get(f'{col}{row_num}')
                            if amount_str:
                                amount = _parse_number(amount_str)
                                if amount > 0:
                                    if col not in category_amounts_by_col:
                                        category_amounts_by_col[col] = {}
                                    if mapped_category not in category_amounts_by_col[col]:
                                        category_amounts_by_col[col][mapped_category] = 0
                                    category_amounts_by_col[col][mapped_category] += amount

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

                            # 납입여부 확인: 납입완료/납입종료면 월 납입 보험료 제외
                            payment_status = cells.get(f'{col}13', '').strip()
                            if payment_status and any(x in payment_status for x in ['납입완료', '납입종료']):
                                monthly_premium = 0

                            # 갱신유무 추출 (row 9-13 중에서 값 찾기)
                            renewal_type = 'black'
                            for row_candidate in [9, 10, 11, 12, 13]:
                                renewal_value = cells.get(f'{col}{row_candidate}', '')
                                if renewal_value:
                                    renewal_value_str = str(renewal_value).strip()
                                    renewal_value_lower = renewal_value_str.lower()
                                    # 비갱신형 판별 (먼저 체크해야 '갱신' 포함 확인 전에)
                                    if any(x in renewal_value_lower for x in ['비갱신', 'non', 'fixed']) or renewal_value_lower in ['0', 'no', 'false', 'n']:
                                        renewal_type = 'black'
                                        break
                                    # 갱신형 특약 판별 (특약이 명시된 경우)
                                    elif '특약' in renewal_value_str or any(x in renewal_value_lower for x in ['혼합', 'mixed', 'rider']) or renewal_value_lower == '2':
                                        renewal_type = 'yellow'
                                        break
                                    # 갱신형 보험 판별 (특약이 아닌 갱신형)
                                    elif any(x in renewal_value_lower for x in ['갱신형', '갱신', 'renewal']) or renewal_value_lower in ['1', 'yes', 'true', 'y']:
                                        renewal_type = 'red'
                                        break

                            # 값이 없으면 폰트 색상으로 판별
                            if renewal_type == 'black':
                                for row_candidate in [9, 10, 11, 12, 13]:
                                    cell_ref = f'{col}{row_candidate}'
                                    if cell_ref in cell_colors:
                                        renewal_type = cell_colors[cell_ref]
                                        break
                                # 여전히 찾지 못했으면 상품명 셀의 색상 사용
                                if renewal_type == 'black':
                                    renewal_type = cell_colors.get(f'{col}6', 'black')

                            # 이 상품의 카테고리 정보 추출
                            coverages = []
                            if col in category_amounts_by_col:
                                for cat_name, amount in category_amounts_by_col[col].items():
                                    if amount > 0:
                                        coverages.append({"name": cat_name, "amount": amount})

                            product = {
                                "company": company or "보험사 미입력",
                                "product_name": product_name or "상품명 미입력",
                                "contract_date": contract_date,
                                "monthly_premium": monthly_premium,
                                "total_premium": total_premium,
                                "remaining_premium": remaining_premium,
                                "coverages": coverages,
                                "contract_end": contract_end or "9999-12-31",
                                "renewal_type": renewal_type
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
