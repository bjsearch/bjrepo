"""JSON 리포트 데이터 → Jinja2 템플릿(공통 디자인)으로 최종 HTML 렌더링."""
from __future__ import annotations

import importlib.resources as res

from jinja2 import Environment, FileSystemLoader, select_autoescape


def render_html(report_data: dict) -> str:
    template_dir = str(res.files(__package__) / "templates")
    env = Environment(
        loader=FileSystemLoader(template_dir),
        autoescape=select_autoescape(["html"]),
    )
    template = env.get_template("report.html.j2")
    return template.render(**report_data)
