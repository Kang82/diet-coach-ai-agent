-- 스펙 5장 저장소 (T6-1). 조회에 쓰는 값만 열로 두고 프로필·식단표 본문은 JSON(data)으로 둔다.
CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 가장 나중에 저장한 식단표는 seq가 가장 큰 행이다 (createdAt이 같아도 저장 순서로 가린다).
CREATE TABLE plans (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX plans_user_seq ON plans (user_id, seq);
