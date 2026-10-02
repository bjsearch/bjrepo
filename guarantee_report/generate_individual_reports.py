"""
개별 보장분석 MD 리포트 생성
Generate individual guarantee analysis reports for each customer
"""

import sys
sys.path.insert(0, '/tmp')

from excel_insurance_analyzer import analyze_insurance_excel
from pathlib import Path


def extract_premium_number(premium_str):
    """월납보험료 문자열에서 숫자 추출"""
    try:
        return int(premium_str.replace(',', '').replace(' 원', '').replace('원', ''))
    except:
        return 0


def generate_guarantee_report(file_path, output_file):
    """보장분석 보험 Excel 파일을 Markdown 리포트로 변환"""

    print(f"📊 분석 중: {Path(file_path).name}")

    # 데이터 추출
    data = analyze_insurance_excel(file_path)
    customer = data['customer']
    products = data['products']
    coverage = data['coverage']

    # 월납보험료 합계 계산
    total_monthly = 0
    for p in products:
        premium = extract_premium_number(p['monthly_premium'])
        total_monthly += premium

    # 보장 카테고리별 집계
    coverage_by_major = {}
    for item in coverage:
        major = item['major_category']
        if major and major.strip():
            if major not in coverage_by_major:
                coverage_by_major[major] = []
            coverage_by_major[major].append(item)

    # Markdown 생성
    evaluation = '보험료 많음' if total_monthly > 250000 else '적절함' if total_monthly > 100000 else '보험료 적음'

    md = f"""# 보장분석 리포트

## 1. 고객 정보

| 항목 | 내용 |
|------|------|
| 고객명 | {customer['name']} |
| 작성일 | {customer['created_date']} |
| 작성자 | {customer['creator']} |

---

## 2. 보험분석 현황

### 2.1 보험료 현황
- **월 납입 보험료**: {total_monthly:,}원 ({len(products)}개 상품)
- **평가**: {evaluation}

### 2.2 계약 구조 분석

| 분류 | 현황 |
|------|------|
| 전체 상품 수 | {len(products)}건 |

---

## 3. 가입 보험 상품

**{len(products)}개 상품:**

"""

    # 상품 목록
    for i, product in enumerate(products, 1):
        md += f"{i}. **{product['product_name']}**\n"
        md += f"   - 보험사: {product['insurance_company']}\n"
        md += f"   - 계약일: {product['contract_date']}\n"
        md += f"   - 월납: {product['monthly_premium']}\n"
        md += f"   - 상태: {product['contract_status']}\n"
        md += f"   - 갱신형태: {product['renewal_type']}\n\n"

    # 보장 정보
    md += """---

## 4. 보장 정보 분석

"""

    for major_category in sorted(coverage_by_major.keys()):
        if major_category:
            items = coverage_by_major[major_category]
            md += f"### {major_category}\n\n"

            for item in items:
                if item['minor_category']:
                    md += f"- **{item['minor_category']}**"
                    if item['total_coverage'] and item['total_coverage'] != '-':
                        md += f" (보장총액: {item['total_coverage']})"
                    md += "\n"

            md += "\n"

    # 권고사항
    md += f"""---

## 5. 권고사항

### 필수 검토 항목
1. 실손의료비보험 가입 여부 확인
2. 주요 질병(암, 뇌, 심장) 진단금 충분도 검토
3. 갱신형 보험의 갱신 시점 및 보료 인상 계획 확인

### 추가 고려사항
- 특약 만기 시 보장 공백 발생 여부 검토
- 중복 가입 최적화 검토
- 비갱신형 전환 가능성 검토

---

## 📝 참고사항

> ※ 본 리포트는 고객님의 보험 이해를 돕기 위한 자료입니다.
> ※ 정확한 보장 내용은 각 보험사 약관을 확인하시기 바랍니다.

---

**작성일**: {customer['created_date']}
**작성자**: {customer['creator']}
**버전**: v1.0
"""

    # 파일 저장
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(md)

    print(f"✓ 리포트 저장됨: {output_file}")
    return md


def main():
    """각 고객별 개별 리포트 생성"""

    file_paths = {
        "2437b768": "/root/.claude/uploads/f143b446-f3f6-5879-a44a-0b42c2db3b20/2437b768-_______________________________.xlsx",
        "93fba983": "/root/.claude/uploads/f143b446-f3f6-5879-a44a-0b42c2db3b20/93fba983-_______________________________.xlsx",
        "360fb087": "/root/.claude/uploads/f143b446-f3f6-5879-a44a-0b42c2db3b20/360fb087-_______________________________.xlsx"
    }

    print("=" * 80)
    print("📋 개별 보장분석 리포트 생성")
    print("=" * 80)

    for prefix, file_path in file_paths.items():
        try:
            # 고객명 추출
            data = analyze_insurance_excel(file_path)
            customer_name = data['customer']['name']

            # 출력 파일명
            output_file = f"/tmp/보장분석리포트_{customer_name}.md"

            # 리포트 생성
            generate_guarantee_report(file_path, output_file)

            print()
        except Exception as e:
            print(f"✗ 오류 ({prefix}): {e}")

    print("\n" + "=" * 80)
    print("✅ 모든 개별 리포트 생성 완료!")
    print("=" * 80)


if __name__ == '__main__':
    main()
