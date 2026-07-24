"""보험사 브랜드 매핑 — 코드, 표기용 컬러, 로고 마크업, 업권 분류."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Brand:
    code: str
    color: str
    color_bg: str
    kind: str  # "생보" | "손보" | "공제"
    logo_html: str


# 이미 CSS(.samsung/.meritz/.hyundai/.mg)에 정의된 4개 보험사 + 범용 폴백.
_KNOWN: dict[str, Brand] = {
    "삼성생명": Brand(
        code="samsung", color="#1428A0", color_bg="#EEF0FA", kind="생보",
        logo_html='<span class="sym-oval">SAMSUNG</span>',
    ),
    "삼성화재": Brand(
        code="samsung", color="#1428A0", color_bg="#EEF0FA", kind="손보",
        logo_html='<span class="sym-oval">SAMSUNG</span>',
    ),
    "메리츠화재": Brand(
        code="meritz", color="#E4002B", color_bg="#FCECEF", kind="손보",
        logo_html='<span class="wordmark-meritz">meritz</span>',
    ),
    "현대해상": Brand(
        code="hyundai", color="#F26F21", color_bg="#FEF1E8", kind="손보",
        logo_html='<span class="sym-hi">Hi</span>',
    ),
    "새마을금고": Brand(
        code="mg", color="#0067AC", color_bg="#E9F2F9", kind="공제",
        logo_html='<span class="sym-mg">MG</span>',
    ),
}

# 목록에 없는 보험사가 나오면 순환 사용할 범용 팔레트 (최대 6종).
_FALLBACK_PALETTE = [
    ("#0F9D8C", "#E7F6F3"),
    ("#7A4AE2", "#F1ECFC"),
    ("#B5860A", "#FBF3DF"),
    ("#2E7D32", "#E9F5EA"),
    ("#5B6B82", "#EEF1F5"),
    ("#C2410C", "#FCEBE1"),
]

_LIFE_KEYWORDS = ("생명",)
_COOP_KEYWORDS = ("금고", "공제", "협동조합", "새마을")


def _guess_kind(company: str) -> str:
    if any(k in company for k in _COOP_KEYWORDS):
        return "공제"
    if any(k in company for k in _LIFE_KEYWORDS):
        return "생보"
    return "손보"


class BrandRegistry:
    """PDF에서 발견된 보험사를 known/fallback 매핑에 배정한다."""

    def __init__(self):
        self._assigned: dict[str, Brand] = dict(_KNOWN)
        self._fallback_idx = 0

    def get(self, company: str) -> Brand:
        if company in self._assigned:
            return self._assigned[company]
        color, bg = _FALLBACK_PALETTE[self._fallback_idx % len(_FALLBACK_PALETTE)]
        self._fallback_idx += 1
        # code는 CSS 클래스가 아닌 인라인 스타일로 렌더링하도록 "custom" 접두어 사용
        code = f"custom{self._fallback_idx}"
        brand = Brand(
            code=code, color=color, color_bg=bg, kind=_guess_kind(company),
            logo_html=f'<span class="sym-generic" style="background:{color}">{company[:2]}</span>',
        )
        self._assigned[company] = brand
        return brand
