import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { couponKeys, createSellerCoupon } from '@/entities/coupon/api'
import {
  COUPON_NAME_MAX,
  EXPIRY_DAYS_MAX,
  EXPIRY_DAYS_MIN,
  RATE_MAX,
  RATE_MIN,
  toCouponInput,
  validateCouponForm,
  type CouponFormValues,
} from '@/entities/coupon/rules'
import type { Coupon } from '@/entities/coupon/types'
import { lectureKeys } from '@/entities/lecture/api'
import { isApiError } from '@/shared/api/ApiError'
import { kstLocalInput } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { useFieldErrors } from '@/shared/lib/useFieldErrors'
import { Field } from '@/shared/ui/Field'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import { isOnSale, type MyLectureOptions } from './useMyLectureOptions'

/** 화면 순서대로 둔 입력칸(오류를 보일 수 있는 칸만). 대상·할인 방식·만료 방식·중첩은 고르는 칸이라 오류가 없다 */
const FIELD_ORDER = [
  'name',
  'lectureId',
  'discountValue',
  'quantity',
  'issueStartAt',
  'issueEndAt',
  'expiryDays',
  'fixedExpiresAt',
] as const satisfies readonly (keyof CouponFormValues)[]

type FieldKey = (typeof FIELD_ORDER)[number]

/** 칸 이름 → 입력칸 id. 서버 필드 오류(errors[].field)도 이 이름(요청 본문 필드)으로 온다 */
const FIELD_ID: Record<FieldKey, string> = {
  name: 'sc-name',
  lectureId: 'sc-lecture',
  discountValue: 'sc-discount',
  quantity: 'sc-quantity',
  issueStartAt: 'sc-start',
  issueEndAt: 'sc-end',
  expiryDays: 'sc-expiry-days',
  fixedExpiresAt: 'sc-expiry-at',
}

const NUMERIC = new Set<keyof CouponFormValues>([
  'discountValue',
  'quantity',
  'expiryDays',
])

/** 처음 여는 폼 값. 발급은 내일 10시부터 한 달, 받은 날부터 30일 */
const initialValues = (): CouponFormValues => ({
  name: '',
  // 판매자는 자기 강의 한 개에만 쿠폰을 신청한다(BE도 LECTURE만 받는다).
  targetType: 'LECTURE',
  lectureId: '',
  discountType: 'RATE',
  discountValue: '10',
  maxDiscountAmount: '',
  quantity: '100',
  issueStartAt: kstLocalInput(1, '10:00'),
  issueEndAt: kstLocalInput(31, '23:59'),
  expiryType: 'RELATIVE',
  expiryDays: '30',
  fixedExpiresAt: kstLocalInput(61, '23:59'),
  stackable: false,
})

/** 신청 실패 중 칸에 붙일 수 있는 오류. 칸을 모르면 null */
function lectureFieldMessage(error: unknown) {
  if (isApiError(error, 'COUPON_LECTURE_NOT_ON_SALE'))
    return '판매 중인 강의에만 쿠폰을 신청할 수 있어요.'
  if (isApiError(error, 'LECTURE_NOT_FOUND')) return '강의를 찾을 수 없어요.'
  return null
}

/** 칸에 붙이지 못하는 실패의 폼 문구 */
function formMessage(error: Error) {
  if (isApiError(error, 'NOT_LECTURE_SELLER'))
    return '내가 판매하는 강의에만 쿠폰을 신청할 수 있어요.'
  if (isApiError(error) && error.status === 403)
    return '쿠폰을 신청할 권한이 없어요. 인증된 인플루언서만 신청할 수 있어요.'
  return error.message
}

/**
 * 판매자 쿠폰 신청 폼. 검사는 BE와 같은 규칙만 미리 보고(validateCouponForm), 최종 판단은 BE가 한다.
 * 신청하면 신청됨(DRAFT) 쿠폰이 만들어지고, 심사 요청은 결과 화면에서 따로 한다.
 */
export function CouponApplyForm({
  lectures,
  onCreated,
}: {
  lectures: MyLectureOptions
  onCreated: (coupon: Coupon) => void
}) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState(initialValues)
  const [formError, setFormError] = useState<string | null>(null)
  const fields = useFieldErrors({
    ids: FIELD_ID,
    order: FIELD_ORDER,
    errors: validateCouponForm(values),
  })

  const create = useMutation({
    mutationFn: () => createSellerCoupon(toCouponInput(values)),
    onSuccess: (coupon) => {
      setValues(initialValues())
      fields.reset()
      onCreated(coupon)
    },
    onError: (error) => {
      const lectureMessage = lectureFieldMessage(error)
      if (lectureMessage) {
        fields.showServerErrors([
          { field: 'lectureId', message: lectureMessage },
        ])
        // 그 사이 강의 상태가 바뀌었을 수 있어 선택지를 다시 불러온다.
        void queryClient.invalidateQueries({
          queryKey: [...lectureKeys.all, 'mine'],
        })
        return
      }
      if (isApiError(error, 'INVALID_COUPON_POLICY')) {
        fields.applyServerErrors(error)
        // 이 폼에 없는 칸(대상 등)의 오류나 칸 정보가 없는 오류는 폼 위에 적는다.
        const rest = error.errors.filter(
          (e) => !Object.hasOwn(FIELD_ID, e.field),
        )
        if (rest.length > 0 || error.errors.length === 0)
          setFormError(
            rest.length > 0
              ? rest.map((e) => e.message).join(' ')
              : error.message,
          )
        return
      }
      setFormError(formMessage(error))
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: [...couponKeys.all, 'seller'],
      }),
  })

  const set = <K extends keyof CouponFormValues>(
    key: K,
    value: CouponFormValues[K],
  ) => {
    if (key in FIELD_ID) fields.changed(key as FieldKey)
    setFormError(null)
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  /** 입력칸 공통 속성: 오류 표시 속성과 값 바꾸기 */
  const fieldProps = (key: FieldKey) => ({
    ...fields.inputProps(key),
    value: values[key],
    onChange: (e: { target: { value: string } }) =>
      set(
        key,
        NUMERIC.has(key) ? e.target.value.replace(/\D/g, '') : e.target.value,
      ),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (fields.blockSubmit()) return
    setFormError(null)
    create.mutate()
  }

  if (lectures.isPending) return <Loading label="내 강의를 불러오는 중…" />
  if (lectures.error)
    return <LoadError error={lectures.error} retry={lectures.refetch} />

  const onSale = lectures.lectures.filter(isOnSale)
  if (onSale.length === 0)
    return (
      <div className="notice warn">
        <span>
          판매 중인 강의가 없어요. 강의가 검수를 통과해 판매 중이 되면 쿠폰을
          신청할 수 있어요.
        </span>
        <Link className="btn sm" to="/studio">
          강의 판매로
        </Link>
      </div>
    )

  const rate = values.discountType === 'RATE'

  return (
    <form {...fields.formProps} className="form" noValidate onSubmit={submit}>
      {formError && (
        <div className="notice bad" role="alert">
          {formError}
        </div>
      )}
      <Field
        id={FIELD_ID.name}
        label="쿠폰 이름"
        error={fields.error('name')}
        hint={`구매자에게 보이는 이름이에요. ${COUPON_NAME_MAX}자까지.`}
      >
        <input
          {...fieldProps('name')}
          className="input"
          placeholder="예: 가을맞이 10% 할인"
        />
      </Field>
      <Field
        id={FIELD_ID.lectureId}
        label="강의"
        error={fields.error('lectureId')}
        hint="판매 중인 강의만 고를 수 있어요."
      >
        <select {...fieldProps('lectureId')} className="select">
          <option value="">강의를 골라 주세요</option>
          {lectures.lectures.map((lecture) => (
            <option
              key={lecture.lectureId}
              value={lecture.lectureId}
              disabled={!isOnSale(lecture)}
            >
              {isOnSale(lecture)
                ? lecture.title
                : `${lecture.title} (판매 중 아님)`}
            </option>
          ))}
        </select>
      </Field>
      <div className="form-row">
        <Field id="sc-discount-type" label="할인 방식">
          <select
            id="sc-discount-type"
            className="select"
            value={values.discountType}
            onChange={(e) =>
              set(
                'discountType',
                e.target.value as CouponFormValues['discountType'],
              )
            }
          >
            <option value="RATE">정률 (%)</option>
            <option value="AMOUNT">정액 (HP)</option>
          </select>
        </Field>
        <Field
          id={FIELD_ID.discountValue}
          label={rate ? '할인율 (%)' : '할인 HP'}
          error={fields.error('discountValue')}
          hint={rate ? `${RATE_MIN}~${RATE_MAX} 사이 정수` : '1 HP 이상'}
        >
          <input
            {...fieldProps('discountValue')}
            className="input num"
            inputMode="numeric"
          />
        </Field>
      </div>
      <Field
        id={FIELD_ID.quantity}
        label="수량"
        error={fields.error('quantity')}
        hint="선착순으로 이만큼 발급해요."
      >
        <input
          {...fieldProps('quantity')}
          className="input num"
          inputMode="numeric"
        />
      </Field>
      <div className="form-row">
        <Field
          id={FIELD_ID.issueStartAt}
          label="발급 시작"
          error={fields.error('issueStartAt')}
        >
          <input
            {...fieldProps('issueStartAt')}
            type="datetime-local"
            className="input"
          />
        </Field>
        <Field
          id={FIELD_ID.issueEndAt}
          label="발급 종료"
          error={fields.error('issueEndAt')}
        >
          <input
            {...fieldProps('issueEndAt')}
            type="datetime-local"
            className="input"
          />
        </Field>
      </div>
      <div className="form-row">
        <Field id="sc-expiry-type" label="만료 방식">
          <select
            id="sc-expiry-type"
            className="select"
            value={values.expiryType}
            onChange={(e) =>
              set(
                'expiryType',
                e.target.value as CouponFormValues['expiryType'],
              )
            }
          >
            <option value="RELATIVE">받은 날부터 N일</option>
            <option value="FIXED">정한 일시까지</option>
          </select>
        </Field>
        {values.expiryType === 'RELATIVE' ? (
          <Field
            id={FIELD_ID.expiryDays}
            label="사용 기간 (일)"
            error={fields.error('expiryDays')}
            hint={`${EXPIRY_DAYS_MIN}~${formatNumber(EXPIRY_DAYS_MAX)}일`}
          >
            <input
              {...fieldProps('expiryDays')}
              className="input num"
              inputMode="numeric"
            />
          </Field>
        ) : (
          <Field
            id={FIELD_ID.fixedExpiresAt}
            label="만료 일시"
            error={fields.error('fixedExpiresAt')}
            hint="발급 종료보다 뒤여야 해요."
          >
            <input
              {...fieldProps('fixedExpiresAt')}
              type="datetime-local"
              className="input"
            />
          </Field>
        )}
      </div>
      <label className="consent">
        <input
          type="checkbox"
          checked={values.stackable}
          onChange={(e) => set('stackable', e.target.checked)}
        />
        <span>다른 쿠폰과 함께 쓸 수 있어요</span>
      </label>
      <p className="fine">
        일시는 한국 시간이에요. 신청한 뒤 심사를 요청하면 관리자가 확인하고
        발급을 시작해요.
      </p>
      <div>
        <button
          type="submit"
          className="btn primary"
          disabled={create.isPending}
          {...fields.submitProps}
        >
          {create.isPending ? '신청하는 중…' : '쿠폰 신청'}
        </button>
      </div>
    </form>
  )
}
