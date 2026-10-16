import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  appearanceKeys,
  createAppearanceRequest,
  HOLD_PENDING_PARAM,
} from '@/entities/appearance/api'
import {
  CONTENT_MAX,
  EXPECTED_MINUTES_MAX,
  MINIMUM_FEE,
  PENALTY_RATE_PERCENT,
  TITLE_MAX,
  validateRequestForm,
  type RequestFormValues,
} from '@/entities/appearance/rules'
import { myChannelsQuery } from '@/entities/member/api'
import { walletKeys } from '@/entities/wallet/api'
import { chargeHref } from '@/entities/wallet/charge'
import { useHpSpend } from '@/entities/wallet/useHpSpend'
import { HpSpendBreakdown } from '@/entities/wallet/ui/HpSpendBreakdown'
import { isApiError } from '@/shared/api/ApiError'
import { kstLocalInput, toServerDateTime } from '@/shared/lib/date'
import { useFieldErrors } from '@/shared/lib/useFieldErrors'
import { Avatar } from '@/shared/ui/Avatar'
import { Field } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { toast } from '@/shared/ui/toastStore'

type RequestFormModalProps = {
  guest: { id: number; nickname: string; profileImageUrl: string | null }
  onClose: () => void
}

/** 화면 순서대로 둔 입력칸과 그 id */
const FIELD_ORDER = [
  'title',
  'fee',
  'scheduledAt',
  'expectedMinutes',
  'acceptDeadline',
  'hostChannelUrl',
  'content',
] as const satisfies readonly (keyof RequestFormValues)[]
const FIELD_ID: Record<keyof RequestFormValues, string> = {
  title: 'rq-title',
  fee: 'rq-fee',
  scheduledAt: 'rq-air',
  expectedMinutes: 'rq-minutes',
  acceptDeadline: 'rq-deadline',
  hostChannelUrl: 'rq-channel',
  content: 'rq-content',
}

/** 인플루언서에게 1:1 출연 요청 보내기. 보내면 출연료만큼 HP가 보류된다. */
export function RequestFormModal({ guest, onClose }: RequestFormModalProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: channels } = useQuery(myChannelsQuery)
  const myChannel = channels?.find((c) => c.status === 'APPROVED')
  const [values, setValues] = useState<RequestFormValues>(() => ({
    title: '',
    hostChannelUrl: '',
    scheduledAt: kstLocalInput(7, '21:00'),
    expectedMinutes: '60',
    content: '',
    fee: String(MINIMUM_FEE),
    acceptDeadline: kstLocalInput(5, '23:59'),
  }))
  // 내 채널 주소는 직접 고치기 전까지 승인된 채널로 채운다.
  const [urlTouched, setUrlTouched] = useState(false)
  const formValues = {
    ...values,
    hostChannelUrl:
      urlTouched || !myChannel ? values.hostChannelUrl : myChannel.channelUrl,
  }
  const [shortHp, setShortHp] = useState(false)
  const fields = useFieldErrors({
    ids: FIELD_ID,
    order: FIELD_ORDER,
    errors: validateRequestForm(formValues, kstLocalInput()),
  })
  const fee = Number(values.fee) || 0
  const spend = useHpSpend(fee)

  const send = useMutation({
    mutationFn: () =>
      createAppearanceRequest({
        guestId: guest.id,
        title: formValues.title.trim(),
        hostChannelUrl: formValues.hostChannelUrl.trim(),
        scheduledAt: toServerDateTime(formValues.scheduledAt),
        expectedMinutes: Number(formValues.expectedMinutes),
        content: formValues.content.trim(),
        fee,
        acceptDeadline: toServerDateTime(formValues.acceptDeadline),
      }),
    onSuccess: (created) => {
      toast(`${guest.nickname} 님에게 출연 요청을 보냈어요.`)
      // HP 보류가 끝나기 전(HOLD_PENDING)인 요청서는 상세를 볼 수 없어 목록에서 결과를 기다린다.
      navigate(
        created.status === 'REQUESTED'
          ? `/appearances/requests/${created.id}`
          : `/appearances?tab=host&${HOLD_PENDING_PARAM}=1`,
      )
    },
    onError: (error) => {
      if (isApiError(error, 'INSUFFICIENT_BALANCE')) return setShortHp(true)
      if (isApiError(error, 'BILLING_UNAVAILABLE')) {
        // 실패가 아니라 결과 미확정: BE는 요청서를 저장했고 HP 보류만 늦어지고 있다.
        // 다시 보내면 중복 요청이 되므로 입력창을 닫고, 보낸 요청 목록에서 결과를 확인하게 한다.
        onClose()
        navigate(`/appearances?tab=host&${HOLD_PENDING_PARAM}=1`)
        return
      }
      fields.applyServerErrors(error)
      toast(error.message)
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: appearanceKeys.all }),
        queryClient.invalidateQueries({ queryKey: walletKeys.all }),
      ]),
  })

  const set =
    (key: keyof RequestFormValues) => (e: { target: { value: string } }) => {
      if (key === 'hostChannelUrl') setUrlTouched(true)
      if (key === 'fee') setShortHp(false)
      const value =
        key === 'fee' || key === 'expectedMinutes'
          ? e.target.value.replace(/\D/g, '')
          : e.target.value
      fields.changed(key)
      setValues((prev) => ({ ...prev, [key]: value }))
    }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (fields.blockSubmit()) return
    if (spend.ready && spend.short === 0) send.mutate()
  }

  const blockedByHp = spend.ready && (spend.short > 0 || shortHp)

  return (
    <Modal
      title="출연 요청 보내기"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            취소
          </button>
          {blockedByHp ? (
            <Link
              className="btn primary"
              to={spend.short > 0 ? chargeHref(spend.short) : '/wallet'}
            >
              HP 충전하러 가기
            </Link>
          ) : (
            <button
              type="submit"
              form="appearance-request-form"
              className="btn primary"
              disabled={!spend.ready || send.isPending}
              {...fields.submitProps}
            >
              {!spend.ready
                ? spend.error
                  ? '잔액을 확인하지 못했어요'
                  : '잔액 확인 중…'
                : `${fee.toLocaleString()} HP 보류하고 요청`}
            </button>
          )}
        </>
      }
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Avatar name={guest.nickname} imageUrl={guest.profileImageUrl} />
        <b>{guest.nickname}</b>
        <span className="fine">님에게 요청해요</span>
      </div>
      <form
        {...fields.formProps}
        id="appearance-request-form"
        className="form"
        noValidate
        onSubmit={submit}
      >
        <Field id="rq-title" label="제목" error={fields.error('title')}>
          <input
            {...fields.inputProps('title')}
            className="input"
            maxLength={TITLE_MAX}
            value={formValues.title}
            onChange={set('title')}
            placeholder="예: 주말 게임 합방 출연 요청"
          />
        </Field>
        <Field
          id="rq-fee"
          label="출연료 (HP)"
          error={fields.error('fee')}
          hint={`최저 ${MINIMUM_FEE.toLocaleString()} HP`}
        >
          <input
            {...fields.inputProps('fee')}
            className="input num"
            inputMode="numeric"
            value={formValues.fee}
            onChange={set('fee')}
          />
        </Field>
        <div className="form-row">
          <Field
            id="rq-air"
            label="방송 예정 일시"
            error={fields.error('scheduledAt')}
          >
            <input
              {...fields.inputProps('scheduledAt')}
              type="datetime-local"
              className="input"
              value={formValues.scheduledAt}
              onChange={set('scheduledAt')}
            />
          </Field>
          <Field
            id="rq-minutes"
            label="예상 출연 시간 (분)"
            error={fields.error('expectedMinutes')}
          >
            <input
              {...fields.inputProps('expectedMinutes')}
              className="input num"
              inputMode="numeric"
              max={EXPECTED_MINUTES_MAX}
              value={formValues.expectedMinutes}
              onChange={set('expectedMinutes')}
            />
          </Field>
        </div>
        <Field
          id="rq-deadline"
          label="수락 기한"
          error={fields.error('acceptDeadline')}
          hint="기한까지 수락하지 않으면 보류한 HP를 돌려받아요."
        >
          <input
            {...fields.inputProps('acceptDeadline')}
            type="datetime-local"
            className="input"
            value={formValues.acceptDeadline}
            onChange={set('acceptDeadline')}
          />
        </Field>
        <Field
          id="rq-channel"
          label="내 채널 주소"
          error={fields.error('hostChannelUrl')}
          hint={myChannel ? '승인된 내 채널로 채웠어요.' : undefined}
        >
          <input
            {...fields.inputProps('hostChannelUrl')}
            className="input"
            inputMode="url"
            value={formValues.hostChannelUrl}
            onChange={set('hostChannelUrl')}
            placeholder="https://chzzk.naver.com/..."
          />
        </Field>
        <Field
          id="rq-content"
          label="요청 내용"
          error={fields.error('content')}
        >
          <textarea
            {...fields.inputProps('content')}
            className="textarea"
            maxLength={CONTENT_MAX}
            value={formValues.content}
            onChange={set('content')}
            placeholder="방송 주제, 진행 방식, 준비물"
          />
        </Field>
      </form>
      {shortHp && (
        <div className="notice bad" role="alert">
          HP가 부족해 요청을 보내지 못했어요. 충전한 뒤 다시 보내 주세요.
        </div>
      )}
      <HpSpendBreakdown
        spend={spend}
        label="보류할 출연료"
        note={`게스트가 수락하면 출연이 성립해요. 거절·만료·취소되면 보류한 HP를 쓴 종류 그대로 돌려받아요. 성립 후 호스트가 취소하면 출연료의 ${PENALTY_RATE_PERCENT}%가 위약금으로 게스트에게 지급돼요.`}
      />
    </Modal>
  )
}
