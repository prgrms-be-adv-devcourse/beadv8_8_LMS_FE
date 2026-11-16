import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { useMergedSearchParams } from './useMergedSearchParams'

type Update = ReturnType<typeof useMergedSearchParams>[1]

/** loader를 붙잡아 이동을 끝나지 않은 채로 둘 수 있는 라우터 */
function setup(initial = '/') {
  const probe: { update?: Update } = {}
  let hold = false
  const pending: (() => void)[] = []
  function Probe() {
    const [, update] = useMergedSearchParams()
    useEffect(() => {
      probe.update = update
    })
    return null
  }
  const router = createMemoryRouter(
    [
      {
        path: '/',
        loader: () =>
          hold ? new Promise<null>((r) => pending.push(() => r(null))) : null,
        Component: Probe,
      },
    ],
    { initialEntries: [initial] },
  )
  render(<RouterProvider router={router} />)
  const set = (key: string, value: string) =>
    probe.update?.((p) => {
      p.set(key, value)
      return p
    })
  return {
    router,
    set,
    hold: () => {
      hold = true
    },
    release: async () => {
      hold = false
      await act(async () => pending.splice(0).forEach((r) => r()))
    },
  }
}

describe('useMergedSearchParams', () => {
  it('앞선 이동이 loader를 기다리는 동안 다른 값을 바꿔도 앞서 바꾼 값을 지킨다', async () => {
    const { router, set, hold, release } = setup()
    await act(async () => {})
    hold()

    await act(async () => set('verified', 'true'))
    expect(router.state.navigation.state).toBe('loading')
    await act(async () => set('minFollowers', '10000'))
    await release()

    expect(
      Object.fromEntries(new URLSearchParams(router.state.location.search)),
    ).toEqual({ verified: 'true', minFollowers: '10000' })
  })

  it('보낸 이동이 끝나기 전에 다른 이동으로 바뀌면, 멈춘 뒤의 실제 URL 위에 합친다', async () => {
    const { router, set, hold, release } = setup('/?keyword=a')
    await act(async () => {})
    hold()

    await act(async () => set('verified', 'true'))
    // 끝나지 않은 이동을 다른 이동이 덮는다(뒤로 가기·다른 링크 등)
    await act(async () => {
      void router.navigate('/?keyword=b')
    })
    await release()
    expect(router.state.location.search).toBe('?keyword=b')

    await act(async () => set('sort', 'rating'))
    expect(
      Object.fromEntries(new URLSearchParams(router.state.location.search)),
    ).toEqual({ keyword: 'b', sort: 'rating' })
  })
})
