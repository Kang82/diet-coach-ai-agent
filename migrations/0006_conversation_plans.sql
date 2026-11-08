-- tasks.md T17: 지난 식단표 목록. 식단표를 만들었거나 고친 대화에 시작 월요일과 시각을 둔다(날짜만, 건강 정보 아님).
-- 만들기·칸 수정 도구가 성공하면 표시한다. 식단표가 없는 대화는 NULL이다. 이 열 전에 만든 식단표는 표시가 없다.
ALTER TABLE conversations ADD COLUMN plan_week_start TEXT;
ALTER TABLE conversations ADD COLUMN plan_at TEXT;
CREATE INDEX conversations_user_plan ON conversations (user_id, plan_at);
