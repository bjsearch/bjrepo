'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

export type Locale = 'ko' | 'en'

const STORAGE_KEY = 'carry-coach-locale'

const translations = {
  // page.tsx
  'hero.description': {
    ko: '스윙 영상을 올리고 사용한 클럽을 선택하면, AI 코치가 점수·분석·연습법·참고 선수를 알려드립니다.',
    en: 'Upload your swing video and select your club — the AI coach will score, analyze, suggest drills, and recommend players to study.',
  },

  // AuthGate
  'auth.loading': { ko: '불러오는 중...', en: 'Loading...' },
  'auth.login': { ko: '로그인', en: 'Log in' },
  'auth.signup': { ko: '회원가입', en: 'Sign up' },
  'auth.email': { ko: '이메일', en: 'Email' },
  'auth.password': { ko: '비밀번호', en: 'Password' },
  'auth.passwordPlaceholder': { ko: '8자 이상', en: '8+ characters' },
  'auth.processing': { ko: '처리 중...', en: 'Processing...' },
  'auth.requestFailed': { ko: '요청에 실패했습니다.', en: 'Request failed.' },
  'auth.noAccount': { ko: '계정이 없으신가요? ', en: "Don't have an account? " },
  'auth.hasAccount': { ko: '이미 계정이 있으신가요? ', en: 'Already have an account? ' },
  'auth.logout': { ko: '로그아웃', en: 'Log out' },

  // AppShell tabs
  'tab.analyze': { ko: '🎥 스윙 분석', en: '🎥 Swing Analysis' },
  'tab.compare': { ko: '🆚 스윙 비교', en: '🆚 Swing Compare' },
  'tab.calendar': { ko: '📅 캘린더', en: '📅 Calendar' },
  'tab.dashboard': { ko: '📊 분석 대시보드', en: '📊 Dashboard' },

  // ClubSelector
  'club.selectPrompt': { ko: '사용한 골프채를 선택하세요', en: 'Select the club you used' },
  'club.driver': { ko: '드라이버', en: 'Driver' },
  'club.wood': { ko: '우드', en: 'Wood' },
  'club.utility': { ko: '유틸리티', en: 'Utility' },
  'club.iron': { ko: '아이언', en: 'Iron' },
  'club.wedge': { ko: '웻지', en: 'Wedge' },
  'club.woodNumber': { ko: '우드 번호', en: 'Wood number' },
  'club.utilityNumber': { ko: '유틸리티 번호', en: 'Utility number' },
  'club.ironNumber': { ko: '아이언 번호', en: 'Iron number' },
  'club.wedgeLoft': { ko: '웻지 로프트 각도', en: 'Wedge loft angle' },
  'club.numberSuffix': { ko: '번', en: '' },

  // SwingAnalyzer
  'analyzer.upload': { ko: '스윙 영상 업로드', en: 'Upload Swing Video' },
  'analyzer.trimSection': { ko: '분석 구간 자르기', en: 'Trim Analysis Range' },
  'analyzer.trimReset': { ko: '전체 구간으로 되돌리기', en: 'Reset to full range' },
  'analyzer.trimDescription': {
    ko: '스윙 동작이 들어있는 구간만 잘라서 분석하면 더 정확한 결과를 얻을 수 있어요. 슬라이더를 옮기면 영상이 해당 지점으로 이동합니다.',
    en: 'Trim to just the swing motion for more accurate results. Moving the slider will seek the video to that point.',
  },
  'analyzer.trimTip': {
    ko: '💡 특정 영상에서 스윙 구간(어드레스·백스윙 탑·임팩트 등) 인식이 계속 부정확하다면, 스윙 전체 동작이 잘 보이는 구간만 잘라서 분석해보세요 — 불필요한 준비/정지 구간이 줄어들어 AI가 각 단계를 더 정확하게 찾아낼 수 있어요.',
    en: "💡 If the AI keeps misidentifying swing phases (address, top of backswing, impact, etc.), try trimming to just the full swing motion — removing unnecessary setup/idle footage helps the AI detect each phase more accurately.",
  },
  'analyzer.trimStart': { ko: '시작 지점', en: 'Start' },
  'analyzer.trimEnd': { ko: '끝 지점', en: 'End' },
  'analyzer.trimLength': { ko: '선택한 구간 길이:', en: 'Selected range:' },
  'analyzer.trimTotal': { ko: '전체', en: 'Total' },
  'analyzer.selectAI': { ko: '분석 AI 선택', en: 'Select Analysis AI' },
  'analyzer.selectGeminiModel': { ko: 'Gemini 모델 선택', en: 'Select Gemini Model' },
  'analyzer.analyzeButton': { ko: '⛳ 스윙 분석하기', en: '⛳ Analyze Swing' },
  'analyzer.extracting': { ko: '영상에서 프레임 추출 중...', en: 'Extracting frames...' },
  'analyzer.detecting': { ko: '스윙 구간(어드레스·백스윙 탑·임팩트·피니쉬) 탐지 중...', en: 'Detecting swing phases...' },
  'analyzer.analyzing': { ko: 'AI가 스윙을 분석하는 중...', en: 'AI is analyzing your swing...' },
  'analyzer.savedToCalendar': {
    ko: '✅ 분석 결과가 오늘 날짜의 캘린더에 저장되었습니다 — 상단 "캘린더" 탭에서 확인하세요.',
    en: '✅ Analysis saved to today\'s calendar — check the "Calendar" tab above.',
  },
  'analyzer.saveError': { ko: '분석 결과를 캘린더에 저장하지 못했습니다.', en: 'Failed to save the analysis to the calendar.' },
  'analyzer.unknownError': { ko: '알 수 없는 오류가 발생했습니다.', en: 'An unknown error occurred.' },

  // Step indicators
  'step.extracting': { ko: '프레임 추출', en: 'Extract Frames' },
  'step.detecting': { ko: '스윙 구간 탐지', en: 'Detect Phases' },
  'step.analyzing': { ko: 'AI 스윙 분석', en: 'AI Analysis' },
  'step.aiAnalysis': { ko: 'AI 분석', en: 'AI Analysis' },

  // AnalysisResult
  'result.overallScore': { ko: '스윙 종합 점수', en: 'Overall Swing Score' },
  'result.myAvg': { ko: '나의 평균', en: 'My average' },
  'result.globalAvg': { ko: '전체 유저 평균', en: 'All users avg' },
  'result.regionAvg': { ko: '평균', en: 'avg' },
  'result.regionDefault': { ko: '우리 지역', en: 'My region' },
  'result.similarTo': { ko: '와 비슷해요', en: ' — similar' },
  'result.higherBy': { ko: '높아요', en: 'higher' },
  'result.lowerBy': { ko: '낮아요', en: 'lower' },
  'result.comparedToAvg': { ko: '보다', en: ' by' },
  'result.pointsSuffix': { ko: '점', en: 'pts' },
  'result.framesTitle': { ko: '분석에 사용된 프레임', en: 'Frames Used for Analysis' },
  'result.framesDescription': {
    ko: 'AI가 고른 구간이 실제 스윙 단계와 맞는지 평가해 주세요. 평가 결과는 다음 분석의 정확도를 높이는 데 활용됩니다.',
    en: "Rate whether the AI-selected frames match the actual swing phases. Your feedback helps improve future accuracy.",
  },
  'result.stageScores': { ko: '단계별 스윙 점수', en: 'Stage-by-Stage Scores' },
  'result.swingAnalysis': { ko: '스윙 분석', en: 'Swing Analysis' },
  'result.practiceTips': { ko: '추천 연습 방법', en: 'Recommended Drills' },
  'result.recommendedPlayers': { ko: '참고하면 좋은 선수', en: 'Players to Study' },
  'result.watchYoutube': { ko: 'YouTube에서 스윙 영상 보기', en: 'Watch swing videos on YouTube' },
  'result.feedbackAccurate': { ko: '👍 정확해요', en: '👍 Accurate' },
  'result.feedbackInaccurate': { ko: '👎 부정확해요', en: '👎 Inaccurate' },
  'result.ratedAccurate': { ko: '✓ 정확해요로 평가했어요', en: '✓ Rated as accurate' },
  'result.ratedInaccurate': { ko: '✗ 부정확해요로 평가했어요 — 다음 분석에 반영할게요', en: '✗ Rated as inaccurate — will improve next analysis' },

  // Swing grades
  'grade.tourPro': { ko: '투어 프로급', en: 'Tour Pro Level' },
  'grade.tourProDesc': { ko: '프로 선수에 견줄 만큼 안정적이고 정교한 스윙이에요.', en: 'A stable and precise swing comparable to a tour pro.' },
  'grade.advanced': { ko: '상급자', en: 'Advanced' },
  'grade.advancedDesc': { ko: '기본기가 탄탄하고 군더더기 없는 스윙을 갖췄어요.', en: 'Strong fundamentals with a clean, efficient swing.' },
  'grade.upperIntermediate': { ko: '중상급자', en: 'Upper Intermediate' },
  'grade.upperIntermediateDesc': { ko: '전반적으로 안정적이라 디테일만 다듬으면 한 단계 올라갈 수 있어요.', en: 'Overall stable — refining details will take you to the next level.' },
  'grade.intermediate': { ko: '중급자', en: 'Intermediate' },
  'grade.intermediateDesc': { ko: '기본 동작은 자리 잡았고, 일관성을 더 키우면 좋아요.', en: 'Fundamentals are solid; building consistency will help.' },
  'grade.lowerIntermediate': { ko: '초중급자', en: 'Lower Intermediate' },
  'grade.lowerIntermediateDesc': { ko: '기본기를 다지는 단계로, 핵심 동작 위주의 반복 연습이 도움이 돼요.', en: 'Building basics — focused repetition of key movements will help.' },
  'grade.beginner': { ko: '입문자', en: 'Beginner' },
  'grade.beginnerDesc': { ko: '기본 자세와 그립부터 차근차근 익혀나가는 단계예요.', en: 'Learning the basics: grip, stance, and posture step by step.' },

  // SwingCompare
  'compare.uploadPrompt': { ko: '두 스윙 영상을 업로드해서 비교하세요', en: 'Upload two swing videos to compare' },
  'compare.videoA': { ko: '영상 A', en: 'Video A' },
  'compare.videoB': { ko: '영상 B', en: 'Video B' },
  'compare.trimRange': { ko: '재생 구간', en: 'Playback Range' },
  'compare.fullRange': { ko: '전체 구간', en: 'Full range' },
  'compare.start': { ko: '시작', en: 'Start' },
  'compare.end': { ko: '끝', en: 'End' },
  'compare.selectedRange': { ko: '선택 구간:', en: 'Selected:' },
  'compare.total': { ko: '전체', en: 'Total' },
  'compare.pause': { ko: '⏸ 정지', en: '⏸ Pause' },
  'compare.syncPlay': { ko: '▶ 동시 재생', en: '▶ Sync Play' },
  'compare.capture': { ko: '📸 캡쳐', en: '📸 Capture' },
  'compare.aiCompare': { ko: '🤖 AI 비교 분석', en: '🤖 AI Compare' },
  'compare.aiComparing': { ko: '분석 중...', en: 'Analyzing...' },
  'compare.speed': { ko: '배속', en: 'Speed' },
  'compare.analysisAI': { ko: '분석 AI:', en: 'Analysis AI:' },
  'compare.captureResult': { ko: '캡쳐 결과', en: 'Capture Result' },
  'compare.download': { ko: '다운로드', en: 'Download' },
  'compare.close': { ko: '닫기', en: 'Close' },
  'compare.stageScores': { ko: '단계별 비교 점수', en: 'Stage-by-Stage Comparison' },
  'compare.strengthsA': { ko: '영상 A의 강점', en: 'Video A Strengths' },
  'compare.strengthsB': { ko: '영상 B의 강점', en: 'Video B Strengths' },
  'compare.commonIssues': { ko: '공통 개선점', en: 'Common Issues' },
  'compare.recommendation': { ko: '종합 조언', en: 'Overall Advice' },
  'compare.emptyHint': {
    ko: '두 개의 스윙 영상을 올리면 나란히 재생하며 비교할 수 있고, AI가 두 스윙의 차이를 분석해 줍니다.',
    en: 'Upload two swing videos to play them side by side, and let the AI analyze the differences.',
  },
  'compare.analysisFailed': { ko: '비교 분석 요청이 실패했습니다.', en: 'Comparison analysis request failed.' },

  // HistoryCalendar
  'calendar.loading': { ko: '분석 기록을 불러오는 중...', en: 'Loading analysis history...' },
  'calendar.loadError': { ko: '분석 기록을 불러오지 못했습니다.', en: 'Failed to load analysis history.' },
  'calendar.retry': { ko: '다시 시도', en: 'Retry' },
  'calendar.deleteConfirm': { ko: '이 분석 기록을 삭제할까요?', en: 'Delete this analysis record?' },
  'calendar.deleteError': { ko: '기록을 삭제하지 못했습니다.', en: 'Failed to delete the record.' },
  'calendar.delete': { ko: '삭제', en: 'Delete' },
  'calendar.swingAnalysis': { ko: '스윙 분석', en: 'Swing Analysis' },
  'calendar.records': { ko: '분석 기록', en: 'Analysis Records' },
  'calendar.recordCount': { ko: '건', en: '' },
  'calendar.noRecords': {
    ko: '이 날짜에는 저장된 스윙 분석 기록이 없습니다.',
    en: 'No swing analysis records for this date.',
  },
  'calendar.selectDateHint': {
    ko: '날짜를 선택하면 해당 날짜의 스윙 분석 기록을 볼 수 있습니다. (점이 표시된 날짜에 기록이 있어요)',
    en: 'Select a date to view swing analysis records. (Dates with a dot have records.)',
  },
  'calendar.yearMonth': { ko: '{year}년 {month}월', en: '{month}/{year}' },

  // Weekdays
  'weekday.sun': { ko: '일', en: 'Sun' },
  'weekday.mon': { ko: '월', en: 'Mon' },
  'weekday.tue': { ko: '화', en: 'Tue' },
  'weekday.wed': { ko: '수', en: 'Wed' },
  'weekday.thu': { ko: '목', en: 'Thu' },
  'weekday.fri': { ko: '금', en: 'Fri' },
  'weekday.sat': { ko: '토', en: 'Sat' },

  // AdminDashboard
  'admin.loading': { ko: '대시보드를 불러오는 중...', en: 'Loading dashboard...' },
  'admin.loadError': { ko: '대시보드를 불러오지 못했습니다.', en: 'Failed to load dashboard.' },
  'admin.users': { ko: '가입자 수', en: 'Users' },
  'admin.totalAnalyses': { ko: '총 분석 수', en: 'Total Analyses' },
  'admin.avgScore': { ko: '전체 평균 점수', en: 'Average Score' },
  'admin.clubBreakdown': { ko: '클럽별 분석 비율', en: 'Club Breakdown' },
  'admin.noAnalyses': { ko: '아직 분석 기록이 없습니다.', en: 'No analyses yet.' },
  'admin.regionScores': { ko: '지역별 평균 점수', en: 'Regional Average Scores' },
  'admin.noRegionData': { ko: '위치 정보가 포함된 분석 기록이 없습니다.', en: 'No analyses with location data.' },
  'admin.phaseFeedback': { ko: '프레임 선택 정확도 피드백', en: 'Frame Selection Accuracy Feedback' },
  'admin.noFeedback': { ko: '아직 수집된 피드백이 없습니다.', en: 'No feedback collected yet.' },
  'admin.countSuffix': { ko: '건', en: '' },
  'admin.userCountSuffix': { ko: '명', en: '' },
  'admin.scoreSuffix': { ko: '점', en: 'pts' },

  // SwingLoaderAnimation
  'loader.swing': { ko: '스윙', en: 'Swing' },
  'loader.putt': { ko: '퍼팅', en: 'Putt' },
  'loader.drive': { ko: '드라이버 샷', en: 'Driver Shot' },
  'loader.changeAnim': { ko: '애니메이션 변경', en: 'Change animation' },
  'loader.close': { ko: '닫기', en: 'Close' },

  // AI provider descriptions
  'ai.claudeDesc': { ko: 'Anthropic Claude로 분석합니다', en: 'Analyze with Anthropic Claude' },
  'ai.geminiDesc': { ko: 'Google Gemini로 분석합니다', en: 'Analyze with Google Gemini' },
  'ai.geminiFlashDesc': { ko: '속도와 품질의 균형이 좋은 기본 모델', en: 'Balanced speed and quality' },
  'ai.geminiFlashLiteDesc': { ko: '가장 가볍고 빠른 모델', en: 'Lightest and fastest model' },

  // Inline strings that were previously hardcoded
  'analyzer.requestFailed': { ko: '분석 요청이 실패했습니다', en: 'Analysis request failed' },
  'compare.aiComparisonLabel': { ko: 'AI 비교 분석', en: 'AI Comparison' },
  'unit.count': { ko: '건', en: '' },
  'unit.people': { ko: '명', en: '' },
  'unit.score': { ko: '점', en: 'pts' },
  'score.similarTo': {
    ko: '({avg}점)와 비슷해요',
    en: '({avg}pts) — similar',
  },
  'score.higherThan': {
    ko: '({avg}점)보다 {diff}점 높아요',
    en: '({avg}pts) by {diff}pts higher',
  },
  'score.lowerThan': {
    ko: '({avg}점)보다 {diff}점 낮아요',
    en: '({avg}pts) by {diff}pts lower',
  },

  // KakaoTalk sharing
  'share.kakao': { ko: '카카오톡 공유', en: 'Share on KakaoTalk' },
  'share.kakaoNotReady': {
    ko: '카카오톡 공유가 준비되지 않았습니다. 클립보드에 복사합니다.',
    en: 'KakaoTalk sharing not ready. Copying to clipboard instead.',
  },
  'share.copied': { ko: '📋 클립보드에 복사되었습니다!', en: '📋 Copied to clipboard!' },
  'share.copyFailed': { ko: '공유 정보를 복사하지 못했습니다.', en: 'Failed to copy share info.' },
  'share.kakaoTitle': { ko: '⛳ Carry Coach 스윙 분석 결과', en: '⛳ Carry Coach Swing Analysis' },
  'share.kakaoScoreLabel': { ko: '종합 점수', en: 'Overall Score' },
  'share.kakaoViewResult': { ko: '분석 결과 보기', en: 'View Analysis' },
} as const

export type TranslationKey = keyof typeof translations

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKey) => string
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'ko',
  setLocale: () => {},
  t: (key) => translations[key]?.ko ?? key,
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('ko')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null
    if (saved === 'ko' || saved === 'en') setLocaleState(saved)
  }, [])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    localStorage.setItem(STORAGE_KEY, next)
  }, [])

  const t = useCallback(
    (key: TranslationKey) => translations[key]?.[locale] ?? key,
    [locale],
  )

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
