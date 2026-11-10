import { defineConfig } from 'vitest/config';

// 단위 테스트 전용 설정. vite.config.ts의 Cloudflare 플러그인을 불러오지 않도록 따로 둔다.
// LLM 평가 세트는 나중에 vitest.evals.config.ts로 분리한다 (Flue evals 가이드).
export default defineConfig({
  test: {
    // scripts/metrics-core.mjs 같은 운영 스크립트의 순수 함수도 여기서 테스트한다 (T26)
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
