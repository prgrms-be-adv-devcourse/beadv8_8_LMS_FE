import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { adminInquiryQuery } from '@/entities/inquiry/api'
import { adminFormOf, isWithdrawn } from '@/entities/inquiry/objection'
import type {
  Inquiry,
  InquiryReply,
  ObjectionLinkStatus,
} from '@/entities/inquiry/types'
import { InquiryHead } from '@/entities/inquiry/ui/InquiryHead'
import { ObjectionLinkPill } from '@/entities/inquiry/ui/InquiryPills'
import { InquiryThread } from '@/entities/inquiry/ui/InquiryThread'
import {
  useDeleteReply,
  useEditReply,
  useReplyInquiry,
  useResolveObjection,
} from '@/features/inquiry/useInquiryActions'
import { lookup } from '@/shared/lib/statusLabel'
import { useFieldErrors } from '@/shared/lib/useFieldErrors'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Field } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { LoadError, Loading } from '@/shared/ui/QueryState'

export function AdminInquiryPage() {
  const inquiryId = Number(useParams().inquiryId)
  const { data, error, refetch } = useQuery(adminInquiryQuery(inquiryId))
  // 다시 불러오다 실패해도(일시 오류) 이미 받은 문의를 그대로 보이고, 다음 다시 불러오기를 기다린다.
  // 철회 처리 중이던 문의가 사라졌으면(404) 회원 철회로 삭제된 것이다.
  return (
    <div className="page narrow">
      <Link className="back" to="/admin/inquiries">
        ← 문의 답변
      </Link>
      {isWithdrawn(data, error) ? (
        <EmptyState
          title="삭제된 문의예요"
          action={
            <Link className="btn" to="/admin/inquiries">
              문의 목록
            </Link>
          }
        >
          회원이 이의 제기를 철회해 문의가 삭제됐어요.
        </EmptyState>
      ) : data ? (
        <Detail inquiry={data} />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : (
        <Loading />
      )}
    </div>
  )
}

/** 연동 상태별 관리자 안내. 접수됨·판단 완료·철회됨은 상태 배지로 충분하다. 모르는 상태는 숨긴다 */
const LINK_HINT: Record<ObjectionLinkStatus, string | null> = {
  FILING:
    '강의에 접수하는 중이에요. 서버가 매분 다시 시도하고, 접수되면 판단할 수 있어요. 결과가 나오면 이 화면이 바뀌어요.',
  FILED: null,
  FILE_REJECTED:
    '강의가 접수를 거절해 판매자 지급은 멈추지 않았어요. 일반 문의처럼 답변할 수 있어요.',
  RESOLUTION_PENDING:
    '판단을 강의에 반영하는 중이에요. 반영되면 판단 안내가 답변으로 달리고 이 화면이 바뀌어요.',
  RESOLVED: null,
  RESOLUTION_FAILED:
    '강의가 판단을 거절했어요. 같은 판단을 다시 보내도 같은 결과라 운영 복구를 기다려요.',
  WITHDRAWAL_PENDING:
    '회원이 이의 제기를 철회하는 중이에요. 철회가 끝나면 문의가 삭제되므로 답변할 수 없어요.',
  WITHDRAWN: null,
  WITHDRAWAL_FAILED:
    '강의가 철회를 거절했어요. 운영 복구를 기다리는 동안에는 판단·답변하지 않아요.',
}

/** 이의 제기의 강의 연동 상태. 실패 코드·명령 ID는 관리자 응답에만 있다(BE D60 (4)) */
function ObjectionLinkPanel({ inquiry }: { inquiry: Inquiry }) {
  const status = inquiry.objectionLinkStatus
  if (status === null) return null
  const hint = lookup(LINK_HINT, status)
  return (
    <section className="panel" aria-label="이의 제기 연동">
      <dl className="kv">
        <dt>연동 상태</dt>
        <dd>
          <ObjectionLinkPill status={status} />
        </dd>
        {inquiry.objectionNotice && (
          <>
            <dt>회원 안내</dt>
            <dd>{inquiry.objectionNotice}</dd>
          </>
        )}
        {inquiry.objectionFailureCode && (
          <>
            <dt>실패 코드</dt>
            <dd className="num">{inquiry.objectionFailureCode}</dd>
          </>
        )}
        {inquiry.objectionCommandId && (
          <>
            <dt>명령 ID</dt>
            <dd className="num">{inquiry.objectionCommandId}</dd>
          </>
        )}
      </dl>
      {hint && <p className="fine">{hint}</p>}
    </section>
  )
}

function Detail({ inquiry }: { inquiry: Inquiry }) {
  const [editing, setEditing] = useState<{
    replyId: number
    content: string
  } | null>(null)
  const [deleting, setDeleting] = useState<InquiryReply | null>(null)
  const edit = useEditReply(inquiry.inquiryId)
  const remove = useDeleteReply(inquiry.inquiryId)
  // 접수된 이의 제기는 일반 답변 대신 판단으로 안내를 단다. 연동 처리 중·강의 거절이면 폼을 열지 않는다.
  const form = adminFormOf(inquiry)

  const saveEdit = (e: FormEvent) => {
    e.preventDefault()
    if (!editing || !editing.content.trim()) return
    edit.mutate(
      { replyId: editing.replyId, content: editing.content.trim() },
      { onSuccess: () => setEditing(null) },
    )
  }

  return (
    <>
      <InquiryHead inquiry={inquiry} showUser />
      <ObjectionLinkPanel inquiry={inquiry} />
      <InquiryThread
        inquiry={inquiry}
        author={`회원 #${inquiry.userId}`}
        replyActions={(reply) =>
          editing?.replyId !== reply.replyId && (
            <>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() =>
                  setEditing({ replyId: reply.replyId, content: reply.content })
                }
              >
                고치기
              </button>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setDeleting(reply)}
              >
                삭제
              </button>
            </>
          )
        }
        renderReply={(reply) =>
          editing?.replyId === reply.replyId ? (
            <form className="form" onSubmit={saveEdit}>
              <textarea
                className="textarea"
                aria-label="답변 고치기"
                value={editing.content}
                onChange={(e) =>
                  setEditing({
                    replyId: reply.replyId,
                    content: e.target.value,
                  })
                }
              />
              <div
                style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}
              >
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => setEditing(null)}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn primary sm"
                  disabled={!editing.content.trim() || edit.isPending}
                >
                  저장
                </button>
              </div>
            </form>
          ) : undefined
        }
      />
      {form === 'resolve' && (
        <ResolveObjectionForm inquiryId={inquiry.inquiryId} />
      )}
      {form === 'reply' && <ReplyForm inquiryId={inquiry.inquiryId} />}
      {deleting && (
        <Modal
          title="답변을 삭제할까요?"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setDeleting(null)}
              >
                닫기
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(deleting.replyId, {
                    onSettled: () => setDeleting(null),
                  })
                }
              >
                삭제
              </button>
            </>
          }
        >
          <p>
            회원에게도 더 이상 보이지 않아요. 답변을 모두 지우면 다시 답변
            대기가 돼요.
          </p>
        </Modal>
      )}
    </>
  )
}

function ReplyForm({ inquiryId }: { inquiryId: number }) {
  const [content, setContent] = useState('')
  const reply = useReplyInquiry(inquiryId)
  const fields = useFieldErrors({
    ids: { content: 'inq-reply' },
    order: ['content'],
    errors: { content: !content.trim() ? '답변을 입력해 주세요.' : undefined },
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (fields.blockSubmit()) return
    reply.mutate(content.trim(), {
      onSuccess: () => {
        fields.reset()
        setContent('')
      },
      onError: fields.applyServerErrors,
    })
  }
  return (
    <form
      {...fields.formProps}
      className="panel form"
      noValidate
      onSubmit={submit}
    >
      <Field
        id="inq-reply"
        label="답변"
        error={fields.error('content')}
        hint="답변은 문의한 회원의 고객센터에 보여요."
      >
        <textarea
          {...fields.inputProps('content')}
          className="textarea"
          value={content}
          onChange={(e) => {
            fields.changed('content')
            setContent(e.target.value)
          }}
        />
      </Field>
      <button
        type="submit"
        className="btn primary"
        style={{ alignSelf: 'flex-end' }}
        disabled={reply.isPending}
        {...fields.submitProps}
      >
        답변 달기
      </button>
    </form>
  )
}

/** 강의 내용 다름 이의 제기 판단. 판단 안내는 답변으로 달리고, 한 번 판단하면 바꿀 수 없다. */
function ResolveObjectionForm({ inquiryId }: { inquiryId: number }) {
  const [accepted, setAccepted] = useState<boolean | null>(null)
  const [content, setContent] = useState('')
  const [confirming, setConfirming] = useState(false)
  const resolve = useResolveObjection(inquiryId)
  const fields = useFieldErrors({
    ids: { content: 'inq-resolution' },
    order: ['content'],
    errors: {
      content: !content.trim() ? '판단 안내를 입력해 주세요.' : undefined,
    },
  })

  return (
    <form
      {...fields.formProps}
      noValidate
      className="panel form"
      onSubmit={(e) => {
        e.preventDefault()
        if (fields.blockSubmit() || accepted === null) return
        setConfirming(true)
      }}
    >
      <h2>이의 제기 판단</h2>
      <p className="fine">
        판단 전까지 이 강의의 판매자 지급이 멈춰 있어요. 인정하면 구매자에게
        HP를 반환하고, 기각하면 판매자에게 지급해요.
      </p>
      <fieldset style={{ border: 0, padding: 0, display: 'flex', gap: 16 }}>
        <legend className="fine">판단</legend>
        <label>
          <input
            type="radio"
            name="objection"
            checked={accepted === true}
            onChange={() => setAccepted(true)}
          />{' '}
          인정 · 구매자 반환
        </label>
        <label>
          <input
            type="radio"
            name="objection"
            checked={accepted === false}
            onChange={() => setAccepted(false)}
          />{' '}
          기각 · 판매자 지급
        </label>
      </fieldset>
      <Field
        id="inq-resolution"
        label="판단 안내"
        error={fields.error('content')}
        hint="문의 답변으로 달려요."
      >
        <textarea
          {...fields.inputProps('content')}
          className="textarea"
          value={content}
          onChange={(e) => {
            fields.changed('content')
            setContent(e.target.value)
          }}
        />
      </Field>
      <button
        type="submit"
        className="btn primary"
        style={{ alignSelf: 'flex-end' }}
        // 판단(인정·기각)을 고르지 않았으면 안내할 칸이 없어 그냥 막는다.
        disabled={!fields.hasErrors && accepted === null}
        {...fields.submitProps}
      >
        판단하기
      </button>
      {confirming && accepted !== null && (
        <Modal
          title={
            accepted ? '이의 제기를 인정할까요?' : '이의 제기를 기각할까요?'
          }
          onClose={() => setConfirming(false)}
          footer={
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setConfirming(false)}
              >
                닫기
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={resolve.isPending}
                onClick={() =>
                  resolve.mutate(
                    { accepted, content: content.trim() },
                    {
                      onError: fields.applyServerErrors,
                      onSettled: () => setConfirming(false),
                    },
                  )
                }
              >
                {accepted ? '인정' : '기각'}
              </button>
            </>
          }
        >
          <p>
            {accepted
              ? '구매자에게 HP가 반환되고, 구매자는 이 강의를 더 볼 수 없어요.'
              : '판매자에게 판매 금액이 지급돼요.'}{' '}
            판단은 되돌릴 수 없어요.
          </p>
        </Modal>
      )}
    </form>
  )
}
