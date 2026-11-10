// 스펙 7장: 의료 조언 아님 안내, 약 복용 중이면 상담 권고 추가
import { describe, expect, it } from 'vitest';
import { AVOID_CHECK_NOTICE, buildPlanNotices, MEDICAL_DISCLAIMER, MEDICATION_ADVICE } from './plan-notices.ts';

describe('buildPlanNotices', () => {
  it('약 복용이 없으면 의료 조언 아님 안내 1줄', () => {
    expect(buildPlanNotices({ medication: 'none' })).toEqual([MEDICAL_DISCLAIMER]);
  });

  it.each(['glucose', 'cholesterol', 'other'] as const)('약 복용(%s)이면 상담 권고를 더한다', (medication) => {
    expect(buildPlanNotices({ medication })).toEqual([MEDICAL_DISCLAIMER, MEDICATION_ADVICE]);
  });
});

// tasks.md T13-4: 외식 칸 태그는 빠질 수 있어 피할 음식이 있으면 직접 확인하라고 알린다
describe('피할 음식이 있을 때 안내 (T13-4)', () => {
  it('피할 음식이 없거나 모르면 안내 없음', () => {
    expect(buildPlanNotices({ medication: 'none', avoid: [] })).toEqual([MEDICAL_DISCLAIMER]);
    expect(buildPlanNotices({ medication: 'none' })).toEqual([MEDICAL_DISCLAIMER]);
  });

  it('있으면 다른 안내 뒤, 의료 안내 앞에 넣는다', () => {
    expect(
      buildPlanNotices(
        { medication: 'glucose', avoid: ['egg'] },
        { chosen: '2026-11-09', weekStart: '2026-11-16', hasEvents: false },
        3,
      ),
    ).toEqual([
      '고른 주(11/9~)가 이미 시작돼 다음 주(11/16~)로 만들었어요.',
      '외식 메뉴가 적어 같은 메뉴를 1주일에 3번까지 넣었어요.',
      AVOID_CHECK_NOTICE,
      MEDICAL_DISCLAIMER,
      MEDICATION_ADVICE,
    ]);
  });
});

// tasks.md T10-5: 고른 주가 이미 시작해 planWeekStart가 다음 주로 민 경우
describe('주가 밀렸을 때 안내 (T10-5)', () => {
  it('고른 시작일과 만든 시작일이 같거나 고른 값이 없으면 안내 없음', () => {
    expect(buildPlanNotices({ medication: 'none' }, { chosen: '2026-11-09', weekStart: '2026-11-09', hasEvents: true })).toEqual([
      MEDICAL_DISCLAIMER,
    ]);
    expect(buildPlanNotices({ medication: 'none' }, { chosen: undefined, weekStart: '2026-11-16', hasEvents: true })).toEqual([
      MEDICAL_DISCLAIMER,
    ]);
  });

  it('밀렸으면 맨 앞에 두 날짜를 알린다', () => {
    expect(buildPlanNotices({ medication: 'none' }, { chosen: '2026-11-09', weekStart: '2026-11-16', hasEvents: false })).toEqual([
      '고른 주(11/9~)가 이미 시작돼 다음 주(11/16~)로 만들었어요.',
      MEDICAL_DISCLAIMER,
    ]);
  });

  it('일정이 있으면 같은 요일·끼니에 넣었다고 덧붙인다', () => {
    expect(buildPlanNotices({ medication: 'glucose' }, { chosen: '2026-12-28', weekStart: '2027-01-04', hasEvents: true })).toEqual([
      '고른 주(12/28~)가 이미 시작돼 다음 주(1/4~)로 만들었어요. 일정은 같은 요일·끼니에 넣었어요.',
      MEDICAL_DISCLAIMER,
      MEDICATION_ADVICE,
    ]);
  });
});

// B15 T11-2: 외식 메뉴가 적어 같은 메뉴 허용 횟수를 늘렸으면 알린다
describe('같은 메뉴 허용 횟수 안내', () => {
  it('기본(2번)이면 안내 없음', () => {
    expect(buildPlanNotices({ medication: 'none' }, undefined, 2)).toEqual([MEDICAL_DISCLAIMER]);
  });

  it('늘렸으면 주 밀림 안내 다음, 의료 안내 앞에 알린다', () => {
    expect(buildPlanNotices({ medication: 'none' }, { chosen: '2026-11-09', weekStart: '2026-11-16', hasEvents: false }, 3)).toEqual([
      '고른 주(11/9~)가 이미 시작돼 다음 주(11/16~)로 만들었어요.',
      '외식 메뉴가 적어 같은 메뉴를 1주일에 3번까지 넣었어요.',
      MEDICAL_DISCLAIMER,
    ]);
  });
});
