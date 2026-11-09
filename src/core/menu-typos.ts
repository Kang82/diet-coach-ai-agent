// 외식 메뉴 오타 안내 (tasks.md T22-5, "나중에"에서 옮김).
// 같은 메뉴 판정은 menuKey(공백 제거) 정확히 일치라 "샌다위치"와 "샌드위치"는 다른 메뉴가 된다(같은 메뉴 횟수 규칙을 피해 간다).
// 고쳐 주지는 않고(통밀 샌드위치처럼 정말 다른 메뉴일 수 있다) 프로필 확인 화면에서 알리기만 한다.
import { menuKey } from './helpers.ts';
import type { MealSetting } from './types.ts';

/** 이보다 짧은 이름은 한 글자 차이가 흔한 다른 메뉴다(라면/냉면, 국밥/국수) */
const MIN_LENGTH = 3;

/**
 * 외식 끼니 메뉴 중 공백을 뺀 이름이 한 글자(바꾸기·넣기·빼기)만 다른 쌍.
 * 이름은 처음 입력한 그대로(앞뒤 공백만 정리), 앞 메뉴의 입력 순서대로, 쌍마다 한 번
 */
export function similarMenus(meals: readonly MealSetting[]): [string, string][] {
  const names = new Map<string, string>();
  for (const m of meals) {
    if (m.place !== 'eat_out') continue;
    for (const raw of m.menus ?? []) {
      const key = menuKey(raw);
      if (key && !names.has(key)) names.set(key, raw.trim());
    }
  }
  const entries = [...names].map(([key, name]) => ({ chars: Array.from(key), name }));
  const pairs: [string, string][] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]!;
      const b = entries[j]!;
      if (a.chars.length >= MIN_LENGTH && b.chars.length >= MIN_LENGTH && oneEditApart(a.chars, b.chars)) {
        pairs.push([a.name, b.name]);
      }
    }
  }
  return pairs;
}

/** 프로필 확인 화면 안내. 쌍이 없으면 undefined */
export function menuTypoHint(pairs: readonly (readonly [string, string])[]): string | undefined {
  if (pairs.length === 0) return undefined;
  const list = pairs.map(([a, b]) => `${a} · ${b}`).join(', ');
  return `비슷한 이름의 외식 메뉴가 있어요: ${list}. 같은 메뉴라면 하나로 고쳐 주세요. 이름이 다르면 다른 메뉴로 봐요.`;
}

/** 서로 다른 두 글자열이 편집 거리 1인지 (글자 단위, 한글은 음절 하나가 한 글자) */
function oneEditApart(a: readonly string[], b: readonly string[]): boolean {
  if (a.length < b.length) return oneEditApart(b, a);
  if (a.length - b.length > 1) return false;
  let i = 0;
  while (i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    // 한 글자 바꾸기: 다른 자리 하나 뒤는 모두 같아야 한다
    return i < a.length && a.slice(i + 1).join('') === b.slice(i + 1).join('');
  }
  // a가 한 글자 길다: a의 i번째를 빼면 같아야 한다
  return a.slice(i + 1).join('') === b.slice(i).join('');
}
