# 🚀 Vercel 배포 가이드

## 빠른 배포 (GitHub 연동)

### 1단계: GitHub 연동
가장 간단한 방법입니다. 코드 변경시 자동으로 배포됩니다.

**URL:** https://vercel.com/import
1. "Import from Git Repository" 클릭
2. GitHub 계정 연동
3. `bjsearch/bjrepo` 저장소 선택
4. 환경 변수 설정

### 2단계: 환경 변수 설정

Vercel 대시보드에서 다음 변수들을 설정하세요:

```
NEXT_PUBLIC_APP_URL = https://your-domain.vercel.app
ANTHROPIC_API_KEY = your_anthropic_api_key_here
YOUTUBE_API_KEY = your_youtube_api_key_here (필요시)
```

### 3단계: 배포 완료
Vercel이 자동으로 빌드하고 배포합니다.
- **예상 배포 시간:** 2-3분
- **프리뷰 URL:** PR마다 자동 생성
- **프로덕션 URL:** `https://<your-project>.vercel.app`

---

## CLI를 이용한 배포

### 1단계: Vercel CLI 설치

```bash
npm install -g vercel
```

### 2단계: 로그인

```bash
vercel login
```

### 3단계: 배포

```bash
vercel --prod
```

### 4단계: 환경 변수 설정

```bash
vercel env add ANTHROPIC_API_KEY
vercel env add YOUTUBE_API_KEY
vercel env add NEXT_PUBLIC_APP_URL
```

---

## 배포 후 확인사항

- ✅ Golf Typing 게임 페이지: `https://<your-domain>.vercel.app/golf-typing`
- ✅ 모든 API 엔드포인트 정상 작동
- ✅ 데이터베이스 연결 (필요시)

---

## 커스텀 도메인 연결

Vercel 대시보드에서:
1. Settings → Domains
2. "Add Domain" 클릭
3. 도메인 입력
4. DNS 레코드 설정

---

## 문제 해결

### "Environment variables not found"
→ Vercel 대시보드에서 환경 변수 확인

### 빌드 실패
→ `npm run build` 로컬에서 테스트

### API 오류
→ CORS 설정 확인 (필요시 `next.config.mjs` 수정)

---

## 배포 전 체크리스트

- [ ] 로컬 빌드 성공 (`npm run build`)
- [ ] 환경 변수 준비
- [ ] GitHub 저장소 최신 커밋 확인
- [ ] `.env.local`이 `.gitignore`에 포함되어 있는지 확인

---

**배포 완료 후:** 게임을 웹에서 즉시 플레이할 수 있습니다! 🎉
