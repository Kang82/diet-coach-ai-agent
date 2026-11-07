-- tasks.md T10-4 (B13): 진행 중인 비싼 요청(분류, 식단표 만들기, 칸 수정)의 Neuron 예약.
-- 안전선은 지난 24시간 합계만 보면 동시에 시작한 요청이 끝난 뒤에야 세져 넘칠 수 있다. 시작할 때 최악의 양을 예약하고,
-- 도구가 끝나면 지운다. 못 지워도 expires_at(ISO, UTC)이 지나면 합계에서 빠진다.
-- key는 대화 ID다. Flue가 대화 하나의 제출을 차례로 처리하므로 대화당 예약 하나면 된다.
CREATE TABLE usage_reservations (
  key TEXT PRIMARY KEY,
  neurons REAL NOT NULL,
  expires_at TEXT NOT NULL
);
