// 체크 반영해 다음 주 짜기 (tasks.md T28, Task2 R3, 기획서 6장).
// 지난주 식단표에서 "먹었어요"로 체크한 칸의 메뉴를 다음 식단표 생성 프롬프트에 선호로 넣는다.
// 선호일 뿐이라 checkPlan·사전 점검은 그대로이고, 프롬프트에서도 규칙(횟수 제한, 반복 금지)이 앞선다고 적는다.
// 체크는 대화 ID + 칸만 있고(T25) 메뉴는 저장 동의한 사람의 D1 plans에 있어(T28 conversation_id), 동의한 사람만 반영된다.
import { compareSlots, menuKey, sameSlot } from './helpers.ts';
import type { MenuClassification, Plan, Profile, Slot } from './types.ts';

/** 프롬프트에 넣을 지난주 기록 */
export interface LastWeek {
  /** 지난 식단표의 시작 월요일 (화면 안내용) */
  weekStart: string;
  /** 먹었다고 체크한 메뉴와 횟수. 많이 먹은 순, 같으면 먼저 나온 순 */
  eaten: { menu: string; count: number }[];
  /** 한 번도 체크하지 않은 메뉴. 식단표 순 */
  skipped: string[];
}

/** 식단표가 있는 대화 (storage/guard-store.ts의 PlanConversation과 같은 모양) */
export interface PlanConversationRef {
  conversationId: string;
  weekStart: string;
  planAt: string;
}

/** 메뉴 이름 길이와 목록 개수 상한 (프롬프트를 짧게, 모델이 만든 이름이라도 한 번 더 자른다) */
export const LAST_WEEK_LIMITS = { menus: 14, name: 40 } as const;

/**
 * "지난주"로 볼 식단표 대화: 지금 대화가 아니고, 시작 월요일이 이번 식단표보다 이른 것 중 가장 최근에 만들거나 고친 것.
 * 같은 주를 다시 만든 대화는 지난주가 아니라서 뺀다
 */
export function pickLastWeek(
  conversations: readonly PlanConversationRef[],
  currentConversationId: string,
  weekStart: string,
): PlanConversationRef | undefined {
  let best: PlanConversationRef | undefined;
  for (const c of conversations) {
    if (c.conversationId === currentConversationId || !(c.weekStart < weekStart)) continue;
    if (!best || c.planAt > best.planAt) best = c;
  }
  return best;
}

/**
 * 지난 식단표와 체크한 칸으로 선호를 만든다. 체크가 하나도 없으면 undefined
 * (안 먹은 것인지 체크를 안 한 것인지 알 수 없다).
 * 외식 메뉴는 지금 외식 메뉴 목록에 있고 분류가 avoid가 아닌 것만 남긴다(목록에서 뺀 메뉴를 다시 권하지 않게).
 * 집밥 메뉴는 지금 집밥 끼니가 있을 때만 남긴다. 같은 메뉴 판정은 menuKey(공백 무시)
 */
export function lastWeekFeedback(
  plan: Pick<Plan, 'weekStart' | 'cells'>,
  checks: readonly Slot[],
  profile: Pick<Profile, 'meals'>,
  classes: readonly MenuClassification[],
): LastWeek | undefined {
  const checked = plan.cells.filter((cell) => checks.some((s) => sameSlot(s, cell)));
  if (checked.length === 0) return undefined;

  const eatOutMenus = new Set(
    profile.meals.flatMap((m) => (m.place === 'eat_out' ? (m.menus ?? []) : [])).map(menuKey),
  );
  const avoided = new Set(classes.filter((c) => c.class === 'avoid').map((c) => menuKey(c.menu)));
  const hasHome = profile.meals.some((m) => m.place === 'home');
  const usable = (cell: Plan['cells'][number]) =>
    cell.place === 'eat_out'
      ? eatOutMenus.has(menuKey(cell.menuId)) && !avoided.has(menuKey(cell.menuId))
      : hasHome;

  // 메뉴별로 묶는다. 표시 이름은 처음 나온 칸의 이름
  const byMenu = new Map<string, { menu: string; count: number; order: number }>();
  const cells = [...plan.cells].sort(compareSlots);
  cells.forEach((cell, order) => {
    const menu = cleanName(cell.menuId);
    if (!menu || !usable(cell)) return;
    const key = menuKey(menu);
    const entry = byMenu.get(key) ?? { menu, count: 0, order };
    if (checked.includes(cell)) entry.count += 1;
    byMenu.set(key, entry);
  });

  const entries = [...byMenu.values()];
  const eaten = entries
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, LAST_WEEK_LIMITS.menus)
    .map(({ menu, count }) => ({ menu, count }));
  const skipped = entries
    .filter((e) => e.count === 0)
    .sort((a, b) => a.order - b.order)
    .slice(0, LAST_WEEK_LIMITS.menus)
    .map((e) => e.menu);
  if (eaten.length === 0 && skipped.length === 0) return undefined;
  return { weekStart: plan.weekStart, eaten, skipped };
}

/** 줄바꿈·탭을 공백으로, 앞뒤 공백 제거, 길이 상한 */
function cleanName(name: string): string {
  return name.replace(/[\r\n\t]+/g, ' ').trim().slice(0, LAST_WEEK_LIMITS.name);
}
