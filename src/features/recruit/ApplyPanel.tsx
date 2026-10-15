import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { myApplicationsAllQuery } from '@/entities/appearance/api'
import { findMyApplication, isRecruitOpen } from '@/entities/appearance/recruit'
import { APPLY_MESSAGE_MAX } from '@/entities/appearance/rules'
import type { Application, Recruit } from '@/entities/appearance/types'
import { MemberChip } from '@/entities/member/ui/MemberChip'
import { INFLUENCER, type Viewer } from '@/shared/auth/role'
import { formatDateTime } from '@/shared/lib/date'
import { Field } from '@/shared/ui/Field'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import { WithdrawApplicationModal } from './RecruitModals'
import { useApplyRecruit } from './useRecruitActions'

/** 남의 모집글: 호스트 정보와 내 지원 상태·지원하기 */
export function ApplyPanel({
  recruit,
  viewer,
}: {
  recruit: Recruit
  viewer: Viewer
}) {
  return (
    <section className="panel">
      <div className="seller-row">
        <MemberChip memberId={recruit.hostId} />
        <span className="fine">호스트</span>
      </div>
      {viewer === 'USER' ? (
        <>
          <div className="notice">출연 지원은 인플루언서만 할 수 있어요.</div>
          <Link
            className="btn sm"
            style={{ alignSelf: 'flex-start' }}
            to="/verify"
          >
            채널 인증하기
          </Link>
        </>
      ) : (
        INFLUENCER.includes(viewer) && <MyApplication recruit={recruit} />
      )}
    </section>
  )
}

function MyApplication({ recruit }: { recruit: Recruit }) {
  // 상세 응답에 내 지원이 없어 내 지원 전체에서 찾는다(BE 개선 전).
  const { data, error, isPending, refetch } = useQuery(myApplicationsAllQuery)
  if (isPending) return <Loading />
  if (error) return <LoadError error={error} retry={refetch} />
  const mine = findMyApplication(data.content, recruit.id)
  if (mine) return <ApplicationStatus application={mine} />
  return <ApplyForm recruit={recruit} />
}

function ApplyForm({ recruit }: { recruit: Recruit }) {
  const [message, setMessage] = useState('')
  const apply = useApplyRecruit(recruit.id)
  if (!isRecruitOpen(recruit))
    return <div className="notice">모집이 끝나 지원할 수 없어요.</div>
  const full = recruit.selectedCount >= recruit.recruitCount
  return (
    <>
      <Field
        id="ap-msg"
        label="지원 메시지 (선택)"
        hint={`호스트에게 보여요. ${message.length}/${APPLY_MESSAGE_MAX}`}
      >
        <textarea
          id="ap-msg"
          className="textarea"
          maxLength={APPLY_MESSAGE_MAX}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="가능한 시간, 준비할 수 있는 것"
        />
      </Field>
      <button
        type="button"
        className="btn primary"
        style={{ alignSelf: 'flex-start' }}
        disabled={apply.isPending}
        onClick={() => apply.mutate(message.trim())}
      >
        지원하기
      </button>
      <p className="fine">
        {full &&
          '정원이 찼어도 지원할 수 있어요. 자리가 비면 호스트가 수락할 수 있어요. '}
        호스트가 수락하면 바로 출연이 성립해요. 응답 전에는 지원을 취소할 수
        있지만, 취소하거나 거절되면 이 모집글에 다시 지원할 수 없어요.
      </p>
    </>
  )
}

function ApplicationStatus({ application }: { application: Application }) {
  const [withdrawing, setWithdrawing] = useState(false)
  const applied = `${formatDateTime(application.createdAt)}에 지원했어요.`
  switch (application.status) {
    case 'APPLIED':
      return (
        <>
          <div className="notice">
            <span className="pill info">지원 완료</span> 호스트가 수락하면 바로
            출연이 성립해요.
          </div>
          {application.message && (
            <p className="fine">내 메시지: {application.message}</p>
          )}
          <button
            type="button"
            className="btn sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setWithdrawing(true)}
          >
            지원 취소
          </button>
          <p className="fine">
            {applied} 호스트가 응답하기 전에만 취소할 수 있어요.
          </p>
          {withdrawing && (
            <WithdrawApplicationModal
              application={application}
              onClose={() => setWithdrawing(false)}
            />
          )}
        </>
      )
    case 'SELECTED':
      return (
        <div className="notice">
          <span className="pill ok">출연 성립</span> 호스트가 지원을 수락해
          출연이 성립했어요.
          {application.appearanceId !== null &&
            ` (출연 #${application.appearanceId})`}
        </div>
      )
    case 'NOT_SELECTED':
      return (
        <div className="notice">
          선정되지 않았어요. 이 모집글에는 다시 지원할 수 없어요.
        </div>
      )
    case 'WITHDRAWN':
      return (
        <div className="notice">
          지원을 취소했어요. 이 모집글에는 다시 지원할 수 없어요.
        </div>
      )
  }
}
