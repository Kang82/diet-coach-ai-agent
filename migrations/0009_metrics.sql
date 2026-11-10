-- tasks.md T26 (Task2 R4): 효과 측정 기록. 기획서 5장 성공 기준을 잴 숫자만 둔다(메뉴·건강 정보 없음).
-- plan_cells: 식단표 칸 수(일정 칸 제외), 만들기 성공 때 정함
-- plan_edits: 칸 다시 추천 성공 수, 만들기 성공 때 0, 칸 수정 성공마다 +1
-- profile_edits: 프로필 확인 화면에서 "고치기"로 다시 연 항목 수, 인터뷰 제출이 끝날 때 정함
-- 체크 수는 plan_checks(0008)에서 센다. 이 열 전에 만든 식단표는 NULL이라 집계(scripts/metrics.mjs)에서 빠진다.
ALTER TABLE conversations ADD COLUMN plan_cells INTEGER;
ALTER TABLE conversations ADD COLUMN plan_edits INTEGER;
ALTER TABLE conversations ADD COLUMN profile_edits INTEGER;
