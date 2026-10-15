import { useQuery } from '@tanstack/react-query'
import { contentAccessQuery } from '@/entities/lecture/api'
import type { LectureContent } from '@/entities/lecture/types'
import { toast } from '@/shared/ui/toastStore'
import styles from './ContentView.module.css'

/** 시청 URL(Presigned, 만료 있음)을 받아 영상은 재생하고 자료는 내려받게 한다. */
export function ContentView({
  lectureId,
  content,
}: {
  lectureId: number
  content: LectureContent
}) {
  const { data, error, isPending, isFetching, refetch } = useQuery(
    contentAccessQuery(lectureId, content.contentId),
  )
  if (isPending)
    return (
      <div className={styles.player}>
        <span className="spinner" aria-hidden="true" />
      </div>
    )
  if (error)
    return (
      <div className={styles.player}>
        <p>{error.message}</p>
        <button type="button" className="btn sm" onClick={() => refetch()}>
          다시 시도
        </button>
      </div>
    )
  if (content.contentType === 'VIDEO')
    return (
      <video
        key={data.url}
        className={styles.video}
        src={data.url}
        controls
        // URL이 만료되면 새로 받는다.
        onError={() => refetch()}
      />
    )
  return (
    <div className={styles.player}>
      <p>{content.title}</p>
      <button
        type="button"
        className="btn signal"
        disabled={isFetching}
        onClick={async () => {
          // 오래 열린 탭에서도 만료된 서명으로 다운로드하지 않는다.
          const fresh = await refetch()
          if (fresh.error || !fresh.data) {
            toast('자료 주소를 받지 못했어요. 다시 시도해 주세요.')
            return
          }
          const link = document.createElement('a')
          link.href = fresh.data.url
          link.rel = 'noreferrer'
          link.click()
        }}
      >
        {isFetching ? '자료 준비 중…' : '자료 내려받기'}
      </button>
    </div>
  )
}
