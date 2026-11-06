// 스펙 7장: 의료 조언 아님 안내, 약 복용 중이면 상담 권고 추가
import { describe, expect, it } from 'vitest';
import { buildPlanNotices, MEDICAL_DISCLAIMER, MEDICATION_ADVICE } from './plan-notices.ts';

describe('buildPlanNotices', () => {
  it('약 복용이 없으면 의료 조언 아님 안내 1줄', () => {
    expect(buildPlanNotices({ medication: 'none' })).toEqual([MEDICAL_DISCLAIMER]);
  });

  it.each(['glucose', 'cholesterol', 'other'] as const)('약 복용(%s)이면 상담 권고를 더한다', (medication) => {
    expect(buildPlanNotices({ medication })).toEqual([MEDICAL_DISCLAIMER, MEDICATION_ADVICE]);
  });
});
