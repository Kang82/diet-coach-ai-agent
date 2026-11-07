-- tasks.md T7-5: Worker 전체 Neuron 안전선을 최근 24시간 합계로 센다.
-- Workers AI 무료 한도가 00:00 UTC 초기화가 아니라 최근 24시간 합계처럼 동작했다 (docs/experiments/2026-11-07-t1-7-eval-personas.md).
-- hour는 UTC 'YYYY-MM-DDTHH'. 사용자 메시지 수는 usage_daily(calls)에 날짜 기준 그대로 둔다.
-- usage_daily의 neurons 열은 더 쓰지 않는다.
CREATE TABLE usage_hourly (
  hour TEXT PRIMARY KEY,
  neurons REAL NOT NULL DEFAULT 0
);

-- 지금까지 날짜별로 센 양을 그날 00시 칸으로 옮긴다. 시각을 모르므로 가장 이른 칸에 두어
-- 배포 직후 카운터가 0에서 시작하지 않게 한다(그날 양은 다음 날 00시 UTC까지 창 안에 남는다).
INSERT INTO usage_hourly (hour, neurons)
SELECT day || 'T00', neurons FROM usage_daily WHERE key = 'all' AND neurons > 0;
