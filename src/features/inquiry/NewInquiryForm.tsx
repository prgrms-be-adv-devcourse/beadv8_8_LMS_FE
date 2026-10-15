import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import {
  CATEGORIES,
  CATEGORY_HINT,
  CATEGORY_LABEL,
  INQUIRY_TITLE_MAX,
} from '@/entities/inquiry/category'
import type { InquiryCategory } from '@/entities/inquiry/types'
import { purchasedQuery } from '@/entities/order/api'
import { formatDate } from '@/shared/lib/date'
import { Field } from '@/shared/ui/Field'
import { useCreateInquiry } from './useInquiryActions'

type Props = {
  /** ?category=&orderItemId= 로 들어오면 미리 골라 둔다 */
  initialCategory?: InquiryCategory
  initialOrderItemId?: number
}

/** 새 문의. 강의 내용 다름 이의 제기는 구매한 강의 중 하나를 골라야 한다. */
export function NewInquiryForm({ initialCategory, initialOrderItemId }: Props) {
  const [category, setCategory] = useState<InquiryCategory>(
    initialCategory ?? 'SERVICE_COMPLAINT',
  )
  const [orderItemId, setOrderItemId] = useState(
    initialOrderItemId ? String(initialOrderItemId) : '',
  )
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const create = useCreateInquiry()

  const dispute = category === 'LECTURE_CONTENT_DISPUTE'
  const purchased = useQuery({ ...purchasedQuery, enabled: dispute })
  // 지급까지 끝난 강의는 이의 제기할 수 없다. 기한(구매 다음 날부터 30일)은 BE가 확인한다.
  const targets = (purchased.data?.content ?? []).filter(
    (p) => p.itemStatus === 'PURCHASED' || p.itemStatus === 'CONFIRMED',
  )
  const target = targets.some((p) => String(p.orderItemId) === orderItemId)
    ? orderItemId
    : ''

  const tooLong = title.length > INQUIRY_TITLE_MAX
  const canSubmit =
    title.trim() !== '' &&
    !tooLong &&
    content.trim() !== '' &&
    (!dispute || target !== '') &&
    !create.isPending

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    create.mutate(
      {
        category,
        title: title.trim(),
        content: content.trim(),
        ...(dispute && { orderItemId: Number(target) }),
      },
      {
        onSuccess: () => {
          setTitle('')
          setContent('')
          setOrderItemId('')
        },
      },
    )
  }

  return (
    <form className="panel form" onSubmit={submit}>
      <h2>새 문의</h2>
      <Field
        id="inq-category"
        label="문의 유형"
        hint={CATEGORY_HINT[category] || undefined}
      >
        <select
          id="inq-category"
          className="select"
          value={category}
          onChange={(e) => setCategory(e.target.value as InquiryCategory)}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </Field>
      {dispute &&
        (purchased.isPending ? (
          <p className="fine">구매한 강의를 불러오는 중…</p>
        ) : purchased.error ? (
          <div className="notice bad">
            구매한 강의를 불러오지 못했어요.
            <button
              type="button"
              className="btn sm"
              onClick={() => purchased.refetch()}
            >
              다시 시도
            </button>
          </div>
        ) : targets.length === 0 ? (
          <div className="notice warn">
            이의 제기할 수 있는 강의가 없어요. 구매 취소했거나 이미 판매자에게
            지급된 강의는 이의 제기할 수 없어요.
          </div>
        ) : (
          <Field id="inq-target" label="이의 제기할 강의">
            <select
              id="inq-target"
              className="select"
              value={target}
              onChange={(e) => setOrderItemId(e.target.value)}
            >
              <option value="">강의를 골라 주세요</option>
              {targets.map((p) => (
                <option key={p.orderItemId} value={p.orderItemId}>
                  {p.title} · {formatDate(p.purchasedAt)} 구매
                </option>
              ))}
            </select>
          </Field>
        ))}
      <Field
        id="inq-title"
        label="제목"
        error={
          tooLong
            ? `제목은 ${INQUIRY_TITLE_MAX}자까지 쓸 수 있어요.`
            : undefined
        }
        hint={`${title.length} / ${INQUIRY_TITLE_MAX}`}
      >
        <input
          id="inq-title"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field id="inq-content" label="내용">
        <textarea
          id="inq-content"
          className="textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="언제, 무슨 일이 있었는지 적어 주세요."
        />
      </Field>
      <button
        type="submit"
        className="btn primary"
        style={{ alignSelf: 'flex-start' }}
        disabled={!canSubmit}
      >
        접수하기
      </button>
    </form>
  )
}
