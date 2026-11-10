-- tasks.md T25 (Task2 R2): 식단표 칸 "먹었어요" 체크. 칸 위치(요일·끼니)와 시각만 두고 메뉴 이름은 두지 않는다.
-- 식단표는 대화(Durable Object)에 있어 대화 ID로 묶는다. 체크 해제는 행을 지운다. "내 기록 모두 지우기"가 user_id로 지운다.
-- 넣을 때 conversations에 그 사용자의 식단표 대화(plan_at 있음)인지 함께 확인한다.
CREATE TABLE plan_checks (
  conversation_id TEXT NOT NULL,
  day TEXT NOT NULL,
  meal TEXT NOT NULL,
  user_id TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, day, meal)
);
CREATE INDEX plan_checks_user ON plan_checks (user_id);
