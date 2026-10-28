import { loadTossPayments } from '@tosspayments/tosspayments-sdk'

/** 토스페이먼츠 클라이언트 키(test_ck_…, 공개 값). 없으면 충전을 끈다. */
export function tossClientKey(): string | null {
  return import.meta.env.VITE_TOSS_PAYMENTS_CLIENT_KEY || null
}

export type CardPaymentRequest = {
  /** 구매자 식별 값. 이메일·전화번호를 쓰지 않는다. */
  customerKey: string
  /** 결제 금액 (원) */
  amount: number
  orderId: string
  orderName: string
  successUrl: string
  failUrl: string
}

/**
 * 토스페이먼츠 결제창(v2 SDK)으로 카드 결제를 연다. 결과는 successUrl·failUrl 리다이렉트로 받는다.
 * SDK 스크립트는 처음 부를 때 js.tosspayments.com에서 받는다. 테스트는 SDK 모듈을 가짜로 바꾼다.
 */
export async function requestCardPayment(
  clientKey: string,
  { customerKey, amount, ...request }: CardPaymentRequest,
) {
  const tossPayments = await loadTossPayments(clientKey)
  await tossPayments.payment({ customerKey }).requestPayment({
    method: 'CARD',
    amount: { currency: 'KRW', value: amount },
    ...request,
  })
}

/** PC 결제창을 닫으면 리다이렉트 없이 USER_CANCEL로 끝난다(모바일은 failUrl의 PAY_PROCESS_CANCELED). */
export function isUserCancel(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'USER_CANCEL'
  )
}
