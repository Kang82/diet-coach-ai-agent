// 초대 코드로 개인 토큰 받기 (tasks.md T24, 스펙 11.4-1, 사용자 결정 2026-11-10).
// 공용 초대 코드(코드당 사용 상한)를 가진 사람이 처음 들어올 때 직접 토큰을 받는다.
// 상한(리뷰 반영 T24-6): 전체 하루 시도 → IP(IPv6는 /64) 하루 시도 → 코드 하루 사용 → 코드 전체 사용.
// 라우트는 server/register-routes.ts, 코드 만들기는 scripts/issue-invite.mjs.
import { hashToken } from './guard.ts';

/**
 * 토큰 없이 부르는 유일한 API라 시도마다 D1에 쓴다. 주소를 바꿔 가며 불러도 D1 쓰기 한도를 다 쓰지 못하게
 * 전체 하루(UTC) 시도 수를 먼저 막는다 (docs/plan-upgrade.md)
 */
export const REGISTER_DAILY_ATTEMPTS_TOTAL = 200;

/** IP 묶음(IPv4 주소 하나, IPv6 /64) 하나가 하루에 할 수 있는 발급 시도 수. 성공·실패를 모두 센다. 모바일망은 IP를 여럿이 함께 써서 넉넉히 둔다 */
export const REGISTER_DAILY_ATTEMPTS_PER_IP = 10;

/** 코드 하나가 하루에 쓰일 수 있는 수. IP를 바꿔 가며 한 사람이 하루에 코드를 다 쓰지 못하게 한다 */
export const INVITE_DAILY_USES_PER_CODE = 10;

/** 전체 시도 key (registerIpKey의 16자 hex와 겹치지 않는다) */
export const REGISTER_TOTAL_KEY = 'register:all';

/** 발급 요청 본문 상한 (코드 하나라 작다) */
export const REGISTER_BODY_MAX_BYTES = 1024;

/** Crockford base32 (I·L·O·U 없음). 손으로 칠 때 헷갈리는 글자를 뺐다 */
export const INVITE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const INVITE_CODE_LENGTH = 12;

/** 입력한 코드를 비교할 모양으로: 공백·하이픈을 빼고 대문자로. 글자 수나 문자가 맞지 않으면 null */
export function normalizeInviteCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  if (code.length !== INVITE_CODE_LENGTH) return null;
  for (const ch of code) if (!INVITE_ALPHABET.includes(ch)) return null;
  return code;
}

/** 보여 줄 모양 XXXX-XXXX-XXXX */
export function formatInviteCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

/** 새 토큰(256비트 base64url)과 사용자 ID(64비트 hex). scripts/issue-token.mjs와 같은 형식 */
export function newCredentials(random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> = (b) => crypto.getRandomValues(b)) {
  const token = base64url(random(new Uint8Array(32)));
  const userId = Array.from(random(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  return { token, userId };
}

/**
 * 시도 수를 셀 IP 묶음. IPv6는 보통 /64를 통째로 받아 주소를 마음대로 바꿀 수 있어 앞 4그룹으로 묶는다.
 * IPv4는 그대로. 모양이 이상한 값은 그대로 쓴다(Cloudflare가 붙이는 헤더라 드물다)
 */
export function ipBucket(ip: string): string {
  const value = ip.trim().toLowerCase();
  if (!value.includes(':')) return value;
  const halves = value.split('::');
  if (halves.length > 2) return value;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  // 끝에 IPv4가 붙은 모양(::ffff:1.2.3.4)은 두 그룹으로 센다
  const groupCount = (parts: string[]) => parts.reduce((n, p) => n + (p.includes('.') ? 2 : 1), 0);
  const missing = 8 - groupCount(head) - groupCount(tail);
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return value;
  const groups = [...head, ...Array<string>(missing).fill('0'), ...tail];
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

/** usage_daily의 IP 시도 key. IP 원문을 남기지 않게 날짜와 함께 해시하고 앞 16자만 쓴다 */
export async function registerIpKey(ip: string, day: string): Promise<string> {
  return `register:${(await hashToken(`${day}|${ipBucket(ip)}`)).slice(0, 16)}`;
}

/** usage_daily의 코드 하루 사용 key (코드 해시 앞 16자) */
export function inviteDailyKey(codeHash: string): string {
  return `invite:${codeHash.slice(0, 16)}`;
}

/** 요청 본문(JSON)의 code를 정규화해 돌려준다. 모양이 맞지 않으면 null */
export function parseRegisterBody(raw: string): string | null {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) return null;
  const code = (body as { code?: unknown }).code;
  return typeof code === 'string' ? normalizeInviteCode(code) : null;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
