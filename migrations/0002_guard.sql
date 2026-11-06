-- 스펙 11.4 한도 보호 (T7-1 ~ T7-3).
-- 사용자 토큰은 원문을 두지 않고 SHA-256 해시만 둔다. 토큰은 scripts/issue-token.mjs가 발급한다.
CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

-- 날짜(UTC)별 카운터. key는 'user:<userId>'(메시지 수) 또는 'all'(Worker 전체 Neuron 추정치).
CREATE TABLE usage_daily (
  day TEXT NOT NULL,
  key TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  neurons REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (day, key)
);
