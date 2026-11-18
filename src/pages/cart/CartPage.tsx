import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { cartQuery } from '@/entities/cart/api'
import { LectureThumb } from '@/entities/lecture/ui/LectureThumb'
import { useRemoveFromCart } from '@/features/cart/useCartActions'
import { CheckoutModal } from '@/features/checkout/CheckoutModal'
import { formatNumber } from '@/shared/lib/money'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './CartPage.module.css'

export function CartPage() {
  const { data: cart, error, isPending, refetch } = useQuery(cartQuery)
  const remove = useRemoveFromCart()
  const [checkout, setCheckout] = useState(false)

  const head = (
    <PageHead
      title="장바구니"
      lede="담아 둔 강의는 서버에 저장돼서 다른 기기에서도 그대로 보여요."
    />
  )
  if (isPending)
    return (
      <div className="page">
        {head}
        <Loading />
      </div>
    )
  if (error)
    return (
      <div className="page">
        {head}
        <LoadError error={error} retry={refetch} />
      </div>
    )

  const purchasable = cart.items.filter((i) => i.purchasable)
  const excluded = cart.items.length - purchasable.length

  return (
    <div className="page">
      {head}
      {cart.items.length === 0 ? (
        <EmptyState
          title="장바구니가 비어 있어요"
          action={
            <Link className="btn primary" to="/lectures">
              강의 둘러보기
            </Link>
          }
        >
          마음에 드는 강의를 담아 두면 다른 기기에서도 그대로 보여요.
        </EmptyState>
      ) : (
        <>
          {excluded > 0 && (
            <div className="notice warn">
              판매가 멈춘 강의는 주문에서 빠져요. 다시 판매되면 살 수 있어요.
            </div>
          )}
          <div className={styles.layout}>
            <section
              className={`panel ${styles.list}`}
              aria-labelledby="cart-list-title"
            >
              <div className={styles.listHead}>
                <span id="cart-list-title" className={styles.eyebrow}>
                  담은 강의
                </span>
                <span className="fine num">{cart.items.length}개</span>
              </div>
              <div>
                {cart.items.map((item) => (
                  <div
                    key={item.lectureId}
                    className={
                      item.purchasable
                        ? styles.item
                        : `${styles.item} ${styles.off}`
                    }
                  >
                    <div className={styles.thumb}>
                      <LectureThumb
                        lectureId={item.lectureId}
                        title={item.title}
                        thumbnailUrl={item.thumbnailUrl}
                        size="sm"
                      />
                    </div>
                    <div className={styles.main}>
                      <Link
                        className={styles.title}
                        to={`/lectures/${item.lectureId}`}
                      >
                        {item.title}
                      </Link>
                      {!item.purchasable && (
                        <span>
                          <span className="pill warn">지금 살 수 없어요</span>
                        </span>
                      )}
                    </div>
                    <b className={`num ${styles.price}`}>
                      {formatNumber(item.priceHp)} HP
                    </b>
                    <button
                      type="button"
                      className={`btn ghost sm ${styles.remove}`}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(item.lectureId)}
                      aria-label={`${item.title} 장바구니에서 빼기`}
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            </section>
            <aside
              className={`panel ${styles.summary}`}
              aria-labelledby="cart-summary-title"
            >
              <div className={styles.summaryHead}>
                <span className={styles.eyebrow} aria-hidden="true">
                  Checkout
                </span>
                <h2 id="cart-summary-title">주문 요약</h2>
              </div>
              <div className={styles.lines}>
                <div className={styles.line}>
                  <span>주문할 강의 {purchasable.length}개</span>
                  <span className="num">
                    {formatNumber(cart.purchasableTotalHp)}
                  </span>
                </div>
                {excluded > 0 && (
                  <div className={styles.line}>
                    <span>살 수 없어 제외 {excluded}개</span>
                    <span className="num">0</span>
                  </div>
                )}
                <p className="fine">
                  쿠폰 할인과 보유 HP는 주문 확인에서 계산해요.
                </p>
              </div>
              <div className={styles.total}>
                <span className={styles.totalLabel}>합계</span>
                <b className={`num ${styles.totalValue}`}>
                  {formatNumber(cart.purchasableTotalHp)}
                  <span className={styles.totalUnit}>HP</span>
                </b>
              </div>
              <button
                type="button"
                className={`btn primary block ${styles.pay}`}
                disabled={purchasable.length === 0}
                onClick={() => setCheckout(true)}
              >
                {purchasable.length}개 주문하기
              </button>
            </aside>
          </div>
        </>
      )}
      {checkout && (
        <CheckoutModal items={purchasable} onClose={() => setCheckout(false)} />
      )}
    </div>
  )
}
