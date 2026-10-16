import { useQuery } from '@tanstack/react-query'
import { cartQuery } from '@/entities/cart/api'

/**
 * 장바구니에 담은 강의 수. 불러오는 중이거나 실패하면 undefined다.
 * 장바구니 쿼리를 함께 쓰므로 담기·빼기·주문 뒤 cartKeys 무효화로 함께 갱신된다.
 */
export function useCartCount(enabled: boolean) {
  const { data } = useQuery({
    ...cartQuery,
    select: (cart) => cart.items.length,
    enabled,
  })
  return data
}
