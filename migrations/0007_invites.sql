-- tasks.md T24: 초대 코드로 개인 토큰 받기. 공용 코드 하나를 여러 사람이 쓰되 max_uses까지만 쓴다.
-- 코드 원문은 두지 않고 SHA-256 해시만 둔다. 코드는 scripts/issue-invite.mjs가 만든다.
-- 폐기: UPDATE invites SET max_uses = used WHERE code_hash = '…'
CREATE TABLE invites (
  code_hash TEXT PRIMARY KEY,
  max_uses INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
