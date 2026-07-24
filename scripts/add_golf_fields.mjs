#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const filePath = path.resolve('./lib/golfCourses.ts');

// 파일 읽기
const content = fs.readFileSync(filePath, 'utf-8');

// hints 배열이 끝나는 부분 찾기
const updated = content.replace(
  /hints:\s*\[([\s\S]*?)\],(\s*})/g,
  (match, hints, closing) => {
    return `hints: [${hints}],
    features: ["좋은 시설", "친절한 서비스"],
    recommendedClubs: ["드라이버", "아이언"],
    difficulty: "중간",
    difficultyTips: ["정확한 샷이 필요합니다", "클럽 선택을 신중하게 하세요"]${closing}`;
  }
);

// 파일 쓰기
fs.writeFileSync(filePath, updated, 'utf-8');

console.log('✅ 모든 골프장에 새 필드 추가 완료!');
console.log('   - features: 골프장 특징');
console.log('   - recommendedClubs: 추천 클럽');
console.log('   - difficulty: 난이도');
console.log('   - difficultyTips: 난이도별 팁');
