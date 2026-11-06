import { defineConfig } from 'vitest/config';

// 스펙 8.5 평가 세트 전용 설정. 실제 모델(Workers AI)을 개발 서버를 거쳐 부르므로 npm test와 분리한다.
// 무료 한도를 아끼려고 파일과 케이스를 하나씩 순서대로 돌린다.
export default defineConfig({
  test: {
    include: ['src/evals/**/*.eval.ts'],
    testTimeout: 10 * 60_000, // 1회 약 4분 (스펙 11.5)
    hookTimeout: 30_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
