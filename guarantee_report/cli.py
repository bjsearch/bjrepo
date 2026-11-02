#!/usr/bin/env python3
"""
보장분석 PDF('보험신용정보 통합조회 결과서') → HTML 리포트 생성 CLI.

사용법:
  # PDF에서 바로 HTML 생성
  python -m guarantee_report.cli report.pdf -o out.html

  # 데이터만 JSON으로 추출 (설계사가 검수/수정 후 사용)
  python -m guarantee_report.cli report.pdf --json-out data.json

  # 수정된 JSON으로 최종 HTML 렌더링 (템플릿만 재사용)
  python -m guarantee_report.cli --from-json data.json -o out.html

  # 권장금액 체크리스트 커스터마이즈
  python -m guarantee_report.cli report.pdf -o out.html --rules my_rules.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .builder import build_report_data
from .parser import ReportParseError, parse_pdf
from .render import render_html


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="guarantee-report",
        description="보장분석 PDF를 같은 디자인의 HTML 리포트로 변환합니다.",
    )
    p.add_argument("pdf", nargs="?", help="입력 PDF 경로 (보험신용정보 통합조회 결과서)")
    p.add_argument("--from-json", metavar="DATA_JSON", help="PDF 대신 이미 추출된 데이터 JSON에서 렌더링")
    p.add_argument("-o", "--output", default="report.html", help="출력 HTML 경로 (기본: report.html)")
    p.add_argument("--json-out", metavar="PATH", help="중간 데이터 JSON을 저장할 경로 (렌더링 전 검수용)")
    p.add_argument("--rules", metavar="RULES_JSON", help="권장 보장금액 체크리스트 커스텀 파일")
    args = p.parse_args(argv)

    if not args.pdf and not args.from_json:
        p.error("PDF 경로 또는 --from-json 중 하나는 필요합니다.")

    try:
        if args.from_json:
            data = json.loads(Path(args.from_json).read_text(encoding="utf-8"))
        else:
            parsed = parse_pdf(args.pdf)
            data = build_report_data(parsed, rules_path=args.rules)
    except ReportParseError as e:
        print(f"오류: {e}", file=sys.stderr)
        return 1
    except FileNotFoundError as e:
        print(f"오류: 파일을 찾을 수 없습니다 — {e}", file=sys.stderr)
        return 1

    if args.json_out:
        Path(args.json_out).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"데이터 JSON 저장: {args.json_out}")

    html = render_html(data)
    Path(args.output).write_text(html, encoding="utf-8")
    print(f"리포트 생성 완료: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
