"""
배치 분석 데모: 여러 고객 Excel 파일을 한 번에 처리

사용법:
    python demo_batch_analysis.py
"""

import sys
sys.path.insert(0, '/tmp')

from excel_insurance_analyzer import analyze_insurance_excel
import json
from pathlib import Path


def create_summary_stats(data):
    """데이터에서 통계 정보 추출"""
    products = data['products'][1:]  # 헤더 제외

    # 월납보험료 계산
    monthly_premiums = []
    for p in products:
        premium = p['monthly_premium']
        # "28,744 원" 형식을 숫자로 변환
        try:
            num = int(premium.replace(',', '').replace(' 원', '').replace('원', ''))
            monthly_premiums.append(num)
        except:
            pass

    total_monthly = sum(monthly_premiums) if monthly_premiums else 0

    return {
        'product_count': len(products),
        'total_monthly_premium': f"{total_monthly:,}원",
        'average_product_monthly': f"{total_monthly // len(products) if products else 0:,}원",
        'products': [f"{p['product_name'][:40]} ({p['insurance_company']})" for p in products]
    }


def generate_batch_report(file_paths):
    """여러 파일을 분석하여 통합 리포트 생성"""

    results = {}

    print("=" * 80)
    print("📋 배치 분석 시작")
    print("=" * 80)

    for file_path in file_paths:
        try:
            file_name = Path(file_path).name[:30]
            print(f"\n📁 파일: {file_name}...")

            # 데이터 추출
            data = analyze_insurance_excel(file_path)
            customer_name = data['customer']['name']

            # 통계 생성
            stats = create_summary_stats(data)

            results[customer_name] = {
                'file': file_path,
                'customer_info': data['customer'],
                'stats': stats,
                'product_count': stats['product_count'],
                'total_monthly': stats['total_monthly_premium'],
                'products': stats['products']
            }

            print(f"✓ {customer_name}님 분석 완료")
            print(f"  - 보험 상품: {stats['product_count']}개")
            print(f"  - 월납보험료: {stats['total_monthly_premium']}")

        except Exception as e:
            print(f"✗ 오류: {e}")

    return results


def print_comparison_table(results):
    """고객별 비교 테이블 출력"""

    print("\n" + "=" * 80)
    print("📊 고객별 비교 요약")
    print("=" * 80)

    # 정렬 (월납보험료 기준)
    sorted_results = sorted(
        results.items(),
        key=lambda x: int(x[1]['stats']['total_monthly_premium'].replace(',', '').replace('원', '')),
        reverse=True
    )

    print("\n{:<15} {:<15} {:<15} {:<20}".format(
        "고객명", "보험상품수", "월납보험료", "작성일"
    ))
    print("-" * 80)

    for name, info in sorted_results:
        print("{:<15} {:<15} {:<15} {:<20}".format(
            name,
            f"{info['stats']['product_count']}개",
            info['stats']['total_monthly_premium'],
            info['customer_info']['created_date']
        ))

    print("-" * 80)

    # 통계
    total_customers = len(results)
    total_products = sum(info['stats']['product_count'] for info in results.values())

    # 총 월납보험료 (숫자로 계산)
    total_premiums = 0
    for info in results.values():
        premium_str = info['stats']['total_monthly_premium']
        premium_num = int(premium_str.replace(',', '').replace('원', ''))
        total_premiums += premium_num

    print(f"\n📈 전체 통계:")
    print(f"  - 총 고객 수: {total_customers}명")
    print(f"  - 총 보험 상품: {total_products}개")
    print(f"  - 총 월납보험료: {total_premiums:,}원")
    print(f"  - 평균 월납보험료: {total_premiums // total_customers:,}원/고객")


def export_json_report(results, output_file):
    """JSON 형식으로 리포트 내보내기"""

    # JSON 직렬화를 위해 dataclass를 dict로 변환
    json_data = {}
    for name, info in results.items():
        json_data[name] = {
            'customer_info': info['customer_info'],
            'stats': info['stats'],
            'products': info['products']
        }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)

    print(f"\n💾 JSON 리포트 저장됨: {output_file}")


def generate_markdown_summary(results, output_file):
    """마크다운 형식의 통합 리포트 생성"""

    md = "# 고객 보장분석 통합 리포트\n\n"
    md += f"**분석 완료**: {len(results)}명의 고객\n\n"

    md += "## 📊 고객별 요약\n\n"

    for name, info in sorted(results.items()):
        md += f"### {name}님\n\n"
        md += f"- **작성일**: {info['customer_info']['created_date']}\n"
        md += f"- **작성자**: {info['customer_info']['creator']}\n"
        md += f"- **보험 상품**: {info['stats']['product_count']}개\n"
        md += f"- **월납보험료**: {info['stats']['total_monthly_premium']}\n"
        md += f"- **평균 상품료**: {info['stats']['average_product_monthly']}\n\n"

        md += "#### 가입 보험 목록\n\n"
        for i, product in enumerate(info['products'], 1):
            md += f"{i}. {product}\n"

        md += "\n---\n\n"

    # 전체 통계
    total_customers = len(results)
    total_products = sum(info['stats']['product_count'] for info in results.values())

    total_premiums = 0
    for info in results.values():
        premium_str = info['stats']['total_monthly_premium']
        premium_num = int(premium_str.replace(',', '').replace('원', ''))
        total_premiums += premium_num

    md += "## 📈 전체 통계\n\n"
    md += f"- **총 고객**: {total_customers}명\n"
    md += f"- **총 보험상품**: {total_products}개\n"
    md += f"- **총 월납보험료**: {total_premiums:,}원\n"
    md += f"- **평균 월납보험료**: {total_premiums // total_customers:,}원/고객\n"

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(md)

    print(f"📄 마크다운 리포트 저장됨: {output_file}")


def main():
    """메인 함수"""

    # 분석할 파일들
    file_paths = [
        "/root/.claude/uploads/f143b446-f3f6-5879-a44a-0b42c2db3b20/2437b768-_______________________________.xlsx",
        "/root/.claude/uploads/f143b446-f3f6-5879-a44a-0b42c2db3b20/93fba983-_______________________________.xlsx",
        "/root/.claude/uploads/f143b446-f3f6-5879-a44a-0b42c2db3b20/360fb087-_______________________________.xlsx"
    ]

    # 배치 분석 실행
    results = generate_batch_report(file_paths)

    # 비교 테이블 출력
    print_comparison_table(results)

    # 리포트 내보내기
    export_json_report(results, '/tmp/batch_analysis_report.json')
    generate_markdown_summary(results, '/tmp/batch_analysis_report.md')

    print("\n" + "=" * 80)
    print("✅ 배치 분석 완료!")
    print("=" * 80)


if __name__ == '__main__':
    main()
