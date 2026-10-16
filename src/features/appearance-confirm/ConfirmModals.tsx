import { useState } from 'react'
import { CANCEL_REASON_MAX } from '@/entities/appearance/rules'
import type { Appearance } from '@/entities/appearance/types'
import { formatNumber } from '@/shared/lib/money'
import { Field } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import {
  isConfirmClosed,
  useConfirmAppearance,
  useMarkAbsent,
} from './useAppearanceConfirm'

type Props = { appearance: Appearance; onClose: () => void }

function FinalNotice() {
  return (
    <div className="notice warn">
      <span>
        출연 확인과 불참은 한 번만 고를 수 있고, 처리한 뒤에는 바꿀 수 없어요.
      </span>
    </div>
  )
}

/** 성공하면 닫고, 이미 응답했거나 기간 밖이라는 응답이면 다시 시도할 수 없으니 닫는다(상세는 새로 불러온다) */
const closeHandlers = (onClose: () => void) => ({
  onSuccess: onClose,
  onError: (error: Error) => {
    if (isConfirmClosed(error)) onClose()
  },
})

/** 출연 확인 (호스트). 게스트에게 출연료가 지급된다 */
export function ConfirmAppearanceModal({ appearance, onClose }: Props) {
  const confirm = useConfirmAppearance(appearance.id)
  return (
    <Modal
      title="출연을 확인할까요?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={confirm.isPending}
            onClick={() => confirm.mutate(undefined, closeHandlers(onClose))}
          >
            출연 확인
          </button>
        </>
      }
    >
      <p>
        게스트가 방송에 출연했다면 확인해 주세요. 보류된 출연료{' '}
        {formatNumber(appearance.fee)} HP가 게스트에게 지급돼요.
      </p>
      <FinalNotice />
      <p className="fine">
        지급이 늦어져도 확인은 바로 처리되고, 진행 상태는 출연 상세에서 볼 수
        있어요.
      </p>
    </Modal>
  )
}

/** 불참 (호스트). 사유 선택, 출연료는 호스트에게 돌아간다 */
export function AbsentModal({ appearance, onClose }: Props) {
  const [reason, setReason] = useState('')
  const absent = useMarkAbsent(appearance.id)
  return (
    <Modal
      title="불참으로 처리할까요?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={absent.isPending}
            onClick={() => absent.mutate(reason.trim(), closeHandlers(onClose))}
          >
            불참 처리
          </button>
        </>
      }
    >
      <p>
        게스트가 방송에 출연하지 않았다면 불참으로 처리해요. 보류된 출연료{' '}
        {formatNumber(appearance.fee)} HP를 돌려받아요.
      </p>
      <FinalNotice />
      <Field
        id="absent-reason"
        label="불참 사유 (선택)"
        hint={`게스트에게 보여요. ${reason.length}/${CANCEL_REASON_MAX}`}
      >
        <textarea
          id="absent-reason"
          className="textarea"
          maxLength={CANCEL_REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 방송 시작 시각까지 연락이 되지 않았어요."
        />
      </Field>
      <p className="fine">
        게스트가 불참 처리에 이의가 있으면 고객센터에서 확인해요.
      </p>
    </Modal>
  )
}
