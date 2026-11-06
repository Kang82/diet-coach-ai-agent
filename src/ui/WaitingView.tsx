// 식단표를 만드는 동안 보여 주는 화면 (스펙 7장). 생성에 4분쯤 걸린다 (스펙 11.5).
import { formatClock, useElapsedSeconds } from './use-elapsed.ts';

const EXPECTED_SECONDS = 4 * 60;

export function WaitingView({ startedAt }: { startedAt: number }) {
  const elapsed = useElapsedSeconds(startedAt);
  const over = elapsed > EXPECTED_SECONDS;
  const ratio = Math.min(elapsed / EXPECTED_SECONDS, 1);

  return (
    <section className="waiting">
      <h1 className="display">식단표를 만드는 중이에요</h1>
      {/* role="timer"는 기본으로 읽어 주지 않는다. 매초 바뀌는 값을 화면 낭독기가 계속 읽지 않게 한다 */}
      <p className="clock" role="timer" aria-label={`${Math.floor(elapsed / 60)}분 ${elapsed % 60}초 지남`}>
        {formatClock(elapsed)}
      </p>
      <div className="meter" aria-hidden="true">
        <div className="meter-fill" style={{ transform: `scaleX(${ratio})` }} />
      </div>
      <p className="lede" aria-live="polite">
        {over
          ? '예상보다 오래 걸리고 있어요. 규칙에 맞지 않는 칸을 다시 고르는 중일 수 있어요.'
          : '보통 4분쯤 걸려요. 이 창을 닫았다 다시 열어도 이어서 볼 수 있어요.'}
      </p>
    </section>
  );
}

