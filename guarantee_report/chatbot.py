"""저장된 리포트 내용을 근거로 질문에 답하는 챗봇.

Anthropic Messages API를 직접 호출한다(SDK 의존성 없이 표준 라이브러리만 사용).
리포트 JSON 데이터 + 보험 가이드라인(guidelines/insurance_guideline.md)을 시스템
프롬프트에 담아, 리포트에 없는 내용은 추측하지 않고 상품 승환을 유도하지 않도록 제약한다.
"""
from __future__ import annotations

import importlib.resources as res
import json
import os
import urllib.error
import urllib.request

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")
API_URL = "https://api.anthropic.com/v1/messages"

MAX_QUESTION_LEN = 500
MAX_HISTORY_TURNS = 8  # user+assistant 메시지 쌍 기준이 아니라 총 메시지 개수 상한


class ChatbotError(Exception):
    """사용자에게 그대로 노출해도 되는 챗봇 오류 메시지."""


def _load_guideline() -> str:
    path = res.files(__package__) / "guidelines" / "insurance_guideline.md"
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8")


_GUIDELINE_TEXT = _load_guideline()


def build_report_summary(data: dict) -> str:
    """리포트 JSON에서 챗봇이 참고할 핵심 정보만 골라 텍스트로 요약."""
    header = data.get("header", {})
    kpis = data.get("kpis", {})
    lines = [
        f"[고객 정보] {header.get('name')} · {header.get('gender')} · {header.get('birth_display')} "
        f"(보험나이 {header.get('age')}세) · 분석 기준일 {header.get('basis_date_display')}",
        f"[계약 현황] 총 {header.get('total_contracts')}건 "
        f"(생보 {header.get('life_count')} · 손보 {header.get('nonlife_count')} · 기타 {header.get('coop_count')})",
        f"[보험료] 월 납입 {kpis.get('monthly_premium')}원 · "
        f"총 보험료(납입완료+예정) {kpis.get('grand_total_man')}만원 · "
        f"진단 결과: 적정 {kpis.get('ok_count')} / 주의·부족 {kpis.get('warn_count')} / 미가입 {kpis.get('gap_count')}",
    ]

    contracts = data.get("contracts", [])
    if contracts:
        lines.append("\n[가입 계약 목록]")
        for c in contracts:
            badge = f" ({c['badge']})" if c.get("badge") else ""
            lines.append(f"- {c.get('company')} {c.get('title')}{badge}: {c.get('detail')} · 보험료 {c.get('premium_display')}")

    sections = data.get("coverage_sections", [])
    if sections:
        lines.append("\n[영역별 보장 진단]")
        for sec in sections:
            lines.append(f"# {sec['title']}")
            for row in sec.get("rows", []):
                note = f" (참고: {row['note']})" if row.get("note") else ""
                lines.append(
                    f"- {row['label']}: 권장 {row['recommend_display']} / 가입 {row['held_display']} "
                    f"→ {row['diagnosis']}{note}"
                )

    recos = data.get("recommendations", [])
    if recos:
        lines.append("\n[보완 추천 상품]")
        for r in recos:
            lines.append(f"- {r['title']} ({r['why']}): {r['detail']}")

    insights = data.get("insights", [])
    if insights:
        lines.append("\n[핵심 진단 및 제언]")
        for ins in insights:
            lines.append(f"- {ins['title']}: {ins['text']}")

    return "\n".join(lines)


def _system_prompt(report_summary: str) -> str:
    parts = [
        "당신은 고객이 자신의 '보장분석 리포트' 내용을 이해하도록 돕는 보험 상담 도우미입니다.",
        "아래 [리포트 데이터]와 [보험 가이드라인]만을 근거로, 친절하고 간결한 한국어로 답변하세요.",
        "리포트에 없는 개인정보(주민등록번호, 연락처 등)를 추측하지 말고, 데이터에 없는 내용은 모른다고 답하세요.",
        "특정 보험사·상품 가입을 노골적으로 권유하거나 기존 계약 해지(승환)를 부추기지 마세요. "
        "리포트에 이미 담긴 추천 근거를 벗어난 단정적 조언은 피하세요.",
        "필요할 때는 본 답변이 참고용이며 보험금 지급 근거가 될 수 없다는 점을 안내하세요.",
        "\n[리포트 데이터]\n" + report_summary,
    ]
    if _GUIDELINE_TEXT:
        parts.append("\n[보험 가이드라인 참고자료]\n" + _GUIDELINE_TEXT)
    return "\n".join(parts)


def ask(question: str, data: dict, history: list[dict] | None = None) -> str:
    if not ANTHROPIC_API_KEY:
        raise ChatbotError("챗봇 기능이 아직 설정되지 않았습니다. 관리자에게 ANTHROPIC_API_KEY 설정을 요청해주세요.")

    question = (question or "").strip()
    if not question:
        raise ChatbotError("질문을 입력해주세요.")
    if len(question) > MAX_QUESTION_LEN:
        raise ChatbotError(f"질문이 너무 깁니다 ({MAX_QUESTION_LEN}자 이내로 입력해주세요).")

    messages = []
    for turn in (history or [])[-MAX_HISTORY_TURNS:]:
        role = turn.get("role") if isinstance(turn, dict) else None
        content = str(turn.get("content", ""))[:MAX_QUESTION_LEN] if isinstance(turn, dict) else ""
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": question})

    payload = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": 700,
        "system": _system_prompt(build_report_summary(data)),
        "messages": messages,
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise ChatbotError(f"답변 생성 중 오류가 발생했습니다 (API 오류 {e.code}). 잠시 후 다시 시도해주세요.") from e
    except urllib.error.URLError as e:
        raise ChatbotError("답변 생성 중 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.") from e

    blocks = body.get("content", [])
    text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text").strip()
    if not text:
        raise ChatbotError("답변을 생성하지 못했습니다. 다시 시도해주세요.")
    return text
