import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router/dom'
import { queryClient } from '@/app/queryClient'
import { router } from '@/app/router'
import '@/shared/styles/tokens.css'
import '@/shared/styles/global.css'

/** 개발 서버에서 VITE_ENABLE_MSW=true일 때만 BE 대신 MSW 목 응답을 쓴다(.env.example). */
async function enableMocking() {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_MSW !== 'true') return
  const { worker } = await import('@/mocks/browser')
  // 목이 없는 요청은 그대로 로컬 BE(프록시)로 보낸다.
  await worker.start({ onUnhandledFrame: 'bypass' })
}

enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  )
})
