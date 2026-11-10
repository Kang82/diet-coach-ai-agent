-- tasks.md T28 (Task2 R3): 체크 반영해 다음 주 짜기. 체크(plan_checks)는 대화 ID로만 묶여 있어,
-- 지난주 그 칸의 메뉴를 찾으려고 저장한 식단표에 대화 ID를 둔다. 이 열 전에 저장한 식단표는 NULL이라 반영되지 않는다.
ALTER TABLE plans ADD COLUMN conversation_id TEXT;
CREATE INDEX plans_user_conversation ON plans (user_id, conversation_id, seq);
