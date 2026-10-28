import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { Cart } from './types'

export const cartKeys = {
  all: ['cart'] as const,
}

/** 장바구니는 서버에 저장되어 다른 기기에서도 같다. */
export const cartQuery = queryOptions({
  queryKey: cartKeys.all,
  queryFn: () => api<Cart>('/lectures/cart'),
})

export function addCartItem(lectureId: number) {
  return api<void>('/lectures/cart/items', {
    method: 'POST',
    body: { lectureId },
  })
}

export function removeCartItem(lectureId: number) {
  return api<void>(`/lectures/cart/items/${lectureId}`, { method: 'DELETE' })
}
