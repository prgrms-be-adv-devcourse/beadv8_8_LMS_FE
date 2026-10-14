import { useState } from 'react'
import { formatDate } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { Modal } from '@/shared/ui/Modal'
import { toast } from '@/shared/ui/toastStore'
import {
  useCancelPurchase,
  useConfirmPurchase,
  useConsentToPlay,
  type PurchaseRef,
} from './usePurchaseActions'

type BaseProps = {
  item: PurchaseRef & { title: string }
  onClose: () => void
}

export function ConfirmPurchaseModal({
  item,
  payoutScheduledAt,
  onClose,
}: BaseProps & { payoutScheduledAt?: string }) {
  const confirm = useConfirmPurchase()
  return (
    <Modal
      title="구매를 확정할까요?"
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
            onClick={() =>
              confirm.mutate(item, {
                onSuccess: () => {
                  onClose()
                  toast('구매를 확정했어요. 이제 리뷰를 쓸 수 있어요.')
                },
              })
            }
          >
            구매 확정
          </button>
        </>
      }
    >
      <p>
        <b>{item.title}</b> 구매를 확정하면 단순 변심으로 구매 취소할 수 없어요.
      </p>
      {payoutScheduledAt && (
        <p className="fine">
          판매자 지급은 {formatDate(payoutScheduledAt)}에 이뤄져요. 그 전까지
          강의 내용이 소개와 다르면 고객센터로 이의 제기할 수 있어요.
        </p>
      )}
    </Modal>
  )
}

export function CancelPurchaseModal({
  item,
  priceHp,
  onClose,
}: BaseProps & { priceHp?: number }) {
  const cancel = useCancelPurchase()
  return (
    <Modal
      title="구매를 취소할까요?"
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
            onClick={() =>
              cancel.mutate(item, {
                onSuccess: () => {
                  onClose()
                  toast('구매를 취소했어요. 결제한 HP를 돌려받았어요.')
                },
              })
            }
          >
            구매 취소
          </button>
        </>
      }
    >
      <p>
        <b>{item.title}</b> 구매를 취소하면 보류된 HP를 결제한 HP 종류(수익
        HP·충전 HP) 그대로 돌려받아요. 현금 환불은 지갑에서 따로 신청해요.
      </p>
      {priceHp !== undefined && (
        <div className="breakdown">
          <div className="row total">
            <span>돌려받는 HP</span>
            <b className="num">{formatNumber(priceHp)} HP</b>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** 첫 재생·자료 다운로드 전에 받는 동의. 동의하면 구매가 확정된다(FIRST_PLAY). */
export function PlayConsentModal({
  item,
  payoutScheduledAt,
  onClose,
  onConsented,
}: BaseProps & { payoutScheduledAt?: string; onConsented: () => void }) {
  const [agreed, setAgreed] = useState(false)
  const consent = useConsentToPlay()
  return (
    <Modal
      title="재생하면 구매가 확정돼요"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            나중에 볼게요
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!agreed || consent.isPending}
            onClick={() =>
              consent.mutate(item, {
                onSuccess: () => {
                  toast('구매가 확정됐어요. 재생을 시작해요.')
                  onConsented()
                },
              })
            }
          >
            동의하고 재생
          </button>
        </>
      }
    >
      <p>
        지금 영상을 재생하거나 자료를 내려받으면 <b>{item.title}</b> 구매가
        확정돼요. 확정 후에는 단순 변심으로 구매 취소할 수 없어요.
      </p>
      {payoutScheduledAt && (
        <p className="fine">
          강의 내용이 소개와 다르면 {formatDate(payoutScheduledAt)} 전까지
          고객센터로 이의 제기할 수 있어요.
        </p>
      )}
      <label className="consent">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>
          재생하면 구매가 확정되어 단순 변심으로 취소할 수 없다는 데 동의해요.
        </span>
      </label>
    </Modal>
  )
}
