"""
보장분석 보험 Excel 파일 데이터 추출 모듈
Insurance Analysis Excel Data Extractor Module

일관된 구조의 보장분석 Excel 파일에서 고객정보, 보험상품, 보장정보를 추출합니다.
"""

import zipfile
import xml.etree.ElementTree as ET
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, asdict
from datetime import datetime


@dataclass
class CustomerInfo:
    """고객 정보"""
    name: str
    phone: Optional[str] = None
    birth: Optional[str] = None
    created_date: Optional[str] = None
    creator: Optional[str] = None


@dataclass
class InsuranceProduct:
    """보험 상품 정보"""
    product_name: str
    insurance_company: str
    contract_date: str
    contract_status: str
    renewal_type: str  # 갱신형/비갱신형
    policyholder: str
    policy_number: str
    payment_status: str
    payment_cycle: str
    maturity_date: str
    premium_end_date: str
    monthly_premium: str
    paid_premium: str
    remaining_premium: str
    total_premium: str


@dataclass
class CoverageItem:
    """보장 항목 정보"""
    major_category: str      # 대분류 (실비, 3대진단 등)
    minor_category: str      # 소분류 (일반암진단, 상해입원 등)
    total_coverage: str      # 보장총액
    products: Dict[str, str] # {상품명: 보장액}


class InsuranceExcelAnalyzer:
    """보장분석 Excel 파일 분석기"""

    def __init__(self, file_path: str):
        """
        Args:
            file_path: Excel 파일 경로
        """
        self.file_path = file_path
        self.strings = []
        self._load_strings()

    def _load_strings(self):
        """Shared Strings 로드 (Excel의 텍스트 저장소)"""
        try:
            with zipfile.ZipFile(self.file_path, 'r') as z:
                ss_xml = z.read('xl/sharedStrings.xml').decode('utf-8')
                ss_root = ET.fromstring(ss_xml)
                for t in ss_root.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t'):
                    self.strings.append(t.text or '')
        except Exception as e:
            print(f"⚠️ Strings 로드 실패: {e}")

    def _get_cell_value(self, cell_elem) -> str:
        """셀 값 추출"""
        ns = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        cell_type = cell_elem.get('t', 'n')
        v = cell_elem.find('main:v', ns)

        if v is None or v.text is None:
            return ""

        if cell_type == 's':  # String type
            try:
                idx = int(v.text)
                return self.strings[idx] if idx < len(self.strings) else ""
            except:
                return ""
        return v.text

    def _get_sheet_data(self) -> Tuple[Dict[str, Dict[str, str]], List[Dict]]:
        """Sheet1에서 모든 데이터 추출"""
        ns = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        rows_data = {}

        try:
            with zipfile.ZipFile(self.file_path, 'r') as z:
                sheet_xml = z.read('xl/worksheets/sheet1.xml').decode('utf-8')
                sheet_root = ET.fromstring(sheet_xml)

                for row in sheet_root.findall('.//main:row', ns):
                    row_num = int(row.get('r'))
                    row_cells = {}

                    for cell in row.findall('main:c', ns):
                        cell_ref = cell.get('r')  # A1, B2 형식
                        col = self._extract_column(cell_ref)
                        value = self._get_cell_value(cell)

                        if value:
                            row_cells[col] = value

                    if row_cells:
                        rows_data[row_num] = row_cells
        except Exception as e:
            print(f"⚠️ Sheet 데이터 로드 실패: {e}")

        return rows_data

    def _extract_column(self, cell_ref: str) -> str:
        """셀 참조(A1)에서 열 문자 추출(A)"""
        import re
        match = re.match(r'([A-Z]+)', cell_ref)
        return match.group(1) if match else ""

    def extract_customer_info(self) -> CustomerInfo:
        """고객 정보 추출"""
        rows = self._get_sheet_data()

        # Row 2: 고객명 (B2)
        name = rows.get(2, {}).get('B', '').replace('님의 보장분석 리포트', '').strip()

        # Row 3: 작성자 (K3 또는 N3)
        creator = rows.get(3, {}).get('K') or rows.get(3, {}).get('N', '')
        creator = creator.replace('작성자 : ', '').strip()

        # Row 4: 작성일 (K4 또는 N4)
        created_date = rows.get(4, {}).get('K') or rows.get(4, {}).get('N', '')
        created_date = created_date.replace('작성일 : ', '').strip()

        return CustomerInfo(
            name=name,
            created_date=created_date,
            creator=creator
        )

    def extract_insurance_products(self) -> List[InsuranceProduct]:
        """보험 상품 정보 추출"""
        rows = self._get_sheet_data()
        products = []

        # 상품 정보는 Row 6부터 시작 (Row 5는 헤더)
        # 상품별 열은 E, F, G, H, I, J, K, L, M, N 등

        product_columns = self._find_product_columns(rows)

        if not product_columns:
            return products

        # 각 상품 열에 대해 데이터 추출
        for col in product_columns:
            product_data = self._extract_product_from_column(rows, col)
            # 헤더/레이블 행 필터링 (product_name이 "보험명"인 경우 등)
            if product_data and not self._is_header_row(product_data):
                products.append(product_data)

        return products

    def _is_header_row(self, product: InsuranceProduct) -> bool:
        """행이 헤더/레이블 행인지 확인"""
        header_values = {
            '보험명', '보험사명', '계약일', '계약상태', '갱신유무',
            '피보험자', '증권번호', '납입상태', '납입주기', '만기일',
            '특약만기', '월납보험료', '납입보험료', '미납보험료', '총보험료'
        }
        return product.product_name in header_values

    def _find_product_columns(self, rows: Dict) -> List[str]:
        """상품이 있는 열 찾기 (Row 6의 보험명이 있는 열)"""
        row_6 = rows.get(6, {})
        columns = []

        for col in sorted(row_6.keys()):
            value = row_6[col]
            # 보험명이 들어있는 컬럼 찾기 (보험회사 이름, 상품명 등이 포함)
            if any(keyword in value for keyword in ['보험', '담보', '무배당', '(무)']):
                columns.append(col)

        return columns

    def _extract_product_from_column(self, rows: Dict, col: str) -> Optional[InsuranceProduct]:
        """특정 열에서 상품 정보 추출"""
        try:
            return InsuranceProduct(
                product_name=rows.get(6, {}).get(col, ''),
                insurance_company=rows.get(7, {}).get(col, ''),
                contract_date=rows.get(8, {}).get(col, ''),
                contract_status=rows.get(9, {}).get(col, ''),
                renewal_type=rows.get(10, {}).get(col, ''),
                policyholder=rows.get(11, {}).get(col, ''),
                policy_number=rows.get(12, {}).get(col, ''),
                payment_status=rows.get(13, {}).get(col, ''),
                payment_cycle=rows.get(14, {}).get(col, ''),
                maturity_date=rows.get(15, {}).get(col, ''),
                premium_end_date=rows.get(16, {}).get(col, ''),
                monthly_premium=rows.get(17, {}).get(col, ''),
                paid_premium=rows.get(18, {}).get(col, ''),
                remaining_premium=rows.get(19, {}).get(col, ''),
                total_premium=rows.get(20, {}).get(col, '')
            )
        except Exception as e:
            print(f"⚠️ 상품 추출 실패 ({col}): {e}")
            return None

    def extract_coverage_info(self) -> List[CoverageItem]:
        """보장 정보 추출"""
        rows = self._get_sheet_data()
        coverage_items = []

        # 보장 정보는 Row 24 이후에 시작 (Row 25는 헤더)
        product_columns = self._find_product_columns(rows)

        # Row 25부터 마지막까지 순회
        for row_num in sorted(rows.keys()):
            if row_num < 25:
                continue

            row_data = rows[row_num]

            # 대분류(B열), 소분류(C열), 보장총액(D열) 확인
            major = row_data.get('B', '').strip()
            minor = row_data.get('C', '').strip()
            total = row_data.get('D', '').strip()

            # 보장 정보 행인 경우 (C열에 내용이 있거나 B열에 카테고리가 있음)
            if minor or (major and not minor):
                products_coverage = {}

                for col in product_columns:
                    coverage_value = row_data.get(col, '').strip()
                    if coverage_value and coverage_value != '-':
                        product_name = rows.get(6, {}).get(col, '')
                        products_coverage[product_name] = coverage_value

                if minor or major:  # 의미있는 데이터만 저장
                    coverage_items.append(CoverageItem(
                        major_category=major,
                        minor_category=minor,
                        total_coverage=total,
                        products=products_coverage
                    ))

        return coverage_items

    def extract_all(self) -> Dict:
        """전체 데이터 추출"""
        return {
            'customer': asdict(self.extract_customer_info()),
            'products': [asdict(p) for p in self.extract_insurance_products()],
            'coverage': [asdict(c) for c in self.extract_coverage_info()]
        }


def analyze_insurance_excel(file_path: str) -> Dict:
    """
    편의 함수: Excel 파일 전체 분석

    Args:
        file_path: Excel 파일 경로

    Returns:
        {
            'customer': {...},
            'products': [{...}, ...],
            'coverage': [{...}, ...]
        }
    """
    analyzer = InsuranceExcelAnalyzer(file_path)
    return analyzer.extract_all()


if __name__ == '__main__':
    # 테스트 코드
    test_files = [
        "/root/.claude/uploads/f143b446-f3f6-5879-a44a-0b42c2db3b20/2437b768-_______________________________.xlsx",
        "/root/.claude/uploads/f143b446-f3f6-5879-a44a-0b42c2db3b20/93fba983-_______________________________.xlsx",
        "/root/.claude/uploads/f143b446-f3f6-5879-a44a-0b42c2db3b20/360fb087-_______________________________.xlsx"
    ]

    for file_path in test_files:
        print(f"\n{'='*80}")
        print(f"📋 파일: {file_path.split('/')[-1][:30]}...")
        print('='*80)

        try:
            data = analyze_insurance_excel(file_path)

            # 고객 정보
            customer = data['customer']
            print(f"\n👤 고객 정보:")
            print(f"   이름: {customer['name']}")
            print(f"   작성자: {customer['creator']}")
            print(f"   작성일: {customer['created_date']}")

            # 보험 상품
            products = data['products']
            print(f"\n📦 보험 상품 ({len(products)}개):")
            for i, product in enumerate(products, 1):
                print(f"   {i}. {product['product_name'][:40]}")
                print(f"      보험사: {product['insurance_company']}")
                print(f"      월납: {product['monthly_premium']}")

            # 보장 정보
            coverage = data['coverage']
            print(f"\n🛡️ 보장 정보 ({len(coverage)}개):")
            categories = {}
            for item in coverage:
                major = item['major_category']
                if major:
                    categories[major] = categories.get(major, 0) + 1

            for cat, count in sorted(categories.items()):
                if cat:
                    print(f"   {cat}: {count}개 세부항목")

        except Exception as e:
            print(f"❌ 오류: {e}")
