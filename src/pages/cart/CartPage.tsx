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
          <div className="split">
            <section className="panel">
              <div className="rows">
                {cart.items.map((item) => (
                  <div
                    key={item.lectureId}
                    className={item.purchasable ? 'row-item' : 'row-item off'}
                  >
                    <LectureThumb
                      lectureId={item.lectureId}
                      title={item.title}
                      thumbnailUrl={item.thumbnailUrl}
                      size="sm"
                    />
                    <div className="row-main">
                      <Link
                        className="row-title"
                        to={`/lectures/${item.lectureId}`}
                        style={{ textDecoration: 'none' }}
                      >
                        {item.title}
                      </Link>
                      {!item.purchasable && (
                        <span>
                          <span className="pill warn">지금 살 수 없어요</span>
                        </span>
                      )}
                    </div>
                    <b className="num">{formatNumber(item.priceHp)} HP</b>
                    <button
                      type="button"
                      className="btn ghost sm"
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
            <aside className="panel sticky">
              <h2>주문 요약</h2>
              <div className="breakdown">
                <div className="row sub">
                  <span>주문할 강의 {purchasable.length}개</span>
                  <span className="num">
                    {formatNumber(cart.purchasableTotalHp)}
                  </span>
                </div>
                {excluded > 0 && (
                  <div className="row sub">
                    <span>살 수 없어 제외 {excluded}개</span>
                    <span className="num">0</span>
                  </div>
                )}
                <div className="row total">
                  <span>합계</span>
                  <b className="num">
                    {formatNumber(cart.purchasableTotalHp)} HP
                  </b>
                </div>
              </div>
              <button
                type="button"
                className="btn primary block"
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
