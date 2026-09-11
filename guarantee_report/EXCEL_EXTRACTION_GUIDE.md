# 보험 Excel 데이터 추출 가이드
# Insurance Excel Data Extraction Guide

## 목표 (Objective)

일관된 구조의 보장분석 Excel 파일에서 고객정보, 보험상품, 보장정보를 자동으로 추출하는 방법을 제시합니다.
- Pattern learning for consistent insurance analysis Excel files
- Automatic data extraction from multiple customer files
- Support for any Excel file with the same structure

---

## 1. 핵심 개념 (Core Concepts)

### 1.1 Excel 파일 구조 인식

**보장분석 Excel 파일의 일관된 구조:**

```
Row 2:    고객명 (Customer Name) - B2 위치
Row 3-4:  작성자/작성일 (Creator/Date) - K3, K4 or N3, N4
Row 5:    헤더 행 (Header Row) - 열 레이블 정보
Row 6:    첫 번째 상품 - 각 열에 상품명, 보험사, 계약일 등
Row 7-20: 상품 세부정보 (각 행마다 다른 필드)
Row 24:   보장 정보 헤더
Row 25+:  보장 항목 (Coverage items)
```

### 1.2 동적 열 감지 (Dynamic Column Detection)

**핵심 알고리즘:**
- Row 6에서 "보험", "담보", "무배당", "(무)" 키워드를 포함한 열 찾기
- 찾은 각 열이 하나의 상품 데이터
- 헤더 행과 실제 데이터 행 구분 필요

**구현 예시:**
```python
def _find_product_columns(self, rows: Dict) -> List[str]:
    row_6 = rows.get(6, {})
    columns = []
    for col in sorted(row_6.keys()):
        value = row_6[col]
        if any(keyword in value for keyword in ['보험', '담보', '무배당', '(무)']):
            columns.append(col)
    return columns
```

---

## 2. 모듈 사용 방법 (How to Use the Module)

### 2.1 기본 사용법 (Basic Usage)

```python
from excel_insurance_analyzer import analyze_insurance_excel

# Excel 파일 분석
file_path = "/path/to/insurance_file.xlsx"
data = analyze_insurance_excel(file_path)

# 결과 구조:
# {
#     'customer': {'name': '곽정남', 'created_date': '2026-08-05', 'creator': '장재혁'},
#     'products': [
#         {'product_name': '무배당생명보험', 'insurance_company': 'AIA', ...},
#         ...
#     ],
#     'coverage': [
#         {'major_category': '3대진단', 'minor_category': '암진단', ...},
#         ...
#     ]
# }
```

### 2.2 고객 정보 추출

```python
customer = data['customer']
print(f"고객명: {customer['name']}")
print(f"작성자: {customer['creator']}")
print(f"작성일: {customer['created_date']}")
```

### 2.3 보험 상품 추출 및 분석

```python
products = data['products']
print(f"총 {len(products)}개 상품 가입")

for i, product in enumerate(products, 1):
    print(f"\n{i}. {product['product_name']}")
    print(f"   보험사: {product['insurance_company']}")
    print(f"   월납: {product['monthly_premium']}")
    print(f"   갱신형태: {product['renewal_type']}")

# 월납보험료 합계 계산
def extract_premium_number(premium_str):
    try:
        return int(premium_str.replace(',', '').replace(' 원', '').replace('원', ''))
    except:
        return 0

total_monthly = sum(extract_premium_number(p['monthly_premium']) for p in products)
print(f"\n총 월납보험료: {total_monthly:,}원")
```

### 2.4 보장 정보 추출 및 분석

```python
coverage = data['coverage']
print(f"총 {len(coverage)}개 보장항목\n")

# 대분류별로 그룹화
by_major = {}
for item in coverage:
    major = item['major_category']
    if major:
        if major not in by_major:
            by_major[major] = []
        by_major[major].append(item)

# 출력
for major, items in sorted(by_major.items()):
    print(f"[{major}]")
    for item in items:
        minor = item['minor_category'] or '기타'
        total = item['total_coverage'] or '-'
        print(f"  - {minor}: {total}")
```

---

## 3. 배치 처리 (Batch Processing)

### 3.1 여러 파일 처리

```python
from excel_insurance_analyzer import analyze_insurance_excel
from pathlib import Path

file_paths = [
    "/path/to/customer1.xlsx",
    "/path/to/customer2.xlsx",
    "/path/to/customer3.xlsx"
]

results = {}

for file_path in file_paths:
    try:
        data = analyze_insurance_excel(file_path)
        customer_name = data['customer']['name']
        
        results[customer_name] = {
            'file': file_path,
            'customer': data['customer'],
            'products': data['products'],
            'coverage': data['coverage']
        }
        
        print(f"✓ {customer_name}님 분석 완료")
    except Exception as e:
        print(f"✗ 오류: {e}")
```

### 3.2 크로스 고객 비교 (Cross-Customer Comparison)

```python
# 월납보험료 비교
print("고객별 월납보험료 비교:\n")

comparison = []
for name, result in results.items():
    products = result['products']
    total = sum(extract_premium_number(p['monthly_premium']) for p in products)
    comparison.append((name, total, len(products)))

# 월납 기준 정렬
for name, total, count in sorted(comparison, key=lambda x: x[1], reverse=True):
    print(f"{name:15} {total:>10,}원 ({count}개 상품)")
```

---

## 4. 실제 적용 예시 (Real-world Example)

### 4.1 markdown 리포트 생성

```python
def generate_report(file_path):
    data = analyze_insurance_excel(file_path)
    customer = data['customer']
    products = data['products']
    
    md = f"""# 보장분석 리포트 - {customer['name']}
    
## 고객정보
- 이름: {customer['name']}
- 작성일: {customer['created_date']}
- 작성자: {customer['creator']}

## 가입 상품 ({len(products)}개)

"""
    
    for i, p in enumerate(products, 1):
        md += f"{i}. {p['product_name']} ({p['insurance_company']})\n"
        md += f"   - 월납: {p['monthly_premium']}\n"
    
    return md
```

### 4.2 JSON 내보내기 (Export as JSON)

```python
import json

def export_to_json(file_path, output_json):
    data = analyze_insurance_excel(file_path)
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
```

---

## 5. 추출된 데이터 모델 (Data Models)

### 5.1 CustomerInfo
```python
@dataclass
class CustomerInfo:
    name: str                          # 고객명
    phone: Optional[str] = None        # 전화번호
    birth: Optional[str] = None        # 생년월일
    created_date: Optional[str] = None # 작성일
    creator: Optional[str] = None      # 작성자
```

### 5.2 InsuranceProduct
```python
@dataclass
class InsuranceProduct:
    product_name: str          # 상품명
    insurance_company: str     # 보험사
    contract_date: str         # 계약일
    contract_status: str       # 계약상태
    renewal_type: str          # 갱신형/비갱신형
    policyholder: str          # 피보험자
    policy_number: str         # 증권번호
    payment_status: str        # 납입상태
    payment_cycle: str         # 납입주기
    maturity_date: str         # 만기일
    premium_end_date: str      # 특약만기
    monthly_premium: str       # 월납보험료
    paid_premium: str          # 납입보험료
    remaining_premium: str     # 미납보험료
    total_premium: str         # 총보험료
```

### 5.3 CoverageItem
```python
@dataclass
class CoverageItem:
    major_category: str        # 대분류 (3대진단, 실비 등)
    minor_category: str        # 소분류 (암진단, 입원의료비 등)
    total_coverage: str        # 보장총액
    products: Dict[str, str]   # {상품명: 보장액}
```

---

## 6. 데이터 추출 흐름도 (Data Flow Diagram)

```
Excel File (.xlsx)
    ↓
[ZIP 해제 (Unzip)]
    ↓
sharedStrings.xml  +  sheet1.xml
    ↓                    ↓
[텍스트 로드]      [데이터 로드]
    ↓                    ↓
    └─────────┬──────────┘
              ↓
        [셀 값 매핑]
              ↓
    [Row 2-4: 고객정보]
    [Row 6-20: 상품정보]
    [Row 25+: 보장정보]
              ↓
       [DataClass 변환]
              ↓
    Dictionary 형식으로 반환
```

---

## 7. 문제 해결 (Troubleshooting)

### 7.1 상품이 중복되거나 헤더가 포함됨

**증상:** 첫 번째 상품이 "보험명", "보험사명" 같은 헤더 값으로 표시됨

**원인:** Excel 파일의 Row 6에 헤더 정보가 포함되어 있음

**해결법:** `_is_header_row()` 메서드가 자동으로 필터링함
```python
def _is_header_row(self, product: InsuranceProduct) -> bool:
    header_values = {
        '보험명', '보험사명', '계약일', '계약상태', '갱신유무', ...
    }
    return product.product_name in header_values
```

### 7.2 특정 열에서 데이터를 찾을 수 없음

**증상:** 특정 고객 파일에서 product_columns가 비어있음

**원인:** Excel 구조가 예상과 다를 수 있음 (다른 행에 상품 정보가 있음)

**진단:** 직접 확인하기
```python
from excel_insurance_analyzer import InsuranceExcelAnalyzer
analyzer = InsuranceExcelAnalyzer("file.xlsx")
rows = analyzer._get_sheet_data()
print(f"Row 6: {rows.get(6, {})}")
```

### 7.3 XLSX 파일이 손상됨

**증상:** `zipfile.BadZipFile` 오류

**해결법:** Excel 파일을 다시 저장하거나, 원본 파일이 올바른지 확인

---

## 8. 확장 및 커스터마이징 (Customization)

### 8.1 추가 데이터 필드 지원

Excel 구조가 변경된 경우, `_extract_product_from_column` 메서드 수정:

```python
def _extract_product_from_column(self, rows: Dict, col: str) -> Optional[InsuranceProduct]:
    # 행 번호를 필요에 맞게 조정
    return InsuranceProduct(
        product_name=rows.get(6, {}).get(col, ''),  # 상품명 행 번호
        insurance_company=rows.get(7, {}).get(col, ''),
        # ... 다른 필드들 ...
    )
```

### 8.2 다른 유형의 보험 분석 지원

```python
class CustomInsuranceAnalyzer(InsuranceExcelAnalyzer):
    def _find_product_columns(self, rows: Dict) -> List[str]:
        # 커스텀 키워드 추가
        row_6 = rows.get(6, {})
        columns = []
        custom_keywords = ['보험', '담보', '무배당', '(무)', '맞춤형']
        # ... 로직 ...
        return columns
```

---

## 9. 성능 최적화 (Performance Tips)

### 9.1 대량 파일 처리

```python
from concurrent.futures import ThreadPoolExecutor

def process_file(file_path):
    return analyze_insurance_excel(file_path)

file_paths = [...]  # 많은 파일들

with ThreadPoolExecutor(max_workers=4) as executor:
    results = list(executor.map(process_file, file_paths))
```

### 9.2 메모리 효율

- 필요한 데이터만 추출하기
- 일시 데이터는 처리 후 버리기
- 매우 큰 파일은 스트리밍 처리 고려

---

## 10. 적용 사례 (Use Cases)

### 10.1 자동 리포트 생성
Excel 파일 → 자동 분석 → Markdown/PDF 리포트 생성

### 10.2 데이터베이스 저장
Excel 파일 → 데이터 추출 → 데이터베이스 저장 → 웹 대시보드 표시

### 10.3 비교 분석
여러 고객 파일 → 일괄 분석 → 크로스 고객 비교 보고서

### 10.4 품질 검사
Excel 파일 → 데이터 유효성 검사 → 누락된 항목 리포트

---

## 체크리스트 (Checklist for New Files)

새로운 Excel 파일 처리 시 확인사항:

- [ ] 파일이 `.xlsx` 형식 (구 Excel `.xls` 형식은 지원 안 함)
- [ ] Row 2에 고객명 위치 확인
- [ ] Row 6에 첫 번째 상품명 위치 확인
- [ ] "보험", "담보" 등 키워드를 포함한 상품명 확인
- [ ] Row 25 이후에 보장 정보 확인
- [ ] 파일이 손상되지 않았는지 다른 프로그램에서 열어 확인

---

## 참고자료 (References)

- **excel_insurance_analyzer.py**: 메인 모듈
- **generate_individual_reports.py**: 개별 리포트 생성 스크립트
- **demo_batch_analysis.py**: 배치 처리 예시

---

**마지막 업데이트**: 2026-08-10  
**버전**: 1.0
