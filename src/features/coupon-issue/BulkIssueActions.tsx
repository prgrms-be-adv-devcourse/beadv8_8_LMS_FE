import { Link } from 'react-router'
import styles from './BulkIssueActions.module.css'
import { bulkResultMessage } from './issueView'
import type { IssueBoard } from './useIssueBoard'

/**
 * 목록 아래 줄: 모두 받기 진행·결과 안내, 받은 쿠폰이 있으면 '쿠폰함에서 보기', 받을 것이 남았으면 '모두 받기'.
 * 강의 상세 팝업 아래와 쿠폰 받기 화면 아래가 같이 쓴다(부르는 쪽의 가로 줄 안에 놓인다).
 * locked면 보이는 목록이 곧 바뀌어(쪽을 넘기는 중) 모두 받기를 막는다
 */
export function BulkIssueActions({
  board: { bulk, bulkResult, tally, issueAll },
  locked = false,
}: {
  board: IssueBoard
  locked?: boolean
}) {
  const status = bulk
    ? `받는 중 ${bulk.done}/${bulk.total}`
    : bulkResult
      ? bulkResultMessage(bulkResult)
      : ''
  const canIssueAll = tally.requestable.length > 0 || bulk !== null
  return (
    <>
      <span role="status" className={styles.status}>
        {status}
      </span>
      {tally.received > 0 && (
        <Link
          className={canIssueAll ? 'btn' : 'btn primary'}
          to="/library/coupons"
        >
          쿠폰함에서 보기
        </Link>
      )}
      {canIssueAll && (
        <button
          type="button"
          className="btn primary"
          disabled={bulk !== null || locked}
          aria-busy={bulk !== null}
          onClick={() => void issueAll()}
        >
          {bulk && <span className="spinner sm" aria-hidden="true" />}
          모두 받기
        </button>
      )}
    </>
  )
}
