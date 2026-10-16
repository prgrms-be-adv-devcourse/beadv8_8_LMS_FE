import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { recruitQuery } from '@/entities/appearance/api'
import { isRecruitOpen } from '@/entities/appearance/recruit'
import type { HpReleaseStatus, Recruit } from '@/entities/appearance/types'
import { RecruitStatusPill } from '@/entities/appearance/ui/RecruitStatusPill'
import { CancelRecruitModal } from '@/features/appearance-cancel/CancelModals'
import { ApplicantList } from '@/features/recruit/ApplicantList'
import { ApplyPanel } from '@/features/recruit/ApplyPanel'
import {
  CloseRecruitModal,
  EditRecruitModal,
} from '@/features/recruit/RecruitModals'
import { isApiError } from '@/shared/api/ApiError'
import { meQuery } from '@/shared/auth/me'
import type { Viewer } from '@/shared/auth/role'
import { useViewer } from '@/shared/auth/session'
import { formatDateTime, isPast } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { EmptyState } from '@/shared/ui/EmptyState'
import { LoadError, Loading } from '@/shared/ui/QueryState'

export function RecruitDetailPage() {
  const recruitId = Number(useParams().recruitId)
  // /recruits/abc처럼 숫자가 아닌 주소는 BE에 묻지 않고 없는 모집글로 본다.
  const validId = Number.isSafeInteger(recruitId) && recruitId > 0
  const viewer = useViewer()
  const { data: me } = useQuery(meQuery)
  const { data, error, isPending, refetch } = useQuery({
    ...recruitQuery(recruitId),
    enabled: validId,
  })

  return (
    <div className="page">
      <Link className="back" to="/recruits">
        ← 출연 모집
      </Link>
      {!validId || isApiError(error, 'APPEARANCE_RECRUIT_NOT_FOUND') ? (
        <EmptyState
          title="모집글을 찾을 수 없어요"
          action={
            <Link className="btn" to="/recruits?tab=mine">
              내 모집글 보기
            </Link>
          }
        >
          없거나 아직 HP 보류를 처리 중인 모집글이에요. 방금 올렸다면 잠시 뒤 내
          모집글에서 확인해 주세요.
        </EmptyState>
      ) : isPending || !me || !viewer ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : (
        <Detail recruit={data} host={data.hostId === me.id} viewer={viewer} />
      )}
    </div>
  )
}

function Detail({
  recruit,
  host,
  viewer,
}: {
  recruit: Recruit
  host: boolean
  viewer: Viewer
}) {
  const [modal, setModal] = useState<'edit' | 'close' | 'cancel' | null>(null)
  const closeModal = () => setModal(null)
  const open = isRecruitOpen(recruit)
  // 모집 중이거나 마감된 모집글을 방송 예정 일시 전까지 전체 취소할 수 있다.
  const cancelable =
    (recruit.status === 'RECRUITING' || recruit.status === 'CLOSED') &&
    !isPast(recruit.scheduledAt)

  return (
    <>
      <div className="split">
        <div className="page" style={{ gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <RecruitStatusPill recruit={recruit} />
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 700 }}>{recruit.title}</h1>
            <p className="lede" style={{ whiteSpace: 'pre-wrap' }}>
              {recruit.content}
            </p>
            <a
              className="link"
              href={recruit.hostChannelUrl}
              target="_blank"
              rel="noreferrer"
            >
              {recruit.hostChannelUrl}
            </a>
          </div>
          {host ? (
            <ApplicantList recruit={recruit} />
          ) : (
            <ApplyPanel recruit={recruit} viewer={viewer} />
          )}
        </div>
        <aside className="panel sticky">
          <dl className="kv">
            <dt>1인 출연료</dt>
            <dd className="num">{formatNumber(recruit.feePerPerson)} HP</dd>
            <dt>모집 인원</dt>
            <dd>{recruit.recruitCount}명</dd>
            <dt>성립</dt>
            <dd>
              {recruit.selectedCount} / {recruit.recruitCount}명
            </dd>
            <dt>지원자</dt>
            <dd>{recruit.applicantCount}명</dd>
            <dt>모집 마감</dt>
            <dd>{formatDateTime(recruit.recruitDeadline)}</dd>
            <dt>방송 예정</dt>
            <dd>{formatDateTime(recruit.scheduledAt)}</dd>
            <dt>예상 출연 시간</dt>
            <dd>{recruit.expectedMinutes}분</dd>
          </dl>
          <StatusNote recruit={recruit} host={host} />
          {host && open && (
            <>
              <button
                type="button"
                className="btn block"
                onClick={() => setModal('edit')}
              >
                기본 정보 수정
              </button>
              <button
                type="button"
                className="btn danger block"
                onClick={() => setModal('close')}
              >
                조기 마감
              </button>
            </>
          )}
          {host && cancelable && (
            <button
              type="button"
              className="btn danger block"
              onClick={() => setModal('cancel')}
            >
              모집 전체 취소
            </button>
          )}
        </aside>
      </div>
      {modal === 'edit' && (
        <EditRecruitModal recruit={recruit} onClose={closeModal} />
      )}
      {modal === 'close' && (
        <CloseRecruitModal recruit={recruit} onClose={closeModal} />
      )}
      {modal === 'cancel' && (
        <CancelRecruitModal recruit={recruit} onClose={closeModal} />
      )}
    </>
  )
}

const RELEASE_LABEL: Record<HpReleaseStatus, string> = {
  PENDING: '성립하지 못한 자리분 HP를 돌려받는 중이에요.',
  DONE: '성립하지 못한 자리분 HP를 돌려받았어요.',
  DEAD: '자리분 HP 반환이 늦어지고 있어요. 고객센터로 문의해 주세요.',
}

/** 지금 상태에서 무슨 일이 일어나는지 */
function StatusNote({ recruit, host }: { recruit: Recruit; host: boolean }) {
  // 보류 HP는 호스트 것이라 반환 상태는 호스트에게만 보여 준다.
  const release = host && recruit.hpReleaseStatus && (
    <p className={recruit.hpReleaseStatus === 'DEAD' ? 'fine c-bad' : 'fine'}>
      {RELEASE_LABEL[recruit.hpReleaseStatus]}
    </p>
  )
  switch (recruit.status) {
    case 'RECRUITING':
      if (!isRecruitOpen(recruit))
        return (
          <p className="fine">마감 일시가 지났어요. 곧 기한 마감 처리돼요.</p>
        )
      return host ? (
        <p className="fine">
          지원을 수락하면 바로 출연이 성립해요.{' '}
          {formatDateTime(recruit.recruitDeadline)}에 모집이 마감되고, 성립하지
          못한 자리분 HP를 돌려받아요.
        </p>
      ) : (
        <p className="fine">
          {formatDateTime(recruit.recruitDeadline)}까지 지원할 수 있어요.
        </p>
      )
    case 'CLOSED':
      return (
        <>
          <p className="fine">
            {recruit.closedAt && `${formatDateTime(recruit.closedAt)}에 `}
            {recruit.closeType === 'EARLY'
              ? '호스트가 모집을 조기 마감했어요.'
              : '모집 마감 일시가 지나 마감됐어요.'}
          </p>
          {release}
        </>
      )
    case 'CANCELED':
      return (
        <>
          <p className="fine">모집이 취소됐어요.</p>
          {release}
        </>
      )
    default:
      return null
  }
}
