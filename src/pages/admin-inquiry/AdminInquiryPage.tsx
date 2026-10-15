import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { adminInquiryQuery } from '@/entities/inquiry/api'
import type { Inquiry, InquiryReply } from '@/entities/inquiry/types'
import { InquiryHead } from '@/entities/inquiry/ui/InquiryHead'
import { InquiryThread } from '@/entities/inquiry/ui/InquiryThread'
import {
  useDeleteReply,
  useEditReply,
  useReplyInquiry,
  useResolveObjection,
} from '@/features/inquiry/useInquiryActions'
import { Field } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { LoadError, Loading } from '@/shared/ui/QueryState'

export function AdminInquiryPage() {
  const inquiryId = Number(useParams().inquiryId)
  const { data, error, isPending, refetch } = useQuery(
    adminInquiryQuery(inquiryId),
  )
  return (
    <div className="page narrow">
      <Link className="back" to="/admin/inquiries">
        ← 문의 답변
      </Link>
      {isPending ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : (
        <Detail inquiry={data} />
      )}
    </div>
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
  // 판단 전 이의 제기는 일반 답변 대신 판단으로 안내를 단다.
  const needsResolution =
    inquiry.category === 'LECTURE_CONTENT_DISPUTE' && !inquiry.objectionResult

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
      {needsResolution ? (
        <ResolveObjectionForm inquiryId={inquiry.inquiryId} />
      ) : (
        <ReplyForm inquiryId={inquiry.inquiryId} />
      )}
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
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    reply.mutate(content.trim(), { onSuccess: () => setContent('') })
  }
  return (
    <form className="panel form" onSubmit={submit}>
      <Field
        id="inq-reply"
        label="답변"
        hint="답변은 문의한 회원의 고객센터에 보여요."
      >
        <textarea
          id="inq-reply"
          className="textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </Field>
      <button
        type="submit"
        className="btn primary"
        style={{ alignSelf: 'flex-end' }}
        disabled={!content.trim() || reply.isPending}
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
  const canSubmit = accepted !== null && content.trim() !== ''

  return (
    <form
      className="panel form"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSubmit) setConfirming(true)
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
      <Field id="inq-resolution" label="판단 안내" hint="문의 답변으로 달려요.">
        <textarea
          id="inq-resolution"
          className="textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </Field>
      <button
        type="submit"
        className="btn primary"
        style={{ alignSelf: 'flex-end' }}
        disabled={!canSubmit}
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
                    { onSettled: () => setConfirming(false) },
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
