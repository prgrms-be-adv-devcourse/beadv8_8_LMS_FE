import { useState } from 'react'
import {
  CONTENT_MAX,
  hostChannelUrlError,
  REJECT_REASON_MAX,
  TITLE_MAX,
} from '@/entities/appearance/rules'
import type {
  AppearanceRequest,
  AppearanceRequestEdit,
} from '@/entities/appearance/types'
import { formatDateTime } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { Field } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import {
  useAcceptRequest,
  useCancelRequest,
  useEditRequest,
  useRejectRequest,
} from './useRequestActions'

type Props = { request: AppearanceRequest; onClose: () => void }

/**
 * 수락 (게스트). snapshot은 확인창을 연 순간의 요청서다. 화면에 보이는 이 내용·버전 그대로 동의한다.
 * 부르는 쪽은 확인창이 열린 동안 snapshot을 바꾸지 않는다.
 */
export function AcceptRequestModal({
  snapshot: request,
  onClose,
}: {
  snapshot: AppearanceRequest
  onClose: () => void
}) {
  const accept = useAcceptRequest(request)
  return (
    <Modal
      title="이 조건으로 수락할까요?"
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
            onClick={() => accept.mutate(undefined, { onSettled: onClose })}
          >
            수락
          </button>
        </>
      }
    >
      <dl className="kv">
        <dt>제목</dt>
        <dd>{request.title}</dd>
        <dt>출연료</dt>
        <dd className="num">{formatNumber(request.fee)} HP</dd>
        <dt>방송 예정</dt>
        <dd>{formatDateTime(request.scheduledAt)}</dd>
        <dt>예상 출연 시간</dt>
        <dd>{request.expectedMinutes}분</dd>
      </dl>
      <p className="fine">
        수락하면 출연이 성립해요. 출연료는 방송 뒤 호스트가 출연을 확인하면
        지급돼요. 호스트가 그사이 요청서를 고치면 수락이 막히고 바뀐 내용을 다시
        보여 드려요.
      </p>
    </Modal>
  )
}

/** 거절 (게스트). 사유는 선택이고 호스트에게 보인다. */
export function RejectRequestModal({ request, onClose }: Props) {
  const [reason, setReason] = useState('')
  const reject = useRejectRequest(request.id)
  return (
    <Modal
      title="출연 요청을 거절할까요?"
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
      <Field
        id="reject-reason"
        label="거절 사유 (선택)"
        hint={`호스트에게 그대로 보여요. ${reason.length}/${REJECT_REASON_MAX}`}
      >
        <textarea
          id="reject-reason"
          className="textarea"
          maxLength={REJECT_REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 해당 일정에 다른 방송이 있어요."
        />
      </Field>
    </Modal>
  )
}

/** 응답 전 취소 (호스트). 보류한 HP를 돌려받는다. */
export function CancelRequestModal({ request, onClose }: Props) {
  const cancel = useCancelRequest(request.id)
  return (
    <Modal
      title="출연 요청을 취소할까요?"
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
            onClick={() => cancel.mutate(undefined, { onSuccess: onClose })}
          >
            요청 취소
          </button>
        </>
      }
    >
      <p>
        게스트가 응답하기 전이라 위약금 없이 취소돼요. 보류한{' '}
        <b className="num">{formatNumber(request.fee)} HP</b>를 쓴 종류 그대로
        돌려받아요.
      </p>
    </Modal>
  )
}

/** 응답 전 요청서 수정 (호스트). 제목·내용·채널 주소만 바꿀 수 있다. */
export function EditRequestModal({ request, onClose }: Props) {
  const [title, setTitle] = useState(request.title)
  const [content, setContent] = useState(request.content)
  const [url, setUrl] = useState(request.hostChannelUrl)
  const edit = useEditRequest(request.id)

  const changes: AppearanceRequestEdit = {}
  if (title.trim() !== request.title) changes.title = title.trim()
  if (content.trim() !== request.content) changes.content = content.trim()
  if (url.trim() !== request.hostChannelUrl) changes.hostChannelUrl = url.trim()
  const titleError = !title.trim() ? '제목을 입력해 주세요.' : undefined
  const contentError = !content.trim()
    ? '요청 내용을 입력해 주세요.'
    : undefined
  const urlError = hostChannelUrlError(url.trim()) ?? undefined
  const invalid = Boolean(titleError || contentError || urlError)

  return (
    <Modal
      title="요청서 고치기"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={
              invalid || Object.keys(changes).length === 0 || edit.isPending
            }
            onClick={() => edit.mutate(changes, { onSuccess: onClose })}
          >
            저장
          </button>
        </>
      }
    >
      <p className="fine">
        출연료·일정은 바꿀 수 없어요. 바꾸려면 요청을 취소하고 다시 보내 주세요.
        고친 뒤에는 게스트가 바뀐 내용을 보고 수락해요.
      </p>
      <div className="form">
        <Field id="edit-title" label="제목" error={titleError}>
          <input
            id="edit-title"
            className="input"
            maxLength={TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field id="edit-channel" label="내 채널 주소" error={urlError}>
          <input
            id="edit-channel"
            className="input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        <Field id="edit-content" label="요청 내용" error={contentError}>
          <textarea
            id="edit-content"
            className="textarea"
            maxLength={CONTENT_MAX}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  )
}
