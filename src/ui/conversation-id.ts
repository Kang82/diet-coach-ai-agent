// 대화 ID. crypto.randomUUID()는 보안 출처(https, localhost)에서만 있다.
// 개발 중 휴대폰으로 PC의 사설 주소(http://192.168.x.x)를 열면 없으므로, 어디서나 있는 getRandomValues로 UUID v4를 만든다.
export function newConversationId(c: Crypto = crypto): string {
  if (typeof c.randomUUID === 'function') return c.randomUUID();

  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; // 버전 4
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 변형
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
