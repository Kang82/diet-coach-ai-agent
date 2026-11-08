-- tasks.md T15: 대화 기록 지우기. 대화(Durable Object)는 이름으로 나열할 수 없어, 메시지가 간 대화를 사용자별로 기록한다.
-- 한도 보호 미들웨어가 메시지 POST를 에이전트로 넘기기 직전에 넣는다(INSERT OR IGNORE). 지우면 DO를 지운 뒤 행을 뺀다.
-- 이 테이블이 생기기 전의 대화는 기록이 없다.
CREATE TABLE conversations (
  conversation_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX conversations_user ON conversations (user_id, created_at);
