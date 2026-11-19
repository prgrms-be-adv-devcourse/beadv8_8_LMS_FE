import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { myLecturesQuery, salesQuery } from '@/entities/lecture/api'
import { isRefunded, saleShareLabel } from '@/entities/lecture/sale'
import type { MyLecture, Sale } from '@/entities/lecture/types'
import { LectureThumb } from '@/entities/lecture/ui/LectureThumb'
import { MyLectureStatusPill } from '@/entities/lecture/ui/MyLectureStatusPill'
import { SaleStatusPill } from '@/entities/lecture/ui/SaleStatusPill'
import { DeleteLectureModal } from '@/features/lecture-delete/DeleteLectureModal'
import { formatDate } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './StudioPage.module.css'

export function StudioPage() {
  return (
    <div className="page">
      <PageHead
        title="강의 판매"
        lede="등록한 강의는 관리자 검수를 통과하면 공개돼요. 판매 수익은 구매일 다음 날부터 30일이 지나면 지급돼요."
        actions={
          <Link className="btn primary" to="/studio/lectures/new">
            <span aria-hidden="true">+</span> 강의 등록
          </Link>
        }
      />
      <MyLectures />
      <Sales />
    </div>
  )
}

function MyLectures() {
  const [page, setPage] = usePageParam('page')
  const query = useQuery(myLecturesQuery(page))
  const { data, error, isPending, refetch } = query
  const moving = useClampPage(page, query, setPage)
  const [deleting, setDeleting] = useState<MyLecture | null>(null)

  return (
    <section className={`panel ${styles.panel}`}>
      <div className={styles.panelHead}>
        <div className={styles.headText}>
          <span className={styles.eyebrow} aria-hidden="true">
            My lectures
          </span>
          <h2>내 강의</h2>
        </div>
        {data && !moving && data.page.totalElements > 0 && (
          <span className={styles.count}>
            총 {formatNumber(data.page.totalElements)}개
          </span>
        )}
      </div>
      {isPending || moving ? (
        <LectureSkeleton />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.content.length === 0 ? (
        <EmptyState
          title="등록한 강의가 없어요"
          action={
            <Link className="btn primary" to="/studio/lectures/new">
              첫 강의 등록하기
            </Link>
          }
        >
          영상이나 자료를 올려 첫 강의를 만들어 보세요. 검수를 통과하면 판매가
          시작돼요.
        </EmptyState>
      ) : (
        <>
          <div className="rows">
            {data.content.map((lecture) => (
              <MyLectureRow
                key={lecture.lectureId}
                lecture={lecture}
                onDelete={() => setDeleting(lecture)}
              />
            ))}
          </div>
          <Pager
            page={data.page.number}
            totalPages={data.page.totalPages}
            onChange={setPage}
          />
          <p className={`fine ${styles.foot}`}>
            삭제하면 목록 노출과 신규 판매만 멈추고, 기존 구매자는 계속 볼 수
            있어요.
          </p>
        </>
      )}
      {deleting && (
        <DeleteLectureModal
          lecture={deleting}
          onClose={() => setDeleting(null)}
        />
      )}
    </section>
  )
}

/** 내 강의를 불러오는 동안 줄 모양 자리 */
function LectureSkeleton() {
  return (
    <div className={styles.skeleton} role="status">
      <span className="sr-only">불러오는 중…</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.skRow} aria-hidden="true">
          <span className={styles.skThumb} />
          <span className={styles.skText}>
            <span className={styles.skLine} />
            <span className={`${styles.skLine} ${styles.short}`} />
          </span>
        </div>
      ))}
    </div>
  )
}

function MyLectureRow({
  lecture,
  onDelete,
}: {
  lecture: MyLecture
  onDelete: () => void
}) {
  const rejected = lecture.status === 'REJECTED'
  return (
    <div
      className={`${lecture.deleted ? 'row-item off' : 'row-item'} ${styles.lecture}`}
    >
      <div className={styles.thumb}>
        <LectureThumb
          lectureId={lecture.lectureId}
          title={lecture.title}
          thumbnailUrl={lecture.thumbnailUrl}
          size="sm"
        />
      </div>
      <div className="row-main">
        <div className={styles.titleLine}>
          <Link
            className={`row-title ${styles.title}`}
            to={`/lectures/${lecture.lectureId}`}
          >
            {lecture.title}
          </Link>
          <MyLectureStatusPill lecture={lecture} />
        </div>
        <div className={styles.meta}>
          <span className={styles.price}>
            {formatNumber(lecture.priceHp)} HP
          </span>
          <span className={styles.stamp}>
            등록 {formatDate(lecture.createdAt)}
          </span>
          {!lecture.deleted && lecture.status === 'PENDING_INSPECTION' ? (
            <span className={styles.stamp}>
              검수 신청 {formatDate(lecture.inspectionRequestedAt)}
            </span>
          ) : (
            lecture.inspectedAt && (
              <span className={styles.stamp}>
                검수 {formatDate(lecture.inspectedAt)}
              </span>
            )
          )}
        </div>
        {rejected && lecture.rejectionReason && (
          <p className={styles.reject}>반려 사유: {lecture.rejectionReason}</p>
        )}
      </div>
      {!lecture.deleted && (
        <div className={`row-actions ${styles.actions}`}>
          <Link
            className={rejected ? 'btn sm primary' : 'btn sm'}
            to={`/studio/lectures/${lecture.lectureId}/edit`}
          >
            {rejected ? '수정 후 재검수' : '수정'}
          </Link>
          <button type="button" className="btn ghost sm" onClick={onDelete}>
            삭제
          </button>
        </div>
      )}
    </div>
  )
}

function Sales() {
  const [page, setPage] = usePageParam('salesPage')
  const query = useQuery(salesQuery(page))
  const { data, error, isPending, refetch } = query
  const moving = useClampPage(page, query, setPage)

  return (
    <section className={`panel ${styles.panel}`}>
      <div className={styles.headText}>
        <span className={styles.eyebrow} aria-hidden="true">
          Sales
        </span>
        <h2>판매 내역</h2>
      </div>
      {isPending || moving ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.content.length === 0 ? (
        <EmptyState title="아직 판매 내역이 없어요" />
      ) : (
        <>
          <div className="tbl-wrap">
            <table className="tbl" aria-label="판매 내역">
              <thead>
                <tr>
                  <th scope="col">구매일</th>
                  <th scope="col">강의</th>
                  <th className="r" scope="col">
                    원가격
                  </th>
                  <th className="r" scope="col">
                    할인
                  </th>
                  <th className="r" scope="col">
                    지급액
                  </th>
                  <th scope="col">지급 예정일</th>
                  <th scope="col">상태</th>
                </tr>
              </thead>
              <tbody>
                {data.content.map((sale) => (
                  <SaleRow key={sale.orderItemId} sale={sale} />
                ))}
              </tbody>
            </table>
          </div>
          {data.content.some((sale) => sale.discountHp > 0) && (
            <p className="fine">
              쿠폰 할인 중 판매자 부담만 지급액에서 빠져요. 플랫폼 부담은
              지급액에서 빠지지 않아요.
            </p>
          )}
          <Pager
            page={data.page.number}
            totalPages={data.page.totalPages}
            onChange={setPage}
          />
        </>
      )}
    </section>
  )
}

function SaleRow({ sale }: { sale: Sale }) {
  const share = saleShareLabel(sale)
  return (
    <tr>
      <td>{formatDate(sale.purchasedAt)}</td>
      <td>{sale.lectureTitle}</td>
      <td className="r num">{formatNumber(sale.priceHp)}</td>
      <td className="r">
        {share ? (
          <>
            <span className="num">−{formatNumber(sale.discountHp)}</span>
            <div className="fine num">{share}</div>
          </>
        ) : (
          <span className="num muted">0</span>
        )}
      </td>
      <td className={isRefunded(sale) ? 'r num' : `r num ${styles.payout}`}>
        {formatNumber(sale.sellerPayoutHp)}
      </td>
      <td>{isRefunded(sale) ? '—' : formatDate(sale.payoutScheduledAt)}</td>
      <td>
        <SaleStatusPill sale={sale} />
      </td>
    </tr>
  )
}
