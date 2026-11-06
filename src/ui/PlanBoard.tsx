// 1주일 식단표 (스펙 7장). 넓은 화면은 요일 × 끼니 메뉴판, 좁은 화면은 요일별 카드. 아래에 점검 요약과 안내.
import type { PlanToolOutput } from '../core/plan-tool-output.ts';
import type { PlanCell } from '../core/types.ts';
import { DAY_LABELS, layoutPlan, MEAL_LABELS } from './plan-layout.ts';

type OkOutput = Extract<PlanToolOutput, { status: 'ok' }>;

export function PlanBoard({ output, onStartOver }: { output: OkOutput; onStartOver: () => void }) {
  const { meals, days } = layoutPlan(output.plan);
  const range = `${days[0]!.date} – ${days.at(-1)!.date}`;

  return (
    <section className="plan">
      <header className="plan-head">
        <h1 className="display">{range} 식단표</h1>
        <button type="button" className="secondary" onClick={onStartOver}>
          새로 만들기
        </button>
      </header>

      {/* 넓은 화면: 메뉴판 */}
      <table className="board">
        <thead>
          <tr>
            <th scope="col" className="corner" />
            {days.map((d) => (
              <th scope="col" key={d.day} className={d.day === 'sat' || d.day === 'sun' ? 'weekend' : undefined}>
                <span className="day">{DAY_LABELS[d.day]}</span>
                <span className="date">{d.date}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {meals.map((meal, mi) => (
            <tr key={meal}>
              <th scope="row" className="meal">
                {MEAL_LABELS[meal]}
              </th>
              {days.map((d) => {
                const cell = d.cells[mi];
                return (
                  <td key={d.day} className={cell ? `slot ${cell.place}` : 'slot empty'}>
                    {cell ? <CellBody cell={cell} /> : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* 좁은 화면: 요일별 카드 */}
      <ol className="cards">
        {days.map((d) => (
          <li key={d.day} className="card">
            <h2 className="card-day">
              {DAY_LABELS[d.day]}요일 <span className="date">{d.date}</span>
            </h2>
            {meals.map((meal, mi) => {
              const cell = d.cells[mi];
              if (!cell) return null;
              return (
                <div key={meal} className={`slot ${cell.place}`}>
                  <p className="meal-label">{MEAL_LABELS[meal]}</p>
                  <CellBody cell={cell} />
                </div>
              );
            })}
          </li>
        ))}
      </ol>

      <footer className="plan-foot">
        <div>
          <h2 className="foot-title">규칙 점검</h2>
          <ul className="checks">
            {output.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="notices">
          {output.notices.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </footer>
    </section>
  );
}

function CellBody({ cell }: { cell: PlanCell }) {
  return (
    <>
      <p className="menu">{cell.title}</p>
      <p className="place">{cell.place === 'eat_out' ? '외식' : `집밥 ${cell.cookMinutes}분`}</p>
      <p className="reason">{cell.reason}</p>
      {cell.orderTip ? <p className="tip">주문할 때: {cell.orderTip}</p> : null}
    </>
  );
}
