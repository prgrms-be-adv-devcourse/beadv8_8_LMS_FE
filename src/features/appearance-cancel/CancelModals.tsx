import { useState } from 'react'
import { CANCEL_REASON_MAX, penaltyOf } from '@/entities/appearance/rules'
import type { Appearance, Recruit } from '@/entities/appearance/types'
import { formatDateTime } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { Field } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import {
  isConfirmRequired,
  useAcceptAppearanceCancel,
  useCancelRecruit,
  useHostCancelAppearance,
  useRejectAppearanceCancel,
  useRequestAppearanceCancel,
} from './useAppearanceCancel'

type AppearanceProps = { appearance: Appearance; onClose: () => void }

/** 사유 입력란. 필수면 label에 표시하지 않고, 선택이면 "(선택)"을 붙인다 */
function ReasonField({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <Field
      id={id}
      label={label}
      hint={`${hint} ${value.length}/${CANCEL_REASON_MAX}`}
    >
      <textarea
        id={id}
        className="textarea"
        maxLength={CANCEL_REASON_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </Field>
  )
}

/** 출연 취소 요청 (게스트). 사유 필수. 호스트가 수락하면 위약금 없이 합의 취소된다 */
export function RequestCancelModal({ appearance, onClose }: AppearanceProps) {
  const [reason, setReason] = useState('')
  const request = useRequestAppearanceCancel(appearance.id)
  const trimmed = reason.trim()
  return (
    <Modal
      title="출연 취소를 요청할까요?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!trimmed || request.isPending}
            onClick={() => request.mutate(trimmed, { onSuccess: onClose })}
          >
            요청 보내기
          </button>
        </>
      }
    >
      <p>
        {formatDateTime(appearance.scheduledAt)} 방송 출연 취소를 호스트에게
        요청해요. 호스트가 수락하면 위약금 없이 취소되고, 거절하거나 방송 전까지
        답하지 않으면 출연이 유지돼요.
      </p>
      <ReasonField
        id="cancel-request-reason"
        label="취소 사유"
        hint="호스트에게 그대로 전달돼요. 보낸 요청은 철회할 수 없어요."
        value={reason}
        onChange={setReason}
      />
    </Modal>
  )
}

/** 취소 요청 수락 (호스트). 합의 취소, 위약금 없음 */
export function AcceptCancelModal({ appearance, onClose }: AppearanceProps) {
  const accept = useAcceptAppearanceCancel(appearance.id)
  return (
    <Modal
      title="취소 요청을 수락할까요?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={accept.isPending}
            onClick={() => accept.mutate(undefined, { onSuccess: onClose })}
          >
            수락
          </button>
        </>
      }
    >
      <p>
        합의 취소라 위약금이 없어요. 출연 요청이면 출연료 전액을 돌려받고,
        모집이면 마감 전에는 자리가 다시 열리고 마감 뒤에는 그 자리 출연료를
        돌려받아요.
      </p>
    </Modal>
  )
}

/** 취소 요청 거절 (호스트). 사유 선택. 출연은 유지되고 게스트는 1번 더 요청할 수 있다 */
export function RejectCancelModal({ appearance, onClose }: AppearanceProps) {
  const [reason, setReason] = useState('')
  const reject = useRejectAppearanceCancel(appearance.id)
  return (
    <Modal
      title="취소 요청을 거절할까요?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={reject.isPending}
            onClick={() => reject.mutate(reason.trim(), { onSuccess: onClose })}
          >
            거절
          </button>
        </>
      }
    >
      <p>출연이 유지돼요. 게스트는 한 번 더 취소를 요청할 수 있어요.</p>
      <ReasonField
        id="cancel-reject-reason"
        label="거절 사유 (선택)"
        hint="게스트에게 그대로 보여요."
        value={reason}
        onChange={setReason}
        placeholder="예: 이미 홍보가 진행되어 일정 변경이 어려워요."
      />
    </Modal>
  )
}

/** 처리 중인 게스트 취소 요청이 있을 때 다시 묻는 확인 단계 */
function PendingRequestConfirm({ onBack }: { onBack: () => void }) {
  return (
    <div className="notice warn" role="alert">
      <span>
        게스트가 보낸 출연 취소 요청이 처리 중이에요. 그대로 취소하면 그 요청은
        끝나고 게스트에게 위약금이 지급돼요. 요청을 수락하면 위약금 없이 합의
        취소할 수 있어요.
      </span>
      <button type="button" className="btn ghost sm" onClick={onBack}>
        돌아가기
      </button>
    </div>
  )
}

/**
 * 호스트 일방 취소. 위약금(출연료 30%)을 안내하고, 처리 중인 게스트 취소 요청이 있어
 * 409 CANCEL_REQUEST_CONFIRM_REQUIRED가 오면 확인 단계로 바꿔 confirmPendingCancelRequest로 다시 보낸다.
 */
export function HostCancelModal({ appearance, onClose }: AppearanceProps) {
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const cancel = useHostCancelAppearance(appearance.id)
  const penalty = penaltyOf(appearance.fee)
  const send = () =>
    cancel.mutate(
      { reason: reason.trim(), confirmPendingCancelRequest: confirming },
      {
        onSuccess: onClose,
        onError: (error) => {
          if (isConfirmRequired(error)) setConfirming(true)
        },
      },
    )
  return (
    <Modal
      title="출연을 취소할까요?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={cancel.isPending}
            onClick={send}
          >
            {confirming ? '그래도 위약금 내고 취소' : '위약금 내고 취소'}
          </button>
        </>
      }
    >
      <p>
        출연이 성립한 뒤라 위약금이 적용돼요. 출연료의 30%는 게스트에게
        지급되고, 나머지는 돌려받아요.
      </p>
      <div className="breakdown">
        <div className="row sub">
          <span>출연료</span>
          <span className="num">{formatNumber(appearance.fee)}</span>
        </div>
        <div className="row sub">
          <span>게스트에게 위약금 30%</span>
          <span className="num">−{formatNumber(penalty)}</span>
        </div>
        <div className="row total">
          <span>돌려받는 HP</span>
          <b className="num">{formatNumber(appearance.fee - penalty)}</b>
        </div>
      </div>
      {confirming && <PendingRequestConfirm onBack={onClose} />}
      <ReasonField
        id="host-cancel-reason"
        label="취소 사유 (선택)"
        hint="게스트에게 보여요."
        value={reason}
        onChange={setReason}
      />
      <p className="fine">
        안내 금액은 원 단위 미만을 버린 계산이에요. 정산이 늦어져도 취소는 바로
        처리돼요.
      </p>
    </Modal>
  )
}

/**
 * 모집 전체 취소 (호스트). 성립한 출연은 출연마다 일방 취소(위약금 30%)로, 대기 지원은 미선정으로 끝난다.
 * 처리 중인 게스트 취소 요청이 있으면 일방 취소와 같이 확인 후 다시 보낸다.
 */
export function CancelRecruitModal({
  recruit,
  onClose,
}: {
  recruit: Recruit
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const cancel = useCancelRecruit(recruit.id)
  const penaltyPerPerson = penaltyOf(recruit.feePerPerson)
  // 안내용 상한. 실제 위약금은 BE가 진행 중인 출연만 정산한다.
  const penaltyMax = penaltyPerPerson * recruit.selectedCount
  const send = () =>
    cancel.mutate(
      { reason: reason.trim(), confirmPendingCancelRequest: confirming },
      {
        onSuccess: onClose,
        onError: (error) => {
          if (isConfirmRequired(error)) setConfirming(true)
        },
      },
    )
  return (
    <Modal
      title="모집을 취소할까요?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={cancel.isPending}
            onClick={send}
          >
            {confirming ? '그래도 모집 취소' : '모집 취소'}
          </button>
        </>
      }
    >
      <p>대기 중인 지원은 모두 미선정이 되고, 모집글은 다시 열 수 없어요.</p>
      {recruit.selectedCount > 0 ? (
        <>
          <p>
            아직 진행 중인 성립 출연은 출연마다 호스트 취소로 처리돼, 게스트마다
            1인 출연료의 30%를 위약금으로 지급해요. 이미 취소한 출연은 빠져요.
          </p>
          <div className="breakdown">
            <div className="row sub">
              <span>1인 위약금</span>
              <span className="num">{formatNumber(penaltyPerPerson)}</span>
            </div>
            <div className="row sub">
              {/* 일방 취소한 출연도 성립 인원에 남아 있어(BE) 정확한 합계는 알 수 없다 */}
              <span>성립 {recruit.selectedCount}명 기준 최대</span>
              <span className="num">−{formatNumber(penaltyMax)}</span>
            </div>
          </div>
        </>
      ) : (
        <p>성립한 출연이 없어 위약금 없이 보류된 HP를 모두 돌려받아요.</p>
      )}
      {confirming && <PendingRequestConfirm onBack={onClose} />}
      <ReasonField
        id="recruit-cancel-reason"
        label="취소 사유 (선택)"
        hint="성립한 출연의 게스트에게 보여요."
        value={reason}
        onChange={setReason}
      />
      <p className="fine">
        보류 HP 반환이 늦어져도 취소는 바로 처리되고, 진행 상태는 모집 상세에서
        볼 수 있어요.
      </p>
    </Modal>
  )
}
