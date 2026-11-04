// 스펙 6장 한글 라벨표
import type { AvoidTag } from './types.ts';

export const AVOID_TAG_LABELS: Record<AvoidTag, string> = {
  dairy: '유제품',
  egg: '달걀',
  wheat: '밀',
  soy: '콩',
  peanut: '땅콩',
  tree_nut: '견과류',
  fish: '생선',
  shellfish: '갑각류·조개류',
  meat: '고기',
  pork: '돼지고기',
  beef: '소고기',
  chicken: '닭고기',
};
