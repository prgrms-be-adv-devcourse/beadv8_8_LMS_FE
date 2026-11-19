import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { lectureQuery, reviewsQuery } from '@/entities/lecture/api'
import { editLabel } from '@/entities/lecture/edit'
import type { LectureContent, LectureDetail } from '@/entities/lecture/types'
import { LectureThumb } from '@/entities/lecture/ui/LectureThumb'
import { MyLectureStatusPill } from '@/entities/lecture/ui/MyLectureStatusPill'
import { Rating, Stars } from '@/entities/lecture/ui/Rating'
import { useAddToCart } from '@/features/cart/useCartActions'
import { CheckoutModal } from '@/features/checkout/CheckoutModal'
import { LectureCouponIssue } from '@/features/coupon-issue/LectureCouponIssue'
import { ContentPreviewModal } from '@/features/lecture-preview/ContentPreviewModal'
import {
  useBuyerState,
  type BuyerState,
} from '@/features/purchase/useBuyerState'
import { meQuery } from '@/shared/auth/me'
import { MEMBER } from '@/shared/auth/role'
import { useViewer } from '@/shared/auth/session'
import { formatDate } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './LectureDetailPage.module.css'

export function LectureDetailPage() {
  const lectureId = Number(useParams().lectureId)
  const {
    data: lecture,
    error,
    isPending,
    refetch,
  } = useQuery(lectureQuery(lectureId))

  return (
    <div className="page">
      <Link className="back" to="/lectures">
        ← 강의 목록
      </Link>
      {isPending ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : (
        <Detail lecture={lecture} />
      )}
    </div>
  )
}

function Detail({ lecture }: { lecture: LectureDetail }) {
  const { data: me } = useQuery(meQuery)
  // 판매자 본인은 사는 대신 상태를 보고 고치며, 강을 미리 볼 수 있다(목업 v-own).
  const seller = !!me && me.id === lecture.sellerUserId
  // 쿠폰은 살 수 있는 회원만 받는다(비회원·관리자·판매자 본인은 보지 않는다).
  const couponViewer = !!me && MEMBER.includes(me.role) && !seller
  const [preview, setPreview] = useState<LectureContent | null>(null)
  const contents = [...lecture.contents].sort((a, b) => a.sequence - b.sequence)
  return (
    <div className={styles.layout}>
      <header className={styles.hero}>
        <LectureThumb
          lectureId={lecture.lectureId}
          title={lecture.title}
          thumbnailUrl={lecture.thumbnailUrl}
          size="big"
        />
        <div className={styles.heroText}>
          <span className={styles.eyebrow} aria-hidden="true">
            LECTURE · {String(contents.length).padStart(2, '0')} EP
          </span>
          <h1 className={styles.title}>{lecture.title}</h1>
          <div className={styles.sellerRow}>
            <span className={styles.avatar} aria-hidden="true">
              {initialOf(lecture.sellerNickname)}
            </span>
            <b>{lecture.sellerNickname}</b>
            <span className="pill info">인증된 인플루언서</span>
            <span className={styles.spacer} />
            <Rating
              average={lecture.averageRating}
              count={lecture.reviewCount}
            />
          </div>
        </div>
      </header>
      {/* 좁은 화면에서는 구매 패널이 소개 위(히어로 바로 아래)에 온다 */}
      <div className={styles.side}>
        {seller ? (
          <SellerPanel lecture={lecture} />
        ) : (
          <BuyPanel lecture={lecture} couponViewer={couponViewer} />
        )}
      </div>
      <div className={styles.body}>
        {lecture.description && (
          <section className={`panel ${styles.section}`}>
            <h2>강의 소개</h2>
            <p className={styles.description}>{lecture.description}</p>
          </section>
        )}
        <section className={`panel ${styles.section}`}>
          <div className="panel-head">
            <h2>커리큘럼</h2>
            <span className="fine num">{lecture.contents.length}개</span>
          </div>
          <ol className={styles.curr}>
            {contents.map((c, i) => (
              <li key={c.contentId}>
                <span className={styles.no}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span
                  className={`${styles.kind} ${
                    c.contentType === 'VIDEO' ? styles.video : styles.file
                  }`}
                  aria-hidden="true"
                />
                <span className={styles.t}>{c.title}</span>
                <span className="pill mute">
                  {c.contentType === 'VIDEO' ? '영상' : '자료'}
                </span>
                {seller && (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => setPreview(c)}
                  >
                    미리보기
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>
        <Reviews lectureId={lecture.lectureId} />
      </div>
      {preview && (
        <ContentPreviewModal
          lectureId={lecture.lectureId}
          content={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  )
}

/** 아바타 자리의 첫 글자. 이모지·한글도 한 글자로 자른다 */
function initialOf(name: string) {
  return Array.from(name.trim())[0] ?? '?'
}

/** 판매자 본인에게 보이는 오른쪽 패널. 상태와 반려 사유를 보여 주고 수정 화면으로 보낸다 */
function SellerPanel({ lecture }: { lecture: LectureDetail }) {
  return (
    <aside className={`panel sticky ${styles.panel}`}>
      <span className={styles.eyebrow} aria-hidden="true">
        PRICE
      </span>
      <div className={styles.bigPrice}>
        {formatNumber(lecture.priceHp)} <span>HP</span>
      </div>
      <div className="notice">
        <MyLectureStatusPill lecture={lecture} />
        내가 판매하는 강의예요.
      </div>
      {lecture.status === 'REJECTED' && lecture.rejectionReason && (
        <div className="notice warn">
          <b>반려 사유</b> {lecture.rejectionReason}
        </div>
      )}
      {!lecture.deleted && (
        <Link
          className="btn primary block"
          to={`/studio/lectures/${lecture.lectureId}/edit`}
        >
          {editLabel(lecture.status)}
        </Link>
      )}
      <Link className="btn block" to="/studio">
        강의 판매
      </Link>
    </aside>
  )
}

function BuyPanel({
  lecture,
  couponViewer,
}: {
  lecture: LectureDetail
  /** 쿠폰을 받을 수 있는 회원이면 가격 아래에 '쿠폰 받기'를 둔다 */
  couponViewer: boolean
}) {
  const viewer = useViewer()
  const buyer = useBuyerState()
  const addToCart = useAddToCart()
  const [checkout, setCheckout] = useState(false)
  const owned = buyer.owned.get(lecture.lectureId)
  const block = blockReason(lecture, buyer, viewer === 'ADMIN')
  // 담으면 담기 버튼이 '장바구니 보기'로 바뀌어 포커스를 잃으므로, 바뀐 링크로 옮긴다.
  const cartLink = useRef<HTMLAnchorElement>(null)
  const focusCartLink = useRef(false)
  const inCart = buyer.inCart.has(lecture.lectureId)
  useEffect(() => {
    if (!focusCartLink.current || !inCart) return
    focusCartLink.current = false
    cartLink.current?.focus()
  }, [inCart])

  return (
    <aside className={`panel sticky ${styles.panel}`}>
      <span className={styles.eyebrow} aria-hidden="true">
        PRICE
      </span>
      <div className={styles.bigPrice}>
        {formatNumber(lecture.priceHp)} <span>HP</span>
      </div>
      {couponViewer && <LectureCouponIssue lectureId={lecture.lectureId} />}
      {owned ? (
        <>
          <div className="notice">
            <span className="pill ok">보유 중</span>
            {formatDate(owned.purchasedAt)}에 구매한 강의예요.
          </div>
          <Link className="btn primary block" to="/library">
            내 강의에서 보기
          </Link>
        </>
      ) : block ? (
        <div className="notice">{block}</div>
      ) : (
        <>
          {/* 구매 내역을 받기 전에는 이미 산 강의인지 몰라 바로 구매를 막는다. */}
          <button
            type="button"
            className="btn primary block"
            disabled={buyer.loading}
            onClick={() => setCheckout(true)}
          >
            바로 구매
          </button>
          {inCart ? (
            <Link ref={cartLink} className="btn block" to="/cart">
              장바구니 보기
            </Link>
          ) : (
            <button
              type="button"
              className="btn block"
              disabled={addToCart.isPending}
              onClick={() => {
                focusCartLink.current = true
                addToCart.mutate(lecture.lectureId, {
                  onError: () => {
                    focusCartLink.current = false
                  },
                })
              }}
            >
              장바구니 담기
            </button>
          )}
        </>
      )}
      <dl className="kv">
        <dt>구매 확정</dt>
        <dd>직접 확정, 첫 재생, 구매일 다음 날부터 7일 경과 중 먼저</dd>
        <dt>구매 취소</dt>
        <dd>구매 확정 전까지. 결제한 HP를 그대로 돌려받아요</dd>
        <dt>이의 제기</dt>
        <dd>내용이 소개와 다르면 구매일 다음 날부터 30일 안에 고객센터로</dd>
      </dl>
      {checkout && (
        <CheckoutModal
          items={[
            {
              lectureId: lecture.lectureId,
              title: lecture.title,
              priceHp: lecture.priceHp,
            },
          ]}
          onClose={() => setCheckout(false)}
        />
      )}
    </aside>
  )
}

/** 살 수 없는 이유. 최종 판단은 BE가 한다. */
function blockReason(
  lecture: LectureDetail,
  buyer: BuyerState,
  admin: boolean,
): string | null {
  if (admin) return '관리자 계정은 강의를 구매할 수 없어요.'
  if (lecture.sellerUserId === buyer.myUserId)
    return '내가 판매하는 강의는 장바구니에 담거나 살 수 없어요.'
  if (lecture.deleted) return '판매가 끝난 강의예요.'
  if (lecture.status !== 'ON_SALE') return '지금은 판매하지 않는 강의예요.'
  if (!buyer.canBuy) return '이 계정으로는 강의를 살 수 없어요.'
  return null
}

function Reviews({ lectureId }: { lectureId: number }) {
  const { data, error, isPending } = useQuery(reviewsQuery(lectureId))
  return (
    <section className={`panel ${styles.section}`}>
      <div className="panel-head">
        <h2>리뷰</h2>
        <span className="fine">구매 확정 후에만 쓸 수 있어요</span>
      </div>
      {isPending ? (
        <p className="fine">불러오는 중…</p>
      ) : error ? (
        <p className="fine">리뷰를 불러오지 못했어요. {error.message}</p>
      ) : data.content.length === 0 ? (
        <p className={`fine ${styles.noReview}`}>아직 리뷰가 없어요.</p>
      ) : (
        <div>
          {data.content.map((r) => (
            <article key={r.reviewId} className={styles.review}>
              <span className={styles.avatar} aria-hidden="true">
                {initialOf(r.reviewerNickname)}
              </span>
              <div className={styles.reviewMain}>
                <div className={styles.reviewHead}>
                  <b>{r.reviewerNickname}</b>
                  <Stars value={r.rating} />
                  <span className={`fine ${styles.reviewDate}`}>
                    {formatDate(r.createdAt)}
                  </span>
                </div>
                {r.content && <p className={styles.reviewText}>{r.content}</p>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
