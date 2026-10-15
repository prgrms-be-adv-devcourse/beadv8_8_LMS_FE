import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { myInquiryQuery } from '@/entities/inquiry/api'
import type { Inquiry } from '@/entities/inquiry/types'
import { InquiryHead } from '@/entities/inquiry/ui/InquiryHead'
import { InquiryThread } from '@/entities/inquiry/ui/InquiryThread'
import { useDeleteInquiry } from '@/features/inquiry/useInquiryActions'
import { Modal } from '@/shared/ui/Modal'
import { LoadError, Loading } from '@/shared/ui/QueryState'

export function InquiryPage() {
  const inquiryId = Number(useParams().inquiryId)
  const { data, error, isPending, refetch } = useQuery(
    myInquiryQuery(inquiryId),
  )
  return (
    <div className="page narrow">
      <Link className="back" to="/support">
        ← 고객센터
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
  const [confirming, setConfirming] = useState(false)
  const remove = useDeleteInquiry(inquiry.inquiryId)
  const navigate = useNavigate()
  const dispute = inquiry.category === 'LECTURE_CONTENT_DISPUTE'
  const waiting = inquiry.status === 'WAITING'

  return (
    <>
      <InquiryHead inquiry={inquiry} />
      {dispute && !inquiry.objectionResult && (
        <p className="app-note">
          관리자 판단이 나올 때까지 이 강의의 판매자 지급이 멈춰요. 인정되면
          HP가 돌아오고, 기각되면 판매자에게 지급돼요.
        </p>
      )}
      <InquiryThread inquiry={inquiry} author="나" />
      {waiting && (
        <>
          <p className="fine">
            운영팀이 확인하고 있어요. 답변이 달리기 전에는 문의를 삭제할 수
            있어요.
          </p>
          <button
            type="button"
            className="btn danger"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setConfirming(true)}
          >
            문의 삭제
          </button>
        </>
      )}
      {confirming && (
        <Modal
          title="문의를 삭제할까요?"
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
                className="btn danger"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(undefined, {
                    onSuccess: () => navigate('/support', { replace: true }),
                    onSettled: () => setConfirming(false),
                  })
                }
              >
                삭제
              </button>
            </>
          }
        >
          <p>
            {dispute
              ? '삭제하면 이의 제기도 철회되고, 멈췄던 판매자 지급이 다시 진행돼요.'
              : '삭제한 문의는 되돌릴 수 없어요.'}
          </p>
        </Modal>
      )}
    </>
  )
}
