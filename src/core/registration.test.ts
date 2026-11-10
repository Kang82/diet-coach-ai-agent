import { describe, expect, it } from 'vitest';
import {
  formatInviteCode,
  INVITE_CODE_LENGTH,
  inviteDailyKey,
  ipBucket,
  newCredentials,
  REGISTER_TOTAL_KEY,
  normalizeInviteCode,
  parseRegisterBody,
  registerIpKey,
} from './registration.ts';

describe('normalizeInviteCode', () => {
  it('공백·하이픈을 빼고 대문자로 맞춘다', () => {
    expect(normalizeInviteCode(' abcd-efgh-jk12 ')).toBe('ABCDEFGHJK12');
    expect(normalizeInviteCode('ABCD EFGH JK12')).toBe('ABCDEFGHJK12');
  });

  it('글자 수가 다르거나 쓰지 않는 문자(I·L·O·U, 기호)면 null', () => {
    expect(normalizeInviteCode('ABCDEFGHJK1')).toBeNull();
    expect(normalizeInviteCode('ABCDEFGHJK123')).toBeNull();
    expect(normalizeInviteCode('ABCDEFGHJKI2')).toBeNull();
    expect(normalizeInviteCode('ABCDEFGHJKO2')).toBeNull();
    expect(normalizeInviteCode('ABCDEFGHJK!2')).toBeNull();
    expect(normalizeInviteCode('')).toBeNull();
  });
});

it('formatInviteCode는 4자씩 하이픈으로 나눈다', () => {
  expect(formatInviteCode('ABCDEFGHJK12')).toBe('ABCD-EFGH-JK12');
  expect(normalizeInviteCode(formatInviteCode('ABCDEFGHJK12'))).toBe('ABCDEFGHJK12');
  expect(INVITE_CODE_LENGTH).toBe(12);
});

describe('newCredentials', () => {
  it('토큰은 43자 base64url, 사용자 ID는 16자 hex', () => {
    const { token, userId } = newCredentials();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(userId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('매번 다르다', () => {
    const a = newCredentials();
    const b = newCredentials();
    expect(a.token).not.toBe(b.token);
    expect(a.userId).not.toBe(b.userId);
  });

  it('난수 그대로 인코딩한다', () => {
    const { token, userId } = newCredentials((b) => b.fill(255));
    expect(token).toBe('_'.repeat(42) + '8');
    expect(userId).toBe('f'.repeat(16));
  });
});

describe('ipBucket', () => {
  it('IPv4는 그대로', () => {
    expect(ipBucket('203.0.113.7')).toBe('203.0.113.7');
  });

  it('IPv6는 앞 4그룹(/64)으로 묶는다: 같은 /64의 다른 주소는 같은 묶음', () => {
    const a = ipBucket('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
    expect(a).toBe('2001:db8:1:2::/64');
    expect(ipBucket('2001:0db8:0001:0002::1')).toBe(a);
    expect(ipBucket('2001:DB8:1:2:ffff::')).toBe(a);
    expect(ipBucket('2001:db8:1:3::1')).not.toBe(a);
  });

  it('생략(::)이 앞쪽에 있어도 펼쳐서 묶는다', () => {
    expect(ipBucket('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(ipBucket('::1')).toBe('0:0:0:0::/64');
    expect(ipBucket('::ffff:203.0.113.7')).toBe('0:0:0:0::/64');
  });

  it('모양이 이상하면 그대로', () => {
    expect(ipBucket('1:2:3')).toBe('1:2:3');
    expect(ipBucket('1::2::3')).toBe('1::2::3');
    expect(ipBucket('local')).toBe('local');
  });
});

it('inviteDailyKey는 코드 해시 앞 16자, 전체 key와 겹치지 않는다', () => {
  expect(inviteDailyKey('a'.repeat(64))).toBe(`invite:${'a'.repeat(16)}`);
  expect(REGISTER_TOTAL_KEY).toBe('register:all');
});

describe('registerIpKey', () => {
  it('같은 IPv6 /64면 같은 key', async () => {
    expect(await registerIpKey('2001:db8:1:2::1', '2026-11-10')).toBe(await registerIpKey('2001:db8:1:2::ff', '2026-11-10'));
  });

  it('IP 원문을 담지 않고, 날짜와 IP마다 다르며, 같은 입력이면 같다', async () => {
    const key = await registerIpKey('203.0.113.7', '2026-11-10');
    expect(key).toMatch(/^register:[0-9a-f]{16}$/);
    expect(key).not.toContain('203');
    expect(await registerIpKey('203.0.113.7', '2026-11-10')).toBe(key);
    expect(await registerIpKey('203.0.113.7', '2026-11-11')).not.toBe(key);
    expect(await registerIpKey('203.0.113.8', '2026-11-10')).not.toBe(key);
  });
});

describe('parseRegisterBody', () => {
  it('code를 정규화해 돌려준다', () => {
    expect(parseRegisterBody('{"code":"abcd-efgh-jk12"}')).toBe('ABCDEFGHJK12');
  });

  it('JSON이 아니거나 code가 없거나 문자열이 아니거나 모양이 틀리면 null', () => {
    expect(parseRegisterBody('abc')).toBeNull();
    expect(parseRegisterBody('null')).toBeNull();
    expect(parseRegisterBody('{}')).toBeNull();
    expect(parseRegisterBody('{"code":123}')).toBeNull();
    expect(parseRegisterBody('{"code":"short"}')).toBeNull();
  });
});
