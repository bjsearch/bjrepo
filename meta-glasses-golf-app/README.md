# Glasses Caddie — Meta 스마트 안경(디스플레이 없음) × 골프 워치 오디오 컴패니언 앱

스마트 골프 워치와 연동해 라운드 중 핀까지 거리, 추천 클럽, 스코어를 **화면이 없는** Meta
스마트 안경(예: 일반 Ray-Ban Meta / Oakley Meta처럼 카메라·오디오만 있고 렌즈 디스플레이가
없는 모델)을 위해 **전부 음성으로** 전달하는 컴패니언 웹 앱입니다.

## 왜 오디오 전용인가

Meta 스마트 안경 라인업 중 **렌즈에 실제 디스플레이가 달린 모델(Ray-Ban Display)** 은 2026년
5월부터 Meta Wearables Device Access Toolkit을 통해 서드파티가 화면에 콘텐츠를 표시할 수
있게 됐지만, 이 앱은 그 모델을 대상으로 하지 않습니다. **디스플레이가 없는 안경과
연결한다**는 전제로 설계했기 때문에, 어떤 화면에도 정보를 띄우지 않고 **모든 안내를
음성(TTS)으로만** 전달합니다.

- **오디오 탭**의 안내 기록 목록은 안경 화면이 아니라 **폰에서 보는 자막/로그**일 뿐이며,
  실제 사용자 경험은 안경 스피커로 흘러나오는 음성 안내입니다.
- 홀이 바뀌거나 워치가 샷을 감지하면 자동으로 음성 안내가 나갑니다(오디오 탭에서 각각
  켜고 끌 수 있음).
- "핀까지 거리 알려줘", "클럽 추천해줘" 같은 음성 질문에도 음성으로 답합니다.

## 하드웨어 제약 (정직하게 밝힘)

- **Meta 스마트 안경**: 디스플레이 없는 모델은 Meta AI 앱 생태계 안에서 카메라/오디오
  캡처, 알림 전달 정도의 연동을 지원합니다. 이 앱의 TTS 음성은 브라우저
  `speechSynthesis`로 구현했으며, 실제 하드웨어에 배포한다면 Meta Wearables Device Access
  Toolkit의 오디오/알림 채널을 통해 동일한 텍스트를 안경 스피커로 라우팅하도록 연동할 수
  있습니다.
- **스마트 골프 워치**: Garmin, Coros, Shot Scope 등 골프 워치 제조사들은 홀 번호·핀까지
  거리 같은 골프 전용 데이터를 공개 BLE 프로토콜로 제공하지 않고, 각자의 폐쇄형 앱/API로만
  제공합니다. 따라서 이 앱의 **실제 Bluetooth 연결(Web Bluetooth API)**은 대부분의 스포츠
  워치가 표준으로 브로드캐스트하는 **심박수(Heart Rate)·배터리(Battery Level) GATT
  서비스**만 실시간으로 받아옵니다.
  - 홀·핀 거리 데이터는 **데모 모드**(가상 라운드 시뮬레이션)로 미리보거나, **라운드 탭에서
    직접 입력**(워치 화면에 표시된 거리를 손으로 입력)해서 사용합니다.
  - 특정 워치 제조사의 SDK/파트너십이 있다면 `lib/bluetoothWatch.ts`에 해당 프로토콜 연동을
    추가해 실제 거리 데이터를 자동으로 받아오도록 확장할 수 있습니다.

## 주요 기능

- **워치 연결** (`연결` 탭): Web Bluetooth로 실제 기기 페어링, 또는 데모 모드로 가상 라운드
  데이터 스트리밍
- **오디오 안내** (`오디오` 탭): 홀·거리·클럽 추천을 음성으로 자동/수동 안내, 자동 안내
  on/off 설정, 최근 안내 기록(폰 화면용 로그)
- **라운드 스코어** (`라운드` 탭): 홀 이동, 파/타수/퍼트 기록, 스코어카드 합계, 핀 거리 수동
  입력
- **클럽 추천** (`lib/clubRecommend.ts`): 사용자가 설정한 클럽별 평균 비거리를 기준으로 남은
  거리에 맞는 클럽 자동 추천
- **음성 명령** (`음성` 탭): 브라우저 Web Speech API로 "핀까지 거리 알려줘", "클럽
  추천해줘", "다음 홀"과 같은 한국어 음성 명령 인식 + 음성 응답(TTS). 화면이 없으므로
  질문도 음성, 답도 음성입니다.
- **설정** (`설정` 탭): 클럽별 평균 거리 프로필 편집 (로컬 저장)

모든 데이터(클럽 프로필, 라운드 스코어, 오디오 자동 안내 설정)는 브라우저
`localStorage`에 저장되는 로컬 전용 데이터이며, 별도 로그인이나 서버 저장소가 없습니다.

## 시작하기

```bash
npm install
npm run dev
```

기본 포트는 3002입니다 (`http://localhost:3002`).

Web Bluetooth 실제 기기 연결과 Web Speech 음성 인식/TTS를 테스트하려면 **HTTPS 환경 +
Android Chrome** 등 지원 브라우저에서 열어야 합니다(로컬 `http://localhost`는 예외적으로
허용됨).

## Vercel 배포

이 디렉터리는 모노레포 내 독립 Next.js 앱이므로, Vercel에서 **Root Directory를
`meta-glasses-golf-app`으로 지정**해야 합니다.

1. https://vercel.com/new 에서 이 GitHub 저장소(`bjsearch/bjrepo`)를 Import
2. "Root Directory"를 `meta-glasses-golf-app`으로 설정 (Framework는 Next.js로 자동 인식)
3. Deploy

## 디렉터리 구조

```
meta-glasses-golf-app/
├── app/
│   ├── layout.tsx        # 루트 레이아웃
│   ├── page.tsx          # 탭 기반 메인 화면 + 자동 음성 안내 트리거
│   └── globals.css
├── components/
│   ├── WatchConnect.tsx  # BLE 페어링 / 데모 모드 UI
│   ├── AudioFeed.tsx     # 음성 안내 설정 + 안내 기록(폰 화면용 로그)
│   ├── RoundPanel.tsx    # 홀 이동, 스코어, 거리 수동 입력
│   ├── ClubProfile.tsx   # 클럽별 평균 거리 설정
│   └── VoiceBar.tsx      # 음성 명령 인식 + TTS 응답
└── lib/
    ├── bluetoothWatch.ts # Web Bluetooth 연결 + 데모 시뮬레이터
    ├── audioAnnouncer.ts # 공용 TTS 재생 + 안내 문구 생성
    ├── clubRecommend.ts  # 거리 기반 클럽 추천 로직
    ├── storage.ts        # localStorage 영속화
    ├── types.ts
    ├── webBluetooth.d.ts # Web Bluetooth 앰비언트 타입
    └── webSpeech.d.ts    # Web Speech API 앰비언트 타입
```
