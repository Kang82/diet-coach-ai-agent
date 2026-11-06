// 식단표 칸을 화면 배치(요일 × 끼니)로 묶는다. 넓은 화면의 표와 좁은 화면의 요일별 카드가 같이 쓴다.
import { DAYS, MEAL_TYPES, type Day, type MealType, type Plan, type PlanCell } from '../core/types.ts';

export const DAY_LABELS: Record<Day, string> = {
  mon: '월',
  tue: '화',
  wed: '수',
  thu: '목',
  fri: '금',
  sat: '토',
  sun: '일',
};

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
};

export interface DayRow {
  day: Day;
  /** 'M/D' (weekStart 기준) */
  date: string;
  /** meals와 같은 순서. 칸이 없는 끼니는 undefined */
  cells: (PlanCell | undefined)[];
}

export interface PlanLayout {
  /** 식단표에 한 칸이라도 있는 끼니만, MEAL_TYPES 순서 */
  meals: MealType[];
  /** DAYS 순서, 7일 모두 */
  days: DayRow[];
}

export function layoutPlan(plan: Pick<Plan, 'weekStart' | 'cells'>): PlanLayout {
  const meals = MEAL_TYPES.filter((meal) => plan.cells.some((c) => c.meal === meal));
  const [y, m, d] = plan.weekStart.split('-').map(Number);
  const days = DAYS.map((day, i) => {
    const date = new Date(Date.UTC(y!, m! - 1, d! + i));
    return {
      day,
      date: `${date.getUTCMonth() + 1}/${date.getUTCDate()}`,
      cells: meals.map((meal) => plan.cells.find((c) => c.day === day && c.meal === meal)),
    };
  });
  return { meals, days };
}
