import { defineConfig } from 'vitest/config';

// 단위 테스트 전용 설정. vite.config.ts의 Cloudflare 플러그인을 불러오지 않도록 따로 둔다.
// LLM 평가 세트는 나중에 vitest.evals.config.ts로 분리한다 (Flue evals 가이드).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
