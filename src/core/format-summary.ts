// 스펙 6장 점검 요약 포맷터
import { AVOID_TAG_LABELS } from './labels.ts';
import { AVOID_TAGS } from './types.ts';
import type { CheckStats, Profile } from './types.ts';

export function formatCheckSummary(stats: CheckStats, profile: Pick<Profile, 'avoid'>): string[] {
  const lines: string[] = [];

  // 1. 사용자가 고른 피할 음식만 (펼친 태그 제외), AvoidTag 선언 순서
  const avoid = AVOID_TAGS.filter((tag) => profile.avoid.includes(tag));
  if (avoid.length > 0) {
    lines.push(avoid.map((tag) => `${AVOID_TAG_LABELS[tag]} ${stats.avoidTagCounts[tag] ?? 0}회`).join(', '));
  }

  // 2. 주 1회 이하 메뉴: checkPlan이 식단표에 처음 나온 순서로 넣은 순서를 따른다
  const limited = Object.entries(stats.limitedMenuCounts);
  if (limited.length > 0) {
    lines.push(`주 1회 이하 메뉴: ${limited.map(([menu, count]) => `${menu} ${count}회`).join(', ')}`);
  }

  // 3. 같은 메뉴 연속
  lines.push(stats.consecutiveCount === 0 ? '같은 메뉴 연속 없음' : `같은 메뉴 연속 ${stats.consecutiveCount}회`);

  return lines;
}
