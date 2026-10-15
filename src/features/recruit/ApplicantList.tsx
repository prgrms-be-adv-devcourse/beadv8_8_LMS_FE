import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { recruitApplicationsQuery } from '@/entities/appearance/api'
import { isRecruitOpen } from '@/entities/appearance/recruit'
import type { Application, Recruit } from '@/entities/appearance/types'
import { ApplicationStatusPill } from '@/entities/appearance/ui/ApplicationStatusPill'
import { MemberChip } from '@/entities/member/ui/MemberChip'
import { useStartChat } from '@/features/chat/useChatActions'
import { formatDateTime } from '@/shared/lib/date'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import { AcceptApplicationModal, RejectApplicationModal } from './RecruitModals'

type ModalState = { type: 'accept' | 'reject'; application: Application } | null

/** 내 모집글의 지원자 목록 (호스트). 대기 중인 지원을 수락·거절한다 */
export function ApplicantList({ recruit }: { recruit: Recruit }) {
  const [page, setPage] = usePageParam('page')
  const query = useQuery(recruitApplicationsQuery(recruit.id, page))
  const { data, error, isPending, refetch } = query
  const moving = useClampPage(page, query, setPage)
  const [modal, setModal] = useState<ModalState>(null)
  const close = () => setModal(null)
  const startChat = useStartChat()
  const open = isRecruitOpen(recruit)
  const full = recruit.selectedCount >= recruit.recruitCount
  const waiting = data?.content.some((a) => a.status === 'APPLIED')

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>지원자 {recruit.applicantCount}명</h2>
        <span className="fine">
          성립 {recruit.selectedCount} / {recruit.recruitCount}명
        </span>
      </div>
      {isPending || moving ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.content.length === 0 ? (
        <p className="fine">아직 지원한 게스트가 없어요.</p>
      ) : (
        <>
          {open && full && waiting && (
            <div className="notice">
              정원이 다 차서 더 수락할 수 없어요. 조기 마감하면 대기 중인 지원은
              미선정이 돼요.
            </div>
          )}
          <div>
            {data.content.map((application) => (
              <div
                key={application.id}
                className={
                  application.status === 'WITHDRAWN' ? 'appl off' : 'appl'
                }
              >
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <MemberChip memberId={application.guestId} size={32} />
                    <ApplicationStatusPill status={application.status} />
                    {application.appearanceId !== null && (
                      <span className="fine">
                        출연 #{application.appearanceId}
                      </span>
                    )}
                  </div>
                  {application.message && (
                    <p style={{ fontSize: 14, color: 'var(--ink-2)' }}>
                      {application.message}
                    </p>
                  )}
                  <span className="fine">
                    {formatDateTime(application.createdAt)} 지원
                  </span>
                </div>
                <div className="row-actions">
                  {open && application.status === 'APPLIED' && (
                    <>
                      <button
                        type="button"
                        className="btn primary sm"
                        disabled={full}
                        onClick={() =>
                          setModal({ type: 'accept', application })
                        }
                      >
                        수락
                      </button>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() =>
                          setModal({ type: 'reject', application })
                        }
                      >
                        거절
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="btn ghost sm"
                    disabled={startChat.isPending}
                    onClick={() => startChat.mutate(application.guestId)}
                  >
                    채팅
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Pager
            page={data.page.number}
            totalPages={data.page.totalPages}
            onChange={setPage}
          />
        </>
      )}
      {modal?.type === 'accept' && (
        <AcceptApplicationModal
          application={modal.application}
          recruit={recruit}
          onClose={close}
        />
      )}
      {modal?.type === 'reject' && (
        <RejectApplicationModal
          application={modal.application}
          onClose={close}
        />
      )}
    </section>
  )
}
