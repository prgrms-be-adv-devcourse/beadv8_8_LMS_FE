/** 움직임 줄이기를 켰는지. matchMedia가 없는 환경(jsdom 등)은 끈 것으로 본다 */
export function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** scrollIntoView·scrollBy의 behavior. 움직임 줄이기를 켰으면 미끄러지지 않고 바로 옮긴다 */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth'
}
