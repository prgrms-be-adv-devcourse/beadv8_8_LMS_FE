import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addCartItem, cartKeys, removeCartItem } from '@/entities/cart/api'
import { toast } from '@/shared/ui/toastStore'

export function useAddToCart() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: addCartItem,
    onSuccess: () => toast('장바구니에 담았어요.'),
    onError: (error) => toast(error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: cartKeys.all }),
  })
}

export function useRemoveFromCart() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: removeCartItem,
    onError: (error) => toast(error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: cartKeys.all }),
  })
}
