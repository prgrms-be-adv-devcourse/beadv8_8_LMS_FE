import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import {
  COUPON_NAME_MAX,
  EXPIRY_DAYS_MAX,
  EXPIRY_DAYS_MIN,
  needsMaxDiscount,
  RATE_MAX,
  RATE_MIN,
  toCouponInput,
  validateCouponForm,
  type CouponFormValues,
} from '@/entities/coupon/rules'
import { isApiError } from '@/shared/api/ApiError'
import { kstLocalInput } from '@/shared/lib/date'
import { useFieldErrors } from '@/shared/lib/useFieldErrors'
import { Field } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { useCreatePlatformCoupon } from './useAdminCouponActions'
import styles from './PlatformCouponFormModal.module.css'

/** 검사하는 칸(화면 순서). 선택(대상·할인 방식·만료 방식·함께 쓰기)은 늘 값이 있어 검사하지 않는다 */
const FIELD_ORDER = [
  'name',
  'lectureId',
  'discountValue',
  'maxDiscountAmount',
  'quantity',
  'issueStartAt',
  'issueEndAt',
  'expiryDays',
  'fixedExpiresAt',
] as const satisfies readonly (keyof CouponFormValues)[]
type CheckedField = (typeof FIELD_ORDER)[number]

/** 칸 이름 → 입력칸 id. BE 400 errors[].field도 같은 이름(CouponCreateRequest)이라 그대로 칸에 붙는다 */
const FIELD_ID: Record<CheckedField, string> = {
  name: 'pc-name',
  lectureId: 'pc-lecture',
  discountValue: 'pc-discount',
  maxDiscountAmount: 'pc-max',
  quantity: 'pc-quantity',
  issueStartAt: 'pc-start',
  issueEndAt: 'pc-end',
  expiryDays: 'pc-days',
  fixedExpiresAt: 'pc-fixed',
}

/** 숫자만 받는 칸(입력하며 숫자 아닌 글자를 지운다) */
const NUMERIC = new Set<keyof CouponFormValues>([
  'lectureId',
  'discountValue',
  'maxDiscountAmount',
  'quantity',
  'expiryDays',
])

const initialValues = (): CouponFormValues => ({
  name: '',
  targetType: 'ANY_LECTURE',
  lectureId: '',
  discountType: 'AMOUNT',
  discountValue: '',
  maxDiscountAmount: '',
  quantity: '100',
  issueStartAt: kstLocalInput(),
  issueEndAt: kstLocalInput(14, '23:59'),
  expiryType: 'RELATIVE',
  expiryDays: '30',
  fixedExpiresAt: kstLocalInput(44, '23:59'),
  stackable: false,
})

/**
 * 플랫폼 쿠폰 만들기. 만들면 DRAFT(발급 전)로 저장되고 상세로 가서 '열기'로 발급을 시작한다.
 * 관리자에게는 강의 고르기 목록이 없어 대상 강의는 강의 번호로 넣는다(BE가 판매 중인 강의인지 확인한다).
 */
export function PlatformCouponFormModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [values, setValues] = useState<CouponFormValues>(initialValues)
  const [formError, setFormError] = useState<string | null>(null)
  const fields = useFieldErrors({
    ids: FIELD_ID,
    order: FIELD_ORDER,
    errors: validateCouponForm(values),
  })
  const create = useCreatePlatformCoupon()
  const withMax = needsMaxDiscount(values.targetType, values.discountType)

  const set = <K extends keyof CouponFormValues>(
    key: K,
    value: CouponFormValues[K],
  ) => {
    if (key in FIELD_ID) fields.changed(key as CheckedField)
    setFormError(null)
    setValues((prev) => ({ ...prev, [key]: value }))
  }
  const text = (key: CheckedField) => ({
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
    if (create.isPending || fields.blockSubmit()) return
    create.mutate(toCouponInput(values), {
      onSuccess: (coupon) => {
        onClose()
        navigate(`/admin/coupons/${coupon.couponId}`)
      },
      onError: (error) => {
        if (fields.applyServerErrors(error)) return
        // 대상 강의 문제는 강의 번호 칸에 붙인다.
        if (isApiError(error, 'COUPON_LECTURE_NOT_ON_SALE'))
          return void fields.showServerErrors([
            {
              field: 'lectureId',
              message: '판매 중인 강의에만 쿠폰을 만들 수 있어요.',
            },
          ])
        if (isApiError(error, 'LECTURE_NOT_FOUND'))
          return void fields.showServerErrors([
            { field: 'lectureId', message: '그 번호의 강의가 없어요.' },
          ])
        setFormError(
          isApiError(error) && error.status === 503
            ? '잠시 후 다시 시도해 주세요.'
            : error.message,
        )
      },
    })
  }

  return (
    <Modal
      title="플랫폼 쿠폰 만들기"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            취소
          </button>
          <button
            type="submit"
            form="platform-coupon-form"
            className="btn primary"
            disabled={create.isPending}
            {...fields.submitProps}
          >
            만들기
          </button>
        </>
      }
    >
      <form
        {...fields.formProps}
        id="platform-coupon-form"
        className="form"
        noValidate
        onSubmit={submit}
      >
        <Field
          id="pc-name"
          label="쿠폰 이름"
          error={fields.error('name')}
          hint={`회원 쿠폰함에 보여요. ${COUPON_NAME_MAX}자까지`}
        >
          <input
            {...text('name')}
            className="input"
            placeholder="예: 겨울 맞이 3,000 HP 할인"
          />
        </Field>

        <fieldset className={styles.choice}>
          <legend>대상</legend>
          <Radio
            name="pc-target"
            checked={values.targetType === 'ANY_LECTURE'}
            onChange={() => set('targetType', 'ANY_LECTURE')}
            label="모든 강의"
          />
          <Radio
            name="pc-target"
            checked={values.targetType === 'LECTURE'}
            onChange={() => set('targetType', 'LECTURE')}
            label="특정 강의"
          />
        </fieldset>
        {values.targetType === 'LECTURE' && (
          <Field
            id="pc-lecture"
            label="강의 번호"
            error={fields.error('lectureId')}
            hint="판매 중인 강의만 고를 수 있어요."
          >
            <input
              {...text('lectureId')}
              className="input num"
              inputMode="numeric"
            />
          </Field>
        )}

        <fieldset className={styles.choice}>
          <legend>할인 방식</legend>
          <Radio
            name="pc-discount-type"
            checked={values.discountType === 'AMOUNT'}
            onChange={() => set('discountType', 'AMOUNT')}
            label="정액 (HP)"
          />
          <Radio
            name="pc-discount-type"
            checked={values.discountType === 'RATE'}
            onChange={() => set('discountType', 'RATE')}
            label="정률 (%)"
          />
        </fieldset>
        <div className="form-row">
          <Field
            id="pc-discount"
            label={values.discountType === 'RATE' ? '할인율 (%)' : '할인 HP'}
            error={fields.error('discountValue')}
            hint={
              values.discountType === 'RATE'
                ? `${RATE_MIN}~${RATE_MAX}`
                : undefined
            }
          >
            <input
              {...text('discountValue')}
              className="input num"
              inputMode="numeric"
            />
          </Field>
          {withMax && (
            <Field
              id="pc-max"
              label="최대 할인 HP"
              error={fields.error('maxDiscountAmount')}
              hint="모든 강의에 쓰는 정률 쿠폰은 한 번에 깎는 HP의 상한이 필요해요."
            >
              <input
                {...text('maxDiscountAmount')}
                className="input num"
                inputMode="numeric"
              />
            </Field>
          )}
          <Field
            id="pc-quantity"
            label="발급 수량"
            error={fields.error('quantity')}
          >
            <input
              {...text('quantity')}
              className="input num"
              inputMode="numeric"
            />
          </Field>
        </div>

        <div className="form-row">
          <Field
            id="pc-start"
            label="발급 시작"
            error={fields.error('issueStartAt')}
          >
            <input
              {...text('issueStartAt')}
              type="datetime-local"
              className="input"
            />
          </Field>
          <Field
            id="pc-end"
            label="발급 종료"
            error={fields.error('issueEndAt')}
          >
            <input
              {...text('issueEndAt')}
              type="datetime-local"
              className="input"
            />
          </Field>
        </div>

        <fieldset className={styles.choice}>
          <legend>만료</legend>
          <Radio
            name="pc-expiry"
            checked={values.expiryType === 'RELATIVE'}
            onChange={() => set('expiryType', 'RELATIVE')}
            label="받은 날부터 N일"
          />
          <Radio
            name="pc-expiry"
            checked={values.expiryType === 'FIXED'}
            onChange={() => set('expiryType', 'FIXED')}
            label="정한 날까지"
          />
        </fieldset>
        {values.expiryType === 'RELATIVE' ? (
          <Field
            id="pc-days"
            label="만료 일수"
            error={fields.error('expiryDays')}
            hint={`${EXPIRY_DAYS_MIN}~${EXPIRY_DAYS_MAX.toLocaleString()}일`}
          >
            <input
              {...text('expiryDays')}
              className="input num"
              inputMode="numeric"
            />
          </Field>
        ) : (
          <Field
            id="pc-fixed"
            label="만료 일시"
            error={fields.error('fixedExpiresAt')}
            hint="발급 종료보다 뒤여야 해요."
          >
            <input
              {...text('fixedExpiresAt')}
              type="datetime-local"
              className="input"
            />
          </Field>
        )}

        <label className={styles.check}>
          <input
            type="checkbox"
            checked={values.stackable}
            onChange={(e) => set('stackable', e.target.checked)}
          />
          <span>다른 쿠폰과 함께 쓸 수 있어요</span>
        </label>
      </form>
      {formError && (
        <div className="notice bad" role="alert">
          {formError}
        </div>
      )}
    </Modal>
  )
}

function Radio({
  name,
  checked,
  onChange,
  label,
}: {
  name: string
  checked: boolean
  onChange: () => void
  label: string
}) {
  return (
    <label className={checked ? 'chip on' : 'chip'}>
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      {label}
    </label>
  )
}
