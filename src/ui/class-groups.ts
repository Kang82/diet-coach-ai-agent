// 메뉴 분류 확인 화면의 끼니 묶음과 해결 방법 (B16 T12-2). 순수 함수.
// 사용자가 경고만 보고 어떤 메뉴가 어느 끼니 것인지, 무엇을 바꾸면 되는지 알 수 없었다(11-08 배포본 확인).
// 그래서 목록을 외식 끼니별로 묶고, 메뉴가 모자란 끼니에 코드가 계산한 해결 방법을 붙인다.
import { MENU_CLASS_LABELS } from '../core/labels.ts';
import { fixSuggestions, mealGroupLabel, mealGroups, mealLabel } from '../core/plan-feasibility.ts';
import type { MenuClassification, Profile, Slot } from '../core/types.ts';

export interface ClassGroupView {
  /** 라디오 이름 등에 쓰는 키 (weekday-lunch) */
  key: string;
  title: string;
  short: boolean;
  /** 이 끼니의 메뉴. 점심·저녁에 같이 있는 메뉴는 두 묶음에 모두 나온다 */
  menus: string[];
  /** 모자란 끼니일 때만: 자주로 바꾸면 만들 수 있는 메뉴 */
  fixes: { menu: string; text: string }[];
  /** 모자란 끼니이고 메뉴를 하나 더 넣으면 될 때 */
  addMenu?: string;
}

export interface ClassGroupsView {
  groups: ClassGroupView[];
  /** 어느 묶음에도 없는 메뉴(프로필이 없거나 분류와 어긋났을 때). 묶음 없이 그린다 */
  others: string[];
  /** 모자란 끼니가 있을 때 화면 맨 위 한 줄 */
  summary?: string;
}

/** classes는 사용자가 바꾼 분류를 반영한 값. 프로필이 없으면 묶지 않는다(전부 others) */
export function classGroupsView(
  profile: Profile | undefined,
  classes: readonly MenuClassification[],
  events: readonly Slot[],
): ClassGroupsView {
  if (!profile) return { groups: [], others: classes.map((c) => c.menu) };
  const known = new Set(classes.map((c) => c.menu));
  const suggestions = fixSuggestions(profile, classes, events);
  const groups = mealGroups(profile, classes, events).map((g): ClassGroupView => {
    const menus = g.menus.filter((m) => known.has(m));
    const fixes = g.short
      ? suggestions.flatMap((s) =>
          s.kind === 'reclass' && menus.includes(s.menu)
            ? [{ menu: s.menu, text: `${withObject(s.menu)} "${MENU_CLASS_LABELS.often}"으로 바꾸기` }]
            : [],
        )
      : [];
    const add =
      g.short && suggestions.some((s) => s.kind === 'add_menu' && s.meal.dayType === g.meal.dayType && s.meal.meal === g.meal.meal);
    return {
      key: `${g.meal.dayType}-${g.meal.meal}`,
      title: mealGroupLabel(g),
      short: g.short,
      menus,
      fixes,
      ...(add ? { addMenu: `${mealLabel(g.meal)}에 외식 메뉴 1개 더 넣기` } : {}),
    };
  });
  const grouped = new Set(groups.flatMap((g) => g.menus));
  const shortNames = mealGroups(profile, classes, events)
    .filter((g) => g.short)
    .map((g) => mealLabel(g.meal));
  return {
    groups,
    others: classes.map((c) => c.menu).filter((m) => !grouped.has(m)),
    ...(shortNames.length > 0
      ? { summary: `${shortNames.join(', ')} 외식 메뉴가 모자라요. 표시한 끼니에서 고칠 방법을 골라 주세요.` }
      : {}),
  };
}

/** 목적격 조사: 받침이 있으면 을, 없으면 를. 한글로 끝나지 않으면 을(를) */
export function withObject(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}을(를)`;
  return `${word}${code % 28 === 0 ? '를' : '을'}`;
}
