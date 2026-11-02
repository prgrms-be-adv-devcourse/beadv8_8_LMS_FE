import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { queryClient } from '@/app/queryClient'
import { routes } from '@/app/router'
import '@/shared/styles/tokens.css'
import '@/shared/styles/global.css'

// 라우터는 만들 때 첫 화면의 loader(로그인 확인)를 바로 부르므로 앱 시작점에서만 만든다(테스트가 routes만 가져다 쓸 때
// 요청이 나가지 않게).
const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
