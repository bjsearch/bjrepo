"""저장된 리포트 여러 건을 같은 체크리스트 기준으로 나란히 비교하기 위한 데이터 조립."""
from __future__ import annotations


def build_comparison(reports: list[dict]) -> dict:
    """reports: builder.build_report_data()가 만든 전체 리포트 dict의 리스트."""
    section_titles: list[str] = []
    for r in reports:
        for s in r["coverage_sections"]:
            if s["title"] not in section_titles:
                section_titles.append(s["title"])

    sections = []
    for title in section_titles:
        labels: list[str] = []
        for r in reports:
            sec = next((s for s in r["coverage_sections"] if s["title"] == title), None)
            if not sec:
                continue
            for row in sec["rows"]:
                if row["label"] not in labels:
                    labels.append(row["label"])

        rows = []
        for label in labels:
            cells = []
            for r in reports:
                sec = next((s for s in r["coverage_sections"] if s["title"] == title), None)
                row = next((rw for rw in sec["rows"] if rw["label"] == label), None) if sec else None
                cells.append(row)
            rows.append({"label": label, "cells": cells})
        sections.append({"title": title, "rows": rows})

    return {
        "headers": [r["header"] for r in reports],
        "kpis": [r["kpis"] for r in reports],
        "sections": sections,
    }
