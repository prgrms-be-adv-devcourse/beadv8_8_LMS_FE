import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import {
  myUpgradeRequestsQuery,
  UPGRADE_REASON_MAX,
} from '@/entities/member/api'
import type { UpgradeRequest } from '@/entities/member/types'
import { UpgradeStatusPill } from '@/entities/member/ui/UpgradeStatusPill'
import { useRequestUpgrade } from '@/features/upgrade/useRequestUpgrade'
import { meQuery } from '@/shared/auth/me'
import { useViewer } from '@/shared/auth/session'
import { formatDate } from '@/shared/lib/date'
import { Field } from '@/shared/ui/Field'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'

/**
 * 승급 신청: 인플루언서 → 인증된 인플루언서(강의 등록·판매). 심사는 관리자 재량이다.
 * 승인되면 BE가 세션 역할을 바꾸므로 내 정보를 다시 불러온다. 이 화면은 인증된 인플루언서도 볼 수 있어
 * 역할이 바뀌어도 "권한 없음"으로 내보내지 않고 완료 안내를 보여 준다.
 */
export function PromotePage() {
  const viewer = useViewer()
  const queryClient = useQueryClient()
  const {
    data: requests,
    error,
    isPending,
    refetch,
  } = useQuery(myUpgradeRequestsQuery)
  const latest = requests?.[0]
  const approvedButStale =
    latest?.status === 'APPROVED' && viewer === 'INFLUENCER'

  useEffect(() => {
    if (approvedButStale)
      void queryClient.invalidateQueries({ queryKey: meQuery.queryKey })
  }, [approvedButStale, queryClient])

  return (
    <div className="page narrow">
      <PageHead
        title="승급 신청"
        lede="인증된 인플루언서가 되면 강의를 등록하고 판매할 수 있어요. 심사 기준은 관리자 재량이에요."
      />
      {isPending ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : viewer === 'VERIFIED_INFLUENCER' ? (
        <div className="notice" role="status">
          <span className="pill ok">승급 완료</span>
          인증된 인플루언서예요. 이제 강의를 등록하고 판매할 수 있어요.
          <Link className="link" to="/studio">
            강의 판매로
          </Link>
        </div>
      ) : (
        <>
          <CurrentStatus latest={latest} />
          {latest?.status !== 'PENDING' && !approvedButStale && (
            <ApplyForm again={latest?.status === 'REJECTED'} />
          )}
        </>
      )}
      {requests && requests.length > 0 && <History requests={requests} />}
    </div>
  )
}

/** 가장 최근 신청의 상태 안내 */
function CurrentStatus({ latest }: { latest: UpgradeRequest | undefined }) {
  if (!latest) return null
  if (latest.status === 'PENDING')
    return (
      <div className="notice warn" role="status">
        <span className="pill warn">심사 중</span>
        {formatDate(latest.requestedAt)}에 신청했어요. 결과가 나오면 이 화면에서
        확인할 수 있어요.
      </div>
    )
  if (latest.status === 'REJECTED')
    return (
      <div className="notice bad" role="status">
        <span className="pill bad">반려</span>
        <span>
          {latest.reviewedAt && `${formatDate(latest.reviewedAt)}에 `}
          반려됐어요.
          {latest.rejectionReason && ` 사유: ${latest.rejectionReason}`} 내용을
          보완해 다시 신청할 수 있어요.
        </span>
      </div>
    )
  return (
    <div className="notice" role="status">
      <span className="pill ok">승인</span>
      승급이 승인됐어요. 계정 정보를 다시 불러오는 중이에요.
    </div>
  )
}

function ApplyForm({ again }: { again: boolean }) {
  const [reason, setReason] = useState('')
  const apply = useRequestUpgrade()
  const trimmed = reason.trim()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!trimmed) return
    apply.mutate(trimmed, { onSuccess: () => setReason('') })
  }

  return (
    <form className="panel form" onSubmit={submit}>
      <Field
        id="upgrade-reason"
        label="승급 신청 사유"
        hint={`만들고 싶은 강의의 주제, 대상, 목차 초안을 적어 주세요. ${reason.length}/${UPGRADE_REASON_MAX}`}
      >
        <textarea
          id="upgrade-reason"
          className="textarea"
          style={{ minHeight: 160 }}
          maxLength={UPGRADE_REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 통기타 라이브 세팅 5강 — 픽업과 마이크를 함께 쓰는 법"
        />
      </Field>
      <button
        type="submit"
        className="btn primary"
        style={{ alignSelf: 'flex-start' }}
        disabled={!trimmed || apply.isPending}
      >
        {again ? '다시 신청' : '승급 신청'}
      </button>
    </form>
  )
}

function History({ requests }: { requests: UpgradeRequest[] }) {
  return (
    <section className="panel">
      <h2>신청 내역</h2>
      <div className="rows">
        {requests.map((r) => (
          <div key={r.id} className="row-item">
            <div className="row-main">
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <UpgradeStatusPill status={r.status} />
                <span className="fine">
                  {formatDate(r.requestedAt)} 신청
                  {r.reviewedAt && ` · ${formatDate(r.reviewedAt)} 처리`}
                </span>
              </span>
              <span
                style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
              >
                {r.requestReason}
              </span>
              {r.rejectionReason && (
                <span className="fine c-bad">
                  반려 사유: {r.rejectionReason}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
