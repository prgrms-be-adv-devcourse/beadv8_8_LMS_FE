import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { myInquiryQuery } from '@/entities/inquiry/api'
import { canDeleteInquiry, isWithdrawn } from '@/entities/inquiry/objection'
import type { Inquiry } from '@/entities/inquiry/types'
import { InquiryHead } from '@/entities/inquiry/ui/InquiryHead'
import { InquiryThread } from '@/entities/inquiry/ui/InquiryThread'
import { useDeleteInquiry } from '@/features/inquiry/useInquiryActions'
import { Modal } from '@/shared/ui/Modal'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import { toast } from '@/shared/ui/toastStore'

export function InquiryPage() {
  const inquiryId = Number(useParams().inquiryId)
  const { data, error, refetch } = useQuery(myInquiryQuery(inquiryId))
  const withdrawn = isWithdrawn(data, error)
  const navigate = useNavigate()

  // 철회 처리 중이던 문의가 사라졌다. 강의가 철회해 문의가 지워졌으므로 고객센터로 돌아간다.
  useEffect(() => {
    if (!withdrawn) return
    toast('이의 제기를 철회했어요.')
    navigate('/support', { replace: true })
  }, [withdrawn, navigate])

  // 다시 불러오다 실패해도(일시 오류) 이미 받은 문의를 그대로 보이고, 다음 다시 불러오기를 기다린다.
  return (
    <div className="page narrow">
      <Link className="back" to="/support">
        ← 고객센터
      </Link>
      {data ? (
        <Detail inquiry={data} />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : (
        <Loading />
      )}
    </div>
  )
}

function Detail({ inquiry }: { inquiry: Inquiry }) {
  const [confirming, setConfirming] = useState(false)
  const remove = useDeleteInquiry(inquiry.inquiryId)
  const deletable = canDeleteInquiry(inquiry)
  // 접수된 이의 제기를 지우면 강의에 철회를 요청한다. 접수되지 않은 것(접수 불가)은 바로 지운다.
  const withdrawal =
    inquiry.category === 'LECTURE_CONTENT_DISPUTE' &&
    inquiry.objectionLinkStatus === 'FILED'

  return (
    <>
      <InquiryHead inquiry={inquiry} />
      <ObjectionNote inquiry={inquiry} />
      <InquiryThread inquiry={inquiry} author="나" />
      {deletable ? (
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
      ) : (
        inquiry.status === 'WAITING' &&
        inquiry.objectionLinkStatus !== 'WITHDRAWAL_PENDING' && (
          <p className="fine">
            이의 제기를 처리하는 동안에는 문의를 삭제할 수 없어요.
          </p>
        )
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
            {withdrawal
              ? '삭제하면 이의 제기를 철회해요. 철회가 끝나면 문의가 사라지고, 멈췄던 판매자 지급이 다시 진행돼요.'
              : '삭제한 문의는 되돌릴 수 없어요.'}
          </p>
        </Modal>
      )}
    </>
  )
}

/**
 * 이의 제기의 강의 연동 안내. 처리 중은 FE 문구로, 접수 불가·처리 지연은 서버 안내(objectionNotice)로 보인다.
 * 실패 코드·명령 ID는 회원 응답에 없다(BE D60 (4)). 모르는 상태는 서버 안내가 없으면 숨긴다.
 */
function ObjectionNote({ inquiry }: { inquiry: Inquiry }) {
  if (inquiry.category !== 'LECTURE_CONTENT_DISPUTE') return null
  switch (inquiry.objectionLinkStatus) {
    case 'FILING':
      return (
        <p className="notice warn" role="status">
          이의 제기 접수를 처리하고 있어요. 접수되면 판매자 지급이 멈추고,
          결과가 나오면 이 화면이 바뀌어요.
        </p>
      )
    case 'FILED':
    case 'RESOLUTION_PENDING':
      return (
        <p className="app-note">
          관리자 판단이 나올 때까지 이 강의의 판매자 지급이 멈춰요. 인정되면
          HP가 돌아오고, 기각되면 판매자에게 지급돼요.
        </p>
      )
    case 'WITHDRAWAL_PENDING':
      return (
        <p className="notice warn" role="status">
          이의 제기 철회를 처리하고 있어요. 철회가 끝나면 문의가 사라지고
          고객센터로 돌아가요.
        </p>
      )
    default:
      return inquiry.objectionNotice ? (
        <p className="notice bad" role="status">
          {inquiry.objectionNotice}
        </p>
      ) : null
  }
}
