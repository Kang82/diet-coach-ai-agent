// 메뉴 분류 도구(classify_menus)의 결과 모양 (스펙 4.2, tasks.md B5).
// 도구가 만들고 화면(src/ui/menu-class-view-state.ts)이 읽는다. 대화 메시지의 dynamic-tool 부분 output으로 전달된다.
import type { TokenUsage } from './plan-generator.ts';
import type { MenuClassification } from './types.ts';

export interface ClassifyToolStats {
  seconds: number;
  usages: TokenUsage[];
  neurons: number;
}

export type ClassifyToolOutput =
  /** classes: 분류 대상 순서. 외식 끼니가 없으면 빈 배열 */
  | { status: 'ok'; classes: MenuClassification[]; stats: ClassifyToolStats }
  | { status: 'quota'; message: string; stats: ClassifyToolStats }
  /** 인터뷰가 끝나지 않았음 */
  | { status: 'no_interview'; message: string; stats: ClassifyToolStats };
