// 'cloudflare:workers'에서 이 프로젝트가 쓰는 것만 적은 타입 (agents/usage-meter.ts).
// @cloudflare/workers-types를 tsconfig 전역에 넣으면 화면(DOM) 타입과 섞여서 필요한 것만 둔다.
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}
