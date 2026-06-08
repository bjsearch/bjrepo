# 골프 스윙 분석기 (Golf Swing Analyzer)

스윙 영상을 업로드하고 사용한 클럽(드라이버 / 아이언 번호 / 웻지 각도)을 선택하면,
AI가 영상에서 추출한 프레임을 분석하여 다음을 제공합니다.

- 스윙 종합 점수 및 요약
- 단계별 스윙 분석
- 추천 연습 방법
- 참고하면 좋을 선수 추천

## 동작 방식

Claude API는 동영상을 직접 분석할 수 없으므로, 브라우저에서 `<video>` + `<canvas>`로
영상의 주요 구간(어드레스~팔로우스루)을 일정 간격의 정지 이미지(JPEG)로 추출한 뒤
Claude Vision에 전달하여 분석합니다 (`lib/extractFrames.ts`, `app/api/analyze-swing/route.ts`).

## 시작하기

```bash
npm install
cp .env.local.example .env.local   # ANTHROPIC_API_KEY 입력
npm run dev
```

기본 포트는 3001입니다 (`http://localhost:3001`).
