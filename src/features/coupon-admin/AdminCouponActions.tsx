import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import type { AdminCouponAction } from '@/entities/coupon/api'
import {
  discountLabel,
  issuePeriodLabel,
  REJECT_REASON_MAX,
} from '@/entities/coupon/rules'
import type { Coupon } from '@/entities/coupon/types'
import { promotionWalletQuery } from '@/entities/wallet/promotionWalletApi'
import { formatNumber } from '@/shared/lib/money'
import { Field } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import {
  ACTION_TEXT,
  couponActionMessage,
  useAdminCouponAction,
  useRejectCoupon,
} from './useAdminCouponActions'
import { useCouponRetryStore, type PendingRetry } from './retryStore'
import styles from './AdminCouponActions.module.css'

/**
 * 상태별로 할 수 있는 조작.
 * 열기는 관리자가 만든 플랫폼 쿠폰(DRAFT)만이다. 판매자 쿠폰은 판매자가 심사를 요청해야(REVIEW) 승인·반려할 수 있다.
 */
function actionsOf(coupon: Coupon): (AdminCouponAction | 'reject')[] {
  switch (coupon.status) {
    case 'DRAFT':
      return coupon.type === 'PLATFORM' ? ['open'] : []
    case 'REVIEW':
      return ['reject', 'approve']
    case 'OPEN':
      return ['suspend', 'close']
    case 'SUSPENDED':
      return ['resume', 'close']
    default:
      return []
  }
}

/** 앞으로 나아가는 조작(열기·승인·재개)은 강조 버튼으로 둔다 */
const PRIMARY = new Set<string>(['open', 'approve', 'resume'])

const retryLabel = (retry: PendingRetry) =>
  `다시 시도(${ACTION_TEXT[retry.action].label})`

export function AdminCouponActions({ coupon }: { coupon: Coupon }) {
  const action = useAdminCouponAction(coupon.couponId, coupon.name)
  const retry = useCouponRetryStore((s) =>
    Object.hasOwn(s, coupon.couponId) ? s[coupon.couponId] : undefined,
  )
  const [modal, setModal] = useState<
    'reject' | 'close' | 'open' | 'approve' | null
  >(null)
  const actions = actionsOf(coupon)
  // 실패한 열기·승인·재개 뒤 상태가 이미 OPEN이면 원래 버튼이 없어지므로 같은 요청을 다시 보내는 버튼을 따로 둔다.
  // 상태가 그대로면 원래 버튼이 곧 다시 시도다.
  const showRetry =
    retry !== undefined &&
    coupon.status === 'OPEN' &&
    !actions.includes(retry.action)
  const message = action.error
    ? couponActionMessage(action.error, action.variables)
    : retry?.message
  if (actions.length === 0 && !showRetry) return null

  // 성공 안내는 훅이 띄운다. 여기서는 열린 확인창만 닫는다(오류는 버튼 아래에 보인다).
  const run = (next: AdminCouponAction, onDone?: () => void) =>
    action.mutate(next, { onSettled: onDone })

  return (
    <div className={styles.wrap}>
      <div className="row-actions">
        {showRetry && (
          <button
            type="button"
            className="btn primary sm"
            disabled={action.isPending}
            onClick={() => run(retry.action)}
          >
            {retryLabel(retry)}
          </button>
        )}
        {actions.map((a) =>
          a === 'reject' ? (
            <button
              key={a}
              type="button"
              className="btn sm"
              disabled={action.isPending}
              onClick={() => setModal('reject')}
            >
              반려
            </button>
          ) : (
            <button
              key={a}
              type="button"
              className={PRIMARY.has(a) ? 'btn primary sm' : 'btn sm'}
              disabled={action.isPending}
              onClick={() =>
                a === 'close' || a === 'open' || a === 'approve'
                  ? setModal(a)
                  : run(a)
              }
            >
              {ACTION_TEXT[a].label}
            </button>
          ),
        )}
      </div>
      {message && (
        <p className="fine c-bad" role="alert">
          {message}
        </p>
      )}
      {modal === 'reject' && (
        <RejectCouponModal coupon={coupon} onClose={() => setModal(null)} />
      )}
      {(modal === 'open' || modal === 'approve') && (
        <StartIssueModal
          coupon={coupon}
          action={modal}
          pending={action.isPending}
          onConfirm={() => run(modal, () => setModal(null))}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'close' && (
        <Modal
          title="쿠폰을 종료할까요?"
          onClose={() => setModal(null)}
          footer={
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setModal(null)}
              >
                닫기
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={action.isPending}
                onClick={() => run('close', () => setModal(null))}
              >
                종료
              </button>
            </>
          }
        >
          <p>
            <b>{coupon.name}</b> 쿠폰의 발급을 끝내요. 종료하면 다시 열 수
            없어요.
          </p>
        </Modal>
      )}
    </div>
  )
}

/**
 * 열기·승인 확인. 발급이 시작되고, 플랫폼 쿠폰은 프로모션 지갑 가용 잔액에서 쿠폰 예산을 예약한다(판매자 쿠폰은 예약하지 않는다).
 * 끝나면(실패해도) 닫는다. 실패 문구와 다시 시도는 버튼 아래에 남는다.
 */
function StartIssueModal({
  coupon,
  action,
  pending,
  onConfirm,
  onClose,
}: {
  coupon: Coupon
  action: 'open' | 'approve'
  pending: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const label = ACTION_TEXT[action].label
  const platform = coupon.type === 'PLATFORM'
  return (
    <Modal
      title={`쿠폰을 ${action === 'open' ? '열까요' : '승인할까요'}?`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={pending}
            onClick={onConfirm}
          >
            {label}
          </button>
        </>
      }
    >
      <dl className="kv">
        <dt>쿠폰</dt>
        <dd>{coupon.name}</dd>
        <dt>할인</dt>
        <dd>{discountLabel(coupon)}</dd>
        <dt>수량</dt>
        <dd className="num">{formatNumber(coupon.quantity)}장</dd>
        <dt>발급 기간</dt>
        <dd>{issuePeriodLabel(coupon)}</dd>
        {platform && (
          <>
            <dt>프로모션 지갑 가용 잔액</dt>
            <dd className="num">
              <PromotionAvailable />
            </dd>
          </>
        )}
      </dl>
      <p className="notice warn">
        {action === 'open' ? '열면' : '승인하면'} 지금부터 발급돼요.
        {platform &&
          ' 할인에 쓸 쿠폰 예산을 가용 잔액에서 예약하고, 잔액이 모자라면 열리지 않아요.'}
      </p>
    </Modal>
  )
}

/** 쿠폰 예산을 예약할 프로모션 지갑 가용 잔액 */
function PromotionAvailable() {
  const { data, isPending, error } = useQuery(promotionWalletQuery())
  if (isPending) return <>불러오는 중…</>
  if (error) return <>확인하지 못했어요</>
  return <>{formatNumber(data.availableHp)} HP</>
}

/** 반려 사유(1~500자)는 신청한 판매자에게 보인다 */
function RejectCouponModal({
  coupon,
  onClose,
}: {
  coupon: Coupon
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const reject = useRejectCoupon(coupon.couponId)
  const trimmed = reason.trim()
  const tooLong = trimmed.length > REJECT_REASON_MAX

  return (
    <Modal
      title="쿠폰을 반려할까요?"
      onClose={onClose}
      dismissOnScrim={false}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={!trimmed || tooLong || reject.isPending}
            onClick={() => reject.mutate(trimmed, { onSuccess: onClose })}
          >
            반려
          </button>
        </>
      }
    >
      <p>
        <b>{coupon.name}</b>
      </p>
      <Field
        id="coupon-reject-reason"
        label="반려 사유"
        error={
          tooLong
            ? `반려 사유는 ${REJECT_REASON_MAX}자까지 쓸 수 있어요.`
            : undefined
        }
        hint={`신청자에게 그대로 보여요. ${reason.length}/${REJECT_REASON_MAX}`}
      >
        <textarea
          id="coupon-reject-reason"
          className="textarea"
          maxLength={REJECT_REASON_MAX}
          value={reason}
          aria-invalid={tooLong || undefined}
          onChange={(e) => {
            reject.reset()
            setReason(e.target.value)
          }}
          placeholder="예: 할인율이 강의 가격에 비해 너무 높아요."
        />
      </Field>
      {reject.error && (
        <div className="notice bad" role="alert">
          {couponActionMessage(reject.error, 'reject')}
        </div>
      )}
    </Modal>
  )
}

/**
 * 목록에 보이지 않는 쿠폰의 실패한 열기·승인·재개. 예를 들어 심사 중 목록에서 승인했는데 BE가 OPEN만 저장하고 실패하면
 * 다시 불러온 목록에서 그 쿠폰이 빠진다. 여기서 같은 요청을 다시 보내 마무리한다.
 */
export function CouponRetryNotices({ shown }: { shown: readonly number[] }) {
  const retries = useCouponRetryStore()
  const hidden = Object.entries(retries)
    .map(([id, retry]) => [Number(id), retry] as const)
    .filter(([id]) => !shown.includes(id))
  if (hidden.length === 0) return null
  return (
    <>
      {hidden.map(([couponId, retry]) => (
        <RetryNotice key={couponId} couponId={couponId} retry={retry} />
      ))}
    </>
  )
}

function RetryNotice({
  couponId,
  retry,
}: {
  couponId: number
  retry: PendingRetry
}) {
  const action = useAdminCouponAction(couponId, retry.name)
  return (
    <div className="notice bad" role="alert">
      <span>
        <Link to={`/admin/coupons/${couponId}`}>{retry.name}</Link>{' '}
        {ACTION_TEXT[retry.action].label} 요청을 마치지 못했어요.{' '}
        {action.error
          ? couponActionMessage(action.error, retry.action)
          : retry.message}
      </span>
      <button
        type="button"
        className="btn sm"
        disabled={action.isPending}
        onClick={() => action.mutate(retry.action)}
      >
        {retryLabel(retry)}
      </button>
    </div>
  )
}
