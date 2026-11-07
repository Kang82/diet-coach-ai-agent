-- tasks.md T7-5: Worker 전체 Neuron 안전선을 최근 24시간 합계로 센다.
-- Workers AI 무료 한도가 00:00 UTC 초기화가 아니라 최근 24시간 합계처럼 동작했다 (docs/experiments/2026-11-07-t1-7-eval-personas.md).
-- hour는 UTC 'YYYY-MM-DDTHH'. 사용자 메시지 수는 usage_daily(calls)에 날짜 기준 그대로 둔다.
-- usage_daily의 neurons 열은 더 쓰지 않는다.
CREATE TABLE usage_hourly (
  hour TEXT PRIMARY KEY,
  neurons REAL NOT NULL DEFAULT 0
);

-- 오늘과 어제(UTC) 날짜별로 센 양을 마이그레이션을 적용한 시각의 칸으로 옮긴다. 시각을 모르므로 가장 보수적으로
-- 지금 칸에 두어 앞으로 24시간 동안 창 안에 남게 한다. 그날 00시 칸에 두면 어제 값이 곧바로 창 밖이 된다(배포 전 코드 리뷰 3번).
-- 그보다 오래된 날짜는 창 밖이라 옮기지 않는다.
INSERT INTO usage_hourly (hour, neurons)
SELECT strftime('%Y-%m-%dT%H', 'now'), SUM(neurons) FROM usage_daily
WHERE key = 'all' AND neurons > 0 AND day >= date('now', '-1 day')
HAVING SUM(neurons) > 0;
