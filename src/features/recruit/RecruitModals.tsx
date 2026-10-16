import { useState } from 'react'
import {
  CONTENT_MAX,
  hostChannelUrlError,
  PENALTY_RATE_PERCENT,
  TITLE_MAX,
} from '@/entities/appearance/rules'
import type {
  Application,
  Recruit,
  RecruitEdit,
} from '@/entities/appearance/types'
import { formatNumber } from '@/shared/lib/money'
import { Field } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import {
  useAcceptApplication,
  useCloseRecruit,
  useEditRecruit,
  useRejectApplication,
  useWithdrawApplication,
} from './useRecruitActions'

type RecruitProps = { recruit: Recruit; onClose: () => void }
type ApplicationProps = { application: Application; onClose: () => void }

/** 지원 수락 (호스트). 수락하면 바로 출연이 성립한다 */
export function AcceptApplicationModal({
  application,
  recruit,
  onClose,
}: ApplicationProps & { recruit: Recruit }) {
  const accept = useAcceptApplication(application.id)
  const penalty = Math.floor(
    (recruit.feePerPerson * PENALTY_RATE_PERCENT) / 100,
  )
  return (
    <Modal
      title="지원을 수락할까요?"
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
      <p>
        수락하면 바로 출연이 성립돼요. 성립 후 호스트가 취소하면 1인 출연료의{' '}
        {PENALTY_RATE_PERCENT}%(
        <span className="num">{formatNumber(penalty)}</span> HP)를 위약금으로
        지급해요.
      </p>
      <p className="fine">
        성립 {recruit.selectedCount} / {recruit.recruitCount}명이에요. 출연료는
        방송 뒤 출연을 확인하면 보류한 HP에서 지급돼요.
      </p>
    </Modal>
  )
}

/** 지원 거절 (호스트). 사유 없이 거절하고, 거절된 게스트는 다시 지원할 수 없다 */
export function RejectApplicationModal({
  application,
  onClose,
}: ApplicationProps) {
  const reject = useRejectApplication(application.id)
  return (
    <Modal
      title="지원을 거절할까요?"
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
            onClick={() => reject.mutate(undefined, { onSettled: onClose })}
          >
            거절
          </button>
        </>
      }
    >
      <p>거절하면 이 게스트는 이 모집글에 다시 지원할 수 없어요.</p>
    </Modal>
  )
}

/** 지원 취소 (게스트). 호스트가 응답하기 전까지만 할 수 있다 */
export function WithdrawApplicationModal({
  application,
  onClose,
}: ApplicationProps) {
  const withdraw = useWithdrawApplication(application.id)
  return (
    <Modal
      title="지원을 취소할까요?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={withdraw.isPending}
            onClick={() => withdraw.mutate(undefined, { onSettled: onClose })}
          >
            지원 취소
          </button>
        </>
      }
    >
      <p>취소하면 이 모집글에 다시 지원할 수 없어요.</p>
    </Modal>
  )
}

/** 조기 마감 (호스트). 성립 0명이어도 마감할 수 있다 */
export function CloseRecruitModal({ recruit, onClose }: RecruitProps) {
  const close = useCloseRecruit(recruit.id)
  const { feePerPerson: fee, recruitCount, selectedCount } = recruit
  // 안내용 계산. 실제 반환 금액은 BE가 계산한다.
  const held = fee * recruitCount
  const used = fee * selectedCount
  return (
    <Modal
      title="모집을 조기 마감할까요?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={close.isPending}
            onClick={() => close.mutate(undefined, { onSettled: onClose })}
          >
            조기 마감
          </button>
        </>
      }
    >
      <p>
        대기 중인 지원은 모두 미선정이 되고, 채우지 못한 자리의 출연료(1인
        출연료 × (모집 인원 − 성립 인원))를 돌려받아요.
      </p>
      <div className="breakdown">
        <div className="row sub">
          <span>보류 중</span>
          <span className="num">{formatNumber(held)}</span>
        </div>
        <div className="row sub">
          <span>
            성립 {selectedCount}명 × {formatNumber(fee)}
          </span>
          <span className="num">−{formatNumber(used)}</span>
        </div>
        <div className="row total">
          <span>돌려받는 HP</span>
          <b className="num">{formatNumber(held - used)}</b>
        </div>
      </div>
      <p className="fine">
        성립한 출연은 그대로 유지돼요. 마감한 뒤에는 다시 열 수 없어요.
      </p>
    </Modal>
  )
}

/** 기본 정보 수정 (호스트). 제목·콘텐츠 설명·채널 주소만 바꿀 수 있다 */
export function EditRecruitModal({ recruit, onClose }: RecruitProps) {
  const [title, setTitle] = useState(recruit.title)
  const [content, setContent] = useState(recruit.content)
  const [url, setUrl] = useState(recruit.hostChannelUrl)
  const edit = useEditRecruit(recruit.id)

  const changes: RecruitEdit = {}
  if (title.trim() !== recruit.title) changes.title = title.trim()
  if (content.trim() !== recruit.content) changes.content = content.trim()
  if (url.trim() !== recruit.hostChannelUrl) changes.hostChannelUrl = url.trim()
  const titleError = !title.trim() ? '제목을 입력해 주세요.' : undefined
  const contentError = !content.trim()
    ? '콘텐츠 설명을 입력해 주세요.'
    : undefined
  const urlError = hostChannelUrlError(url.trim()) ?? undefined
  const invalid = Boolean(titleError || contentError || urlError)

  return (
    <Modal
      title="기본 정보 수정"
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
        출연료·인원·일정은 바꿀 수 없어요. 모집 중이고 마감 전에만 고칠 수
        있어요.
      </p>
      <div className="form">
        <Field id="rc-edit-title" label="제목" error={titleError}>
          <input
            id="rc-edit-title"
            className="input"
            maxLength={TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field id="rc-edit-channel" label="내 채널 주소" error={urlError}>
          <input
            id="rc-edit-channel"
            className="input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        <Field id="rc-edit-content" label="콘텐츠 설명" error={contentError}>
          <textarea
            id="rc-edit-content"
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
