"""JSON 리포트 데이터 → Jinja2 템플릿(공통 디자인)으로 최종 HTML 렌더링."""
from __future__ import annotations

import importlib.resources as res

from jinja2 import Environment, FileSystemLoader, select_autoescape

_env: Environment | None = None


def _get_env() -> Environment:
    global _env
    if _env is None:
        template_dir = str(res.files(__package__) / "templates")
        _env = Environment(
            loader=FileSystemLoader(template_dir),
            autoescape=select_autoescape(["html"]),
        )
    return _env


def render_template(name: str, **context) -> str:
    return _get_env().get_template(name).render(**context)


def render_html(report_data: dict) -> str:
    return render_template("report.html.j2", **report_data)
