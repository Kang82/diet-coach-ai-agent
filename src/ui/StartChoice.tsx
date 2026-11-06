// 첫 화면 분기 (스펙 7장, tasks.md B6 T5-5). 이 브라우저에 저장한 프로필이 있고 새 대화이면 보여 준다.
import { summarizeInterviewResult } from '../core/interview-text.ts';
import type { SavedProfile } from './saved-profile.ts';

export function StartChoice({
  saved,
  onUseSaved,
  onEditSaved,
  onFresh,
  onForget,
}: {
  saved: SavedProfile;
  /** 지난 프로필 그대로 제출 */
  onUseSaved: () => void;
  /** 프로필 확인 화면에서 바뀐 항목만 고치기 */
  onEditSaved: () => void;
  /** 인터뷰 처음부터 */
  onFresh: () => void;
  /** 이 브라우저에 저장한 내 정보(프로필, 대화별 진행 값) 지우기 */
  onForget: () => void;
}) {
  return (
    <section className="intro">
      <h1 className="display">다시 오셨네요</h1>
      <p className="lede">지난번에 저장에 동의한 프로필이에요. 원하지 않으면 아래에서 지울 수 있어요.</p>
      <ul className="interview-summary">
        {summarizeInterviewResult(saved.result).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="choices">
        <button type="button" className="primary" onClick={onUseSaved}>
          지난 프로필로 시작
        </button>
        <button type="button" className="secondary" onClick={onEditSaved}>
          바뀐 항목 고치기
        </button>
        <button type="button" className="secondary" onClick={onFresh}>
          인터뷰 처음부터
        </button>
      </div>
      <button type="button" className="link" onClick={onForget}>
        이 브라우저에 저장한 내 정보 지우기
      </button>
    </section>
  );
}
