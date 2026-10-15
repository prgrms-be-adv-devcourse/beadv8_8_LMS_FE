import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { lectureQuery } from '@/entities/lecture/api'
import type { LectureContent } from '@/entities/lecture/types'
import { purchasedQuery } from '@/entities/order/api'
import type { PurchasedLecture } from '@/entities/order/types'
import { ContentView } from '@/features/lecture-watch/ContentView'
import { PlayConsentModal } from '@/features/purchase/PurchaseModals'
import { EmptyState } from '@/shared/ui/EmptyState'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './WatchPage.module.css'

export function WatchPage() {
  const lectureId = Number(useParams().lectureId)
  const lecture = useQuery(lectureQuery(lectureId))
  const purchased = useQuery(purchasedQuery)
  const owned = purchased.data?.content.find((p) => p.lectureId === lectureId)

  const back = (
    <Link className="back" to="/library">
      ← 내 강의
    </Link>
  )
  if (lecture.isPending || purchased.isPending)
    return (
      <div className="page">
        {back}
        <Loading />
      </div>
    )
  const error = lecture.error ?? purchased.error
  if (error)
    return (
      <div className="page">
        {back}
        <LoadError
          error={error}
          retry={() =>
            void Promise.all([lecture.refetch(), purchased.refetch()])
          }
        />
      </div>
    )
  if (!owned || !lecture.data)
    return (
      <div className="page">
        {back}
        <EmptyState
          title="볼 수 있는 강의가 아니에요"
          action={
            <Link className="btn primary" to={`/lectures/${lectureId}`}>
              강의 보러 가기
            </Link>
          }
        >
          구매했거나 구매 취소하지 않은 강의만 볼 수 있어요.
        </EmptyState>
      </div>
    )

  const contents = [...lecture.data.contents].sort(
    (a, b) => a.sequence - b.sequence,
  )
  return (
    <div className="page">
      {back}
      <Player
        key={lectureId}
        title={lecture.data.title}
        sellerNickname={lecture.data.sellerNickname}
        owned={owned}
        contents={contents}
      />
    </div>
  )
}

function Player({
  title,
  sellerNickname,
  owned,
  contents,
}: {
  title: string
  sellerNickname: string
  owned: PurchasedLecture
  contents: LectureContent[]
}) {
  const [index, setIndex] = useState(0)
  const [consentOpen, setConsentOpen] = useState(false)
  // 구매 확정 전에는 재생 동의를 받기 전까지 시청 URL을 발급받지 않는다.
  const needsConsent = owned.itemStatus === 'PURCHASED'
  const current = contents[index]

  if (contents.length === 0)
    return <EmptyState title="아직 올라온 콘텐츠가 없어요" />

  return (
    <div className={styles.split}>
      <div className="page" style={{ gap: 16 }}>
        {needsConsent ? (
          <div className={styles.player}>
            <p>재생하면 구매가 확정돼요.</p>
            <button
              type="button"
              className="btn signal"
              onClick={() => setConsentOpen(true)}
            >
              동의하고 재생
            </button>
          </div>
        ) : (
          <ContentView lectureId={owned.lectureId} content={current} />
        )}
        <div className="panel-head">
          <div className={styles.heading}>
            <span className="fine">
              {title} · {sellerNickname}
            </span>
            <h1>
              {String(index + 1).padStart(2, '0')} {current.title}
            </h1>
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="btn sm"
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
            >
              이전
            </button>
            <button
              type="button"
              className="btn primary sm"
              disabled={index === contents.length - 1}
              onClick={() => setIndex((i) => i + 1)}
            >
              다음
            </button>
          </div>
        </div>
      </div>
      <aside className="panel sticky">
        <div className="panel-head">
          <h2>커리큘럼</h2>
          <span className="fine num">{contents.length}개</span>
        </div>
        <ol className={styles.curr}>
          {contents.map((c, i) => (
            <li key={c.contentId}>
              <span
                className={
                  i === index ? `${styles.mark} ${styles.now}` : styles.mark
                }
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <button
                type="button"
                className={styles.lesson}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => setIndex(i)}
              >
                {c.title}
              </button>
              <span className="pill mute">
                {c.contentType === 'VIDEO' ? '영상' : '자료'}
              </span>
            </li>
          ))}
        </ol>
        {!needsConsent && (
          <Link className="btn block" to={`/library/${owned.lectureId}/review`}>
            리뷰 쓰기
          </Link>
        )}
      </aside>
      {consentOpen && (
        <PlayConsentModal
          item={{
            orderId: owned.orderId,
            orderItemId: owned.orderItemId,
            title,
          }}
          onClose={() => setConsentOpen(false)}
          onConsented={() => setConsentOpen(false)}
        />
      )}
    </div>
  )
}
