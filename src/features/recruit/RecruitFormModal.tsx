import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  appearanceKeys,
  createRecruit,
  HOLD_PENDING_PARAM,
} from '@/entities/appearance/api'
import {
  CONTENT_MAX,
  EXPECTED_MINUTES_MAX,
  MINIMUM_FEE,
  PENALTY_RATE_PERCENT,
  RECRUIT_COUNT_MAX,
  TITLE_MAX,
  validateRecruitForm,
  type RecruitFormValues,
} from '@/entities/appearance/rules'
import { myChannelsQuery } from '@/entities/member/api'
import { walletKeys } from '@/entities/wallet/api'
import { chargeHref } from '@/entities/wallet/charge'
import { useHpSpend } from '@/entities/wallet/useHpSpend'
import { HpSpendBreakdown } from '@/entities/wallet/ui/HpSpendBreakdown'
import { isApiError } from '@/shared/api/ApiError'
import { kstLocalInput, toServerDateTime } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { useFieldErrors } from '@/shared/lib/useFieldErrors'
import { Field } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { toast } from '@/shared/ui/toastStore'

const HOLD_PENDING_PATH = `/recruits?tab=mine&${HOLD_PENDING_PARAM}=1`

/** 화면 순서대로 둔 입력칸. 앞 칸을 건너뛰고 아래 칸에 포커스하면 건너뛴 첫 오류 칸을 보여 준다 */
const FIELD_ORDER = [
  'title',
  'feePerPerson',
  'recruitCount',
  'recruitDeadline',
  'scheduledAt',
  'expectedMinutes',
  'hostChannelUrl',
  'content',
] as const satisfies readonly (keyof RecruitFormValues)[]

/** 칸 이름 → 입력칸 id (오류 문구 id는 `${id}-error`) */
const FIELD_ID: Record<keyof RecruitFormValues, string> = {
  title: 'rn-title',
  feePerPerson: 'rn-fee',
  recruitCount: 'rn-seats',
  recruitDeadline: 'rn-deadline',
  scheduledAt: 'rn-air',
  expectedMinutes: 'rn-minutes',
  hostChannelUrl: 'rn-channel',
  content: 'rn-content',
}

/** 출연 모집글 올리기. 올리면 1인 출연료 × 모집 인원만큼 HP가 보류된다. */
export function RecruitFormModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: channels } = useQuery(myChannelsQuery)
  const myChannel = channels?.find((c) => c.status === 'APPROVED')
  const [values, setValues] = useState<RecruitFormValues>(() => ({
    title: '',
    hostChannelUrl: '',
    scheduledAt: kstLocalInput(13, '21:00'),
    expectedMinutes: '60',
    content: '',
    feePerPerson: String(MINIMUM_FEE),
    recruitCount: '2',
    recruitDeadline: kstLocalInput(10, '23:59'),
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
    errors: validateRecruitForm(formValues, kstLocalInput()),
  })
  const fee = Number(values.feePerPerson) || 0
  const count = Number(values.recruitCount) || 0
  // 보여 주기용 합계. 실제 보류 금액은 BE가 계산한다.
  const spend = useHpSpend(fee * count)

  const post = useMutation({
    mutationFn: () =>
      createRecruit({
        title: formValues.title.trim(),
        hostChannelUrl: formValues.hostChannelUrl.trim(),
        scheduledAt: toServerDateTime(formValues.scheduledAt),
        expectedMinutes: Number(formValues.expectedMinutes),
        content: formValues.content.trim(),
        feePerPerson: fee,
        recruitCount: count,
        recruitDeadline: toServerDateTime(formValues.recruitDeadline),
      }),
    onSuccess: (created) => {
      toast('모집글을 올렸어요.')
      if (created.status === 'RECRUITING') navigate(`/recruits/${created.id}`)
      else {
        // 보류가 끝나기 전인 모집글은 상세를 볼 수 없어 내 모집글에서 결과를 기다린다.
        onClose()
        navigate(HOLD_PENDING_PATH)
      }
    },
    onError: (error) => {
      if (isApiError(error, 'INSUFFICIENT_BALANCE')) return setShortHp(true)
      if (isApiError(error, 'BILLING_UNAVAILABLE')) {
        // 실패가 아니라 결과 미확정: BE는 모집글을 저장했고 HP 보류만 늦어지고 있다.
        // 다시 올리면 중복 모집글이 되므로 입력창을 닫고, 내 모집글에서 결과를 확인하게 한다.
        onClose()
        navigate(HOLD_PENDING_PATH)
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

  const numeric = new Set<keyof RecruitFormValues>([
    'feePerPerson',
    'recruitCount',
    'expectedMinutes',
  ])
  const set =
    (key: keyof RecruitFormValues) => (e: { target: { value: string } }) => {
      if (key === 'hostChannelUrl') setUrlTouched(true)
      if (key === 'feePerPerson' || key === 'recruitCount') setShortHp(false)
      const value = numeric.has(key)
        ? e.target.value.replace(/\D/g, '')
        : e.target.value
      fields.changed(key)
      setValues((prev) => ({ ...prev, [key]: value }))
    }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (fields.blockSubmit()) return
    if (spend.ready && spend.short === 0) post.mutate()
  }

  /** 입력칸 공통 속성: 오류 표시 속성과 값 바꾸기 */
  const fieldProps = (key: keyof RecruitFormValues) => ({
    ...fields.inputProps(key),
    onChange: set(key),
  })

  const blockedByHp = spend.ready && (spend.short > 0 || shortHp)

  return (
    <Modal
      title="모집글 올리기"
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
              form="recruit-form"
              className="btn primary"
              disabled={!spend.ready || post.isPending}
              {...fields.submitProps}
            >
              {!spend.ready
                ? spend.error
                  ? '잔액을 확인하지 못했어요'
                  : '잔액 확인 중…'
                : `${formatNumber(fee * count)} HP 보류하고 게시`}
            </button>
          )}
        </>
      }
    >
      <form
        {...fields.formProps}
        id="recruit-form"
        className="form"
        noValidate
        onSubmit={submit}
      >
        <Field id="rn-title" label="제목" error={fields.error('title')}>
          <input
            {...fieldProps('title')}
            className="input"
            maxLength={TITLE_MAX}
            value={formValues.title}
            placeholder="예: 금요일 밤 노래 릴레이 3인"
          />
        </Field>
        <div className="form-row">
          <Field
            id="rn-fee"
            label="1인 출연료 (HP)"
            error={fields.error('feePerPerson')}
            hint={`최저 ${MINIMUM_FEE.toLocaleString()} HP`}
          >
            <input
              {...fieldProps('feePerPerson')}
              className="input num"
              inputMode="numeric"
              value={formValues.feePerPerson}
            />
          </Field>
          <Field
            id="rn-seats"
            label="모집 인원"
            error={fields.error('recruitCount')}
            hint={`최대 ${RECRUIT_COUNT_MAX}명`}
          >
            <input
              {...fieldProps('recruitCount')}
              className="input num"
              inputMode="numeric"
              value={formValues.recruitCount}
            />
          </Field>
        </div>
        <div className="form-row">
          <Field
            id="rn-deadline"
            label="모집 마감 일시"
            error={fields.error('recruitDeadline')}
            hint="마감하면 채우지 못한 자리의 출연료를 돌려받아요."
          >
            <input
              {...fieldProps('recruitDeadline')}
              type="datetime-local"
              className="input"
              value={formValues.recruitDeadline}
            />
          </Field>
          <Field
            id="rn-air"
            label="방송 예정 일시"
            error={fields.error('scheduledAt')}
          >
            <input
              {...fieldProps('scheduledAt')}
              type="datetime-local"
              className="input"
              value={formValues.scheduledAt}
            />
          </Field>
        </div>
        <div className="form-row">
          <Field
            id="rn-minutes"
            label="예상 출연 시간 (분)"
            error={fields.error('expectedMinutes')}
          >
            <input
              {...fieldProps('expectedMinutes')}
              className="input num"
              inputMode="numeric"
              max={EXPECTED_MINUTES_MAX}
              value={formValues.expectedMinutes}
            />
          </Field>
          <Field
            id="rn-channel"
            label="내 채널 주소"
            error={fields.error('hostChannelUrl')}
            hint={myChannel ? '승인된 내 채널로 채웠어요.' : undefined}
          >
            <input
              {...fieldProps('hostChannelUrl')}
              className="input"
              inputMode="url"
              value={formValues.hostChannelUrl}
              placeholder="https://chzzk.naver.com/..."
            />
          </Field>
        </div>
        <Field
          id="rn-content"
          label="콘텐츠 설명"
          error={fields.error('content')}
        >
          <textarea
            {...fieldProps('content')}
            className="textarea"
            maxLength={CONTENT_MAX}
            value={formValues.content}
            placeholder="방송 주제, 진행 방식, 필요한 장비"
          />
        </Field>
      </form>
      {shortHp && (
        <div className="notice bad" role="alert">
          HP가 부족해 모집글을 올리지 못했어요. 충전한 뒤 다시 올려 주세요.
        </div>
      )}
      <HpSpendBreakdown
        spend={spend}
        label={`보류할 HP (${formatNumber(fee)} × ${count}명)`}
        note={`게스트의 지원을 수락하면 바로 출연이 성립해요. 마감하면 채우지 못한 자리의 출연료를 쓴 종류 그대로 돌려받아요. 성립 후 호스트가 취소하면 1인 출연료의 ${PENALTY_RATE_PERCENT}%를 위약금으로 지급해요.`}
      />
    </Modal>
  )
}
