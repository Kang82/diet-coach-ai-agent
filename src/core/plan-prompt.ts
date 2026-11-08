// 스펙 4.3, 4.4의 LLM 프롬프트. 문장만 만들고 LLM은 부르지 않는다.
// 규칙의 기준은 checkPlan(3.2)이다. 여기 적은 규칙은 LLM이 처음부터 지키도록 돕는 안내일 뿐이고,
// 지켰는지는 checkPlan이 판정한다.
import { MAIN_INGREDIENT_WEEKLY_MAX } from './check-plan.ts';
import { menuWeeklyMaxFor } from './plan-feasibility.ts';
import { requiredSlots } from './plan-slots.ts';
import { dayType, expandAvoid, menuKey, slotOrder } from './helpers.ts';
import { AVOID_TAG_LABELS, CRITERION_LABELS } from './labels.ts';
import type { GeneratePlanInput, RegenerateCellsInput } from './plan-generator.ts';
import { AVOID_TAGS, NUTRITION_TAGS } from './types.ts';
import { DAY_LABELS, MEAL_LABELS } from './labels.ts';
import type {
  CriteriaRules,
  Day,
  DayType,
  MealType,
  MenuClassification,
  NutritionTag,
  Plan,
  PlanEvent,
  Profile,
  RuleId,
  Slot,
  Violation,
} from './types.ts';

const DAY_TYPE_LABELS: Record<DayType, string> = { weekday: '평일', weekend: '주말' };

const NUTRITION_TAG_LABELS: Record<NutritionTag, string> = {
  fried: '튀김',
  fatty_meat: '기름진 고기(삼겹살, 갈비, 곱창 등)',
  processed_meat: '햄, 소시지 같은 가공육',
  refined_carb_main: '흰 면이나 흰 빵이 주식, 흰쌀밥은 해당 없음',
  sugary: '단 소스나 디저트',
};

const RULE_LABELS: Record<RuleId, string> = {
  unexpected_cell: '칸이 있으면 안 되는 끼니에 칸이 있음',
  missing_cell: '채워야 할 끼니에 칸이 없음',
  place_mismatch: '끼니 설정과 외식·집밥이 다름',
  avoid_tag: '피할 음식이 들어감',
  eat_out_not_in_list: '외식 메뉴가 그 끼니의 메뉴 목록에 없음',
  class_avoid: '피해야 할 외식 메뉴를 넣음',
  class_weekly_limit: '주 1회 이하 외식 메뉴를 2번 이상 넣음',
  tag_weekly_limit: '1주일 횟수 제한을 넘은 음식 종류',
  consecutive_menu: '바로 앞 끼니와 같은 메뉴',
  same_meal_consecutive_days: '전날 같은 끼니와 같은 메뉴',
  menu_weekly_limit: '같은 메뉴를 1주일에 허용 횟수보다 많이 넣음', // describeViolation이 횟수를 넣는다
  main_ingredient_consecutive: '바로 앞 끼니와 같은 주재료의 집밥',
  main_ingredient_weekly_limit: `같은 주재료 집밥을 1주일에 ${MAIN_INGREDIENT_WEEKLY_MAX}번 넘게 넣음`,
  cook_time_exceeded: '조리 시간 초과',
  reason_criterion: '이유의 근거(criterionIds)가 식단 기준에 없음',
};

const slotLabel = (slot: Slot) => `${DAY_LABELS[slot.day]} ${MEAL_LABELS[slot.meal]} (${slot.day} ${slot.meal})`;

/**
 * 도구 안 프롬프트의 첫 줄 (tasks.md B14 T8-7). 도구 안 harness.prompt는 에이전트의 시스템 지시와 도구 목록(create_week_plan 등)을
 * 그대로 물려받는다. gpt-oss-120b는 그 지시대로 finish 대신 바깥 도구를 불렀다. 결과는 finish로만 보내라고 맨 앞에 적는다
 */
export const FINISH_ONLY = '이 요청에서는 다른 도구를 부르지 말고 결과를 finish 도구로만 보내세요.';

/** 1주일 식단표를 한 번에 만드는 프롬프트 (스펙 4.3) */
export function buildGeneratePrompt(input: GeneratePlanInput): string {
  const slots = requiredSlots(input.profile, input.events);
  return [
    FINISH_ONLY,
    `${input.weekStart}부터 1주일 식단표의 칸을 만들어 주세요.`,
    `아래 "채워야 할 끼니" ${slots.length}곳에 칸을 하나씩, 모두 ${slots.length}칸 만들어 finish 도구의 cells에 담아 주세요.`,
    '',
    sectionGoals(input.profile),
    sectionSlots(input.profile, input.classes, slots, input.events),
    sectionRules(input.profile, input.rules, menuWeeklyMaxFor(input.profile, input.classes, input.events)),
    sectionCellFormat(),
  ].join('\n');
}

/** 일부 칸만 다시 만드는 프롬프트 (스펙 4.4) */
export function buildRegeneratePrompt(input: RegenerateCellsInput): string {
  const weeklyMax = menuWeeklyMaxFor(input.profile, input.classes, input.plan.events);
  const lines = [
    FINISH_ONLY,
    `1주일 식단표에서 아래 "다시 만들 칸" ${input.targets.length}곳만 새로 만들어 finish 도구의 cells에 담아 주세요.`,
    '다른 칸은 그대로 두니 cells에 넣지 마세요.',
    '',
  ];
  if (input.userRequest) {
    lines.push('## 사용자 요청', input.userRequest, '');
  }
  if (input.violations.length > 0) {
    lines.push('## 지금 식단표에서 지키지 못한 규칙', ...input.violations.map((v) => describeViolation(v, weeklyMax)), '');
  }
  lines.push(
    '## 다시 만들 칸',
    ...input.targets.map((t) => `- ${slotLabel(t)}`),
    '',
    sectionCurrentPlan(input.plan, input.targets),
    sectionGoals(input.profile),
    sectionSlots(input.profile, input.classes, input.targets, input.plan.events),
    sectionRules(input.profile, input.rules, weeklyMax),
    sectionCellFormat(),
  );
  return lines.join('\n');
}

function sectionGoals(profile: Profile): string {
  return ['## 사용자', `- 목표: ${profile.goalNote}`, ''].join('\n');
}

function sectionSlots(
  profile: Profile,
  classes: readonly MenuClassification[],
  slots: readonly Slot[],
  events: readonly PlanEvent[],
): string {
  // 같은 설정(평일/주말 × 끼니)의 끼니는 한 줄로 묶어 메뉴 설명이 반복되지 않게 한다.
  const lines = ['## 채워야 할 끼니'];
  for (const setting of profile.meals) {
    const days = [...slots]
      .sort((a, b) => slotOrder(a) - slotOrder(b))
      .filter((s) => s.meal === setting.meal && dayType(s.day) === setting.dayType)
      .map((s) => s.day);
    if (days.length === 0 || setting.place === 'skip') continue;
    const head = `- ${DAY_TYPE_LABELS[setting.dayType]} ${MEAL_LABELS[setting.meal]} (${days.join(', ')}의 ${setting.meal})`;
    if (setting.place === 'eat_out') {
      lines.push(`${head}: 외식 (place: eat_out). ${describeMenus(setting.menus ?? [], classes)}`);
    } else {
      const limit = setting.cookMinutes === undefined ? '조리 시간 제한 없음' : `조리 ${setting.cookMinutes}분 이내`;
      lines.push(`${head}: 집밥 (place: home). ${limit}`);
    }
  }
  if (events.length > 0) {
    lines.push('', '다음 끼니는 일정이 있어 칸을 만들지 않습니다:');
    for (const e of events) lines.push(`- ${slotLabel(e)}: ${e.note}`);
  }
  lines.push('');
  return lines.join('\n');
}

function describeMenus(menus: readonly string[], classes: readonly MenuClassification[]): string {
  const classOf = new Map(classes.map((c) => [c.menu, c]));
  const often = menus.filter((m) => classOf.get(m)?.class !== 'weekly_max_1' && classOf.get(m)?.class !== 'avoid');
  const weekly = menus.filter((m) => classOf.get(m)?.class === 'weekly_max_1');
  const parts = [`menuId는 다음 중 하나를 글자 그대로: ${often.join(', ') || '(없음)'}`];
  if (weekly.length > 0) parts.push(`1주일에 1번까지만: ${weekly.join(', ')}`);
  const tips = menus.flatMap((m) => {
    const c = classOf.get(m);
    return c && c.class !== 'avoid' && c.orderTips.length > 0 ? [`${m} → ${c.orderTips.join(', ')}`] : [];
  });
  // 예전 "메뉴(팁)" 모양은 메뉴 이름의 괄호와 섞이고, 팁 하나를 다른 메뉴에도 옮겨 적었다(2026-11-08 배포본). 메뉴마다 화살표로 나눈다
  if (tips.length > 0) parts.push(`주문 팁(그 메뉴에만): ${tips.join('; ')}`);
  return parts.join(' / ');
}

/** weeklyMax: 같은 메뉴 허용 횟수. 외식 메뉴가 적으면 사전 점검이 늘린다 (B15, plan-feasibility.ts) */
function sectionRules(profile: Profile, rules: CriteriaRules, weeklyMax: number): string {
  const avoid = expandAvoid(profile.avoid);
  const lines = ['## 지켜야 할 규칙'];
  if (avoid.length > 0) {
    lines.push(
      `- 피할 음식: ${avoid.map((t) => `${AVOID_TAG_LABELS[t]}(${t})`).join(', ')}. 이 재료가 들어간 메뉴는 넣지 않습니다.` +
        (profile.avoidNote ? ` (사용자 설명: ${profile.avoidNote})` : ''),
    );
  }
  const limits = NUTRITION_TAGS.filter((t) => rules.tagLimits[t] !== undefined);
  if (limits.length > 0) {
    lines.push(
      `- 1주일 횟수 제한 (모든 칸 합계): ${limits
        .map((t) => `${t}(${NUTRITION_TAG_LABELS[t]}) ${rules.tagLimits[t]}번`)
        .join(', ')}`,
    );
  }
  lines.push(
    '- 바로 앞 끼니와 같은 메뉴는 넣지 않습니다.',
    '- 같은 끼니(점심끼리, 저녁끼리)에 전날과 같은 메뉴는 넣지 않습니다.',
    `- 같은 메뉴는 1주일에 ${weeklyMax}번까지만 넣습니다. 메뉴를 다양하게 고릅니다.`,
    // T18: 이름은 다르지만 주재료가 같은 집밥(닭가슴살 샐러드, 닭가슴살 볶음)이 이어지지 않게
    `- 집밥은 같은 주재료를 바로 앞 끼니에 넣지 않고, 1주일에 ${MAIN_INGREDIENT_WEEKLY_MAX}번까지만 넣습니다.`,
    `- 식단 기준: ${rules.criteria.map((c) => `${CRITERION_LABELS[c]}(${c})`).join(', ')}`,
    // B17 T13-1: 감량·LDL 목표에 집밥 삼겹살 구이가 나왔다(규칙 안이지만 목표와 어긋남)
    '- 집밥 메뉴는 식단 기준에 맞는 쪽을 고릅니다.' +
      (rules.criteria.includes('reduce_saturated_fat') ? ' (예: 포화지방 줄이기면 삼겹살·갈비보다 살코기나 생선)' : ''),
    '',
  );
  return lines.join('\n');
}

function sectionCellFormat(): string {
  return [
    '## 칸 작성 방법',
    '- day, meal: 위 목록의 영문 값 (예: mon, lunch)',
    '- place: 외식이면 eat_out, 집밥이면 home',
    '- menuId: 외식은 메뉴 목록의 이름을 글자 그대로, 집밥은 설명을 뺀 메뉴 이름 (예: 두부 채소 볶음)',
    // B17 T13-3: 괄호 팁을 허용하자 제목에만 팁을 쓰고 orderTip을 비웠다. 외식 제목은 코드가 메뉴 이름으로 정한다(plan-cells.ts)
    '- title: 메뉴 이름만. 괄호로 주문 방법이나 조리 포인트를 덧붙이지 않습니다 (외식은 메뉴 목록의 이름이 그대로 제목이 됩니다)',
    '- ingredients: 주요 재료',
    `- tags: 해당하는 것을 빠짐없이. 재료 태그 ${AVOID_TAGS.join(', ')} / 음식 종류 태그 ${NUTRITION_TAGS.join(', ')}`,
    '  고기가 들어가면 meat와 함께 pork, beef, chicken 중 해당하는 것도 붙입니다.',
    // B17 T13-4: 흰 식빵 샌드위치에 누락(B14 기록). 정의는 스펙 2.2
    '  refined_carb_main은 흰 면(국수, 라면, 우동, 파스타, 쌀국수 등)이나 흰 빵(식빵, 샌드위치, 토스트, 버거 등)이 주식인 메뉴에 붙입니다. 흰쌀밥에는 붙이지 않습니다.',
    // B17 T13-2: 분류에 팁이 있으면 코드가 그 팁으로 채운다(plan-cells.ts)
    '- orderTip: 외식 칸에서 위 "주문 팁"에 없는 메뉴만 주문 팁 한 줄. 주문 팁이 있는 메뉴는 비워 두면 그 팁이 들어갑니다',
    '- cookMinutes: 집밥은 조리 시간(분), 외식은 0',
    '- mainIngredient: 집밥 칸의 주재료 한 단어 (예: 닭가슴살, 연어, 두부, 돼지고기). 외식은 비워도 됩니다',
    '- reason: 이 메뉴를 고른 이유를 한국어 한두 문장으로. 식단 기준과 연결해서',
    // B17 T13-1: "된장은 정제 탄수화물을 줄이는 데 도움", 외식 "저염 된장" 같은 근거가 나왔다(B14 기록)
    '  이 칸의 재료와 주문 팁에서 확인되는 사실만 근거로 씁니다. 외식에서 알 수 없는 조리 방식(저염, 저칼로리 양념 등)은 쓰지 않습니다.',
    '  된장·간장·고추장 같은 양념이나 장류를 열량이나 탄수화물을 줄이는 근거로 쓰지 않습니다.',
    '- criterionIds: reason의 근거가 된 식단 기준 ID를 1개 이상 (위 "식단 기준"의 영문 값만)',
  ].join('\n');
}

function sectionCurrentPlan(plan: Plan, targets: readonly Slot[]): string {
  const isTarget = (slot: Slot) => targets.some((t) => t.day === slot.day && t.meal === slot.meal);
  const lines = ['## 지금 식단표 (다시 만들 칸 제외)'];
  const kept = plan.cells.filter((c) => !isTarget(c));
  if (kept.length === 0) lines.push('- (없음)');
  for (const c of kept) {
    const main = c.mainIngredient ? ` (주재료: ${c.mainIngredient})` : '';
    lines.push(`- ${slotLabel(c)}: ${c.menuId}${main} [${c.tags.join(', ')}]`);
  }
  lines.push('', '다시 만든 칸이 위 칸들과 함께 규칙을 지키도록 메뉴를 고르세요.', '');
  return lines.join('\n');
}

function describeViolation(v: Violation, weeklyMax: number): string {
  const cells = v.cells.map(slotLabel).join(', ');
  const detail = v.detail ? ` [${v.detail}]` : '';
  const label = v.rule === 'menu_weekly_limit' ? `같은 메뉴를 1주일에 ${weeklyMax}번 넘게 넣음` : RULE_LABELS[v.rule];
  return `- ${label}${detail}: ${cells || '(전체)'}`;
}

/**
 * LLM이 만든 menuId를 정규화한다 (스펙 1.4). 앞뒤 공백을 지우고 괄호 설명을 뗀다.
 * 외식 메뉴 목록과는 정확히 일치로 비교하므로, 정규화 뒤 목록과 menuKey가 같으면 목록의 글자로 맞춘다.
 * 사용자가 메뉴 이름에 괄호 메모를 넣은 경우("포케볼(생선 x)")도 맞춘다: 목록 이름과 그대로 같거나, 괄호를 뗀 모양끼리 같으면
 * 목록의 글자를 돌려준다. 예전에는 목록 쪽 괄호를 떼지 않아 이런 메뉴는 고를 때마다 eat_out_not_in_list였다(2026-11-08 배포본)
 */
export function normalizeMenuId(menuId: string, menus: readonly string[] = []): string {
  const exact = menus.find((m) => menuKey(m) === menuKey(menuId));
  if (exact) return exact;
  const stripped = stripNotes(menuId);
  const match = menus.find((m) => menuKey(m) === menuKey(stripped)) ?? menus.find((m) => menuKey(stripNotes(m)) === menuKey(stripped));
  return match ?? stripped;
}

/** 괄호 설명을 떼고 공백을 정리한다 */
function stripNotes(text: string): string {
  return text
    .replace(/\s*[(（][^)）]*[)）]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
