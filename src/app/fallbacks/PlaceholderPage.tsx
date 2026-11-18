import { useMatches } from 'react-router'
import type { RouteHandle } from '@/app/routeHandle'
import { PageHead } from '@/shared/ui/PageHead'
import { SignalScreen } from './SignalScreen'

/** 아직 만들지 않은 화면의 자리. 라우트 handle.title을 제목으로 쓴다. */
export function PlaceholderPage() {
  const matches = useMatches()
  const title =
    (matches.at(-1)?.handle as RouteHandle | undefined)?.title ?? '합방'
  return (
    <div className="page">
      <PageHead title={title} />
      <SignalScreen
        code="Stand by"
        screenLabel="STAND BY"
        tone="standby"
        headingLevel={2}
        title="준비 중인 화면이에요"
      >
        곧 이 자리에 화면이 들어와요.
      </SignalScreen>
    </div>
  )
}
