#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const features_by_region = {
  "서울/경기": ["명문 클럽", "접근성 우수", "고급 시설", "대회 개최지", "캐디 서비스"],
  "강원": ["산악 코스", "경관 우수", "자연친화적", "시원한 기후", "숲 코스"],
  "충청": ["도시 근처", "합리적 가격", "친절한 서비스", "조용한 분위기", "넓은 페어웨이"],
  "경상": ["해안 코스", "해수욕장 근처", "바다 경관", "리조트 시설", "전문 캐디"],
  "전라": ["온화한 기후", "목장 코스", "목가적 분위기", "조용한 환경", "자연 경관"],
  "제주": ["해변 코스", "리조트 시설", "국제 수준", "경관 최고", "휴양지"],
};

const recommendedClubs = [
  ["드라이버", "3우드", "5우드"],
  ["드라이버", "유틸리티", "롱아이언"],
  ["3목", "5목", "7목"],
  ["5우드", "유틸리티", "미드아이언"],
  ["5번 아이언", "7번 아이언", "웨지"],
];

const difficultyTips = {
  "쉬움": [
    "초보자 친화적인 코스입니다. 넓은 페어웨이와 관대한 경사를 즐기세요.",
    "이 골프장은 학습에 최적의 환경입니다. 여유있게 라운드하세요.",
    "페어웨이가 넓어서 안정적인 샷을 할 수 있습니다.",
  ],
  "중간": [
    "적절한 수준의 도전이 있는 코스입니다. 집중력을 유지하세요.",
    "스트래티지가 중요한 코스입니다. 클럽 선택을 신중하게 하세요.",
    "핸디캡 8-15의 골퍼들에게 좋은 도전이 됩니다.",
    "정확한 샷이 중요합니다.",
  ],
  "어려움": [
    "챔피언십 수준의 어려운 코스입니다. 집중력과 기술이 필요합니다.",
    "좁은 페어웨이와 수많은 핸디캡이 있습니다.",
    "프로 대회가 열리는 수준의 코스입니다. 인내심을 가지세요.",
  ],
};

function getDifficulty(established) {
  if (established < 1990) return "중간";
  if (established < 2000) return "중간";
  return ["쉬움", "중간", "어려움"][Math.floor(Math.random() * 3)];
}

function getFeatures(region) {
  const baseFeatures = features_by_region[region] || ["친절한 서비스", "안정적 시설"];
  const count = Math.min(3, baseFeatures.length);
  const shuffled = [...baseFeatures].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function getRecommendedClubs() {
  return recommendedClubs[Math.floor(Math.random() * recommendedClubs.length)];
}

function getDifficultyTips(difficulty) {
  const tips = difficultyTips[difficulty];
  const shuffled = [...tips].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 2);
}

function readGolfCourses(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // TypeScript 배열 추출
  const match = content.match(/export const golfCourses: GolfCourse\[\] = \[([\s\S]*)\];/);
  if (!match) {
    throw new Error('Could not find golfCourses array');
  }

  const arrayContent = '[' + match[1] + ']';

  // 주석 제거
  let cleaned = arrayContent.replace(/\/\/.*$/gm, '');

  // province 필드를 region으로 대체 (필요시)
  cleaned = cleaned.replace(/province:/g, 'province:');

  // eval을 피하고 정규식으로 파싱
  // 각 골프장 객체를 찾기
  const coursePattern = /\{\s*id:\s*"[^"]*"[\s\S]*?\}/g;
  const matches = cleaned.match(coursePattern);

  if (!matches) {
    throw new Error('Could not parse courses');
  }

  return matches.length;
}

function generateUpdatedContent(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // 각 골프장에 새 필드 추가
  let updated = content.replace(/hints:\s*\[([\s\S]*?)\],/g, (match, hintsContent) => {
    // 힌트 배열 뒤에 새 필드 추가
    return match + `
    features: ["좋은 시설", "친절한 서비스"],
    recommendedClubs: ["드라이버", "아이언", "웨지"],
    difficulty: "중간",
    difficultyTips: ["정확한 샷이 필요합니다", "클럽 선택을 신중하게 하세요"],`;
  });

  return updated;
}

const filePath = path.join(__dirname, '../lib/golfCourses.ts');

console.log('🏌️ 골프장 데이터 업데이트 중...');
console.log('📊 현재 골프장 수:', readGolfCourses(filePath));

// 파일 생성
console.log('✅ 새로운 필드 구조:');
console.log('   - features: 골프장 특징');
console.log('   - recommendedClubs: 추천 클럽');
console.log('   - difficulty: 난이도 (쉬움/중간/어려움)');
console.log('   - difficultyTips: 난이도별 팁');
