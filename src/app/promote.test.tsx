import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { UpgradeRequest } from '@/entities/member/types'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const upgrade = (patch: Partial<UpgradeRequest> = {}): UpgradeRequest => ({
  id: 1,
  status: 'PENDING',
  requestReason: '통기타 라이브 세팅 5강',
  rejectionReason: null,
  requestedAt: '2026-10-14T10:00:00',
  reviewedAt: null,
  ...patch,
})

afterEach(() => {
  queryClient.clear()
  closeLoginModal()
})

describe('승급 신청', () => {
  it('사유를 적어 신청하면 심사 중으로 바뀌고 폼이 사라진다', async () => {
    let list: UpgradeRequest[] = []
    let body: unknown
    server.use(
      http.get('*/api/v1/members/upgrade-requests/me', () => rs(list)),
      http.post('*/api/v1/members/upgrade-requests', async ({ request }) => {
        body = await request.json()
        list = [upgrade()]
        return rs(list[0], 201)
      }),
    )
    document.cookie = 'XSRF-TOKEN=t'
    renderApp('/promote', 'INFLUENCER')

    const submit = await screen.findByRole('button', { name: '승급 신청' })
    expect(submit).toBeDisabled()
    await userEvent.type(
      screen.getByLabelText('승급 신청 사유'),
      '  통기타 라이브 세팅 5강  ',
    )
    await userEvent.click(submit)

    expect(await screen.findByText(/에 신청했어요/)).toBeInTheDocument()
    expect(body).toEqual({ reason: '통기타 라이브 세팅 5강' })
    expect(screen.queryByLabelText('승급 신청 사유')).toBeNull()
    expect(
      screen.getByRole('heading', { name: '신청 내역' }),
    ).toBeInTheDocument()
  })

  it('반려되면 사유를 보여 주고 다시 신청할 수 있다', async () => {
    server.use(
      http.get('*/api/v1/members/upgrade-requests/me', () =>
        rs([
          upgrade({
            status: 'REJECTED',
            rejectionReason: '강의 목차를 구체적으로 적어 주세요',
            reviewedAt: '2026-10-15T09:00:00',
          }),
        ]),
      ),
    )
    renderApp('/promote', 'INFLUENCER')
    expect(
      (await screen.findAllByText(/강의 목차를 구체적으로 적어 주세요/)).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getByRole('button', { name: '다시 신청' }),
    ).toBeInTheDocument()
  })

  it('승인되면 내 정보를 다시 불러와 그 자리에서 완료 안내를 보여 준다', async () => {
    let meCalls = 0
    server.use(
      http.get('*/api/v1/members/upgrade-requests/me', () =>
        rs([
          upgrade({ status: 'APPROVED', reviewedAt: '2026-10-15T09:00:00' }),
        ]),
      ),
      http.get('*/api/v1/members/me', () => {
        meCalls++
        return rs({
          id: ME_ID,
          email: 'a@b.c',
          nickname: '하늘',
          role: 'VERIFIED_INFLUENCER',
          status: 'ACTIVE',
          profileImageUrl: null,
        })
      }),
    )
    const router = renderApp('/promote', 'INFLUENCER')

    expect(await screen.findByText('승급 완료')).toBeInTheDocument()
    expect(meCalls).toBeGreaterThan(0)
    expect(router.state.location.pathname).toBe('/promote')
    expect(screen.queryByText('이 화면을 볼 권한이 없어요.')).toBeNull()
    expect(screen.getByRole('link', { name: '강의 판매로' })).toHaveAttribute(
      'href',
      '/studio',
    )
  })

  it('승인됐는데 내 정보가 그대로면 다시 불러오기와 재로그인을 안내한다', async () => {
    let role = 'INFLUENCER'
    let meCalls = 0
    server.use(
      http.get('*/api/v1/members/upgrade-requests/me', () =>
        rs([
          upgrade({ status: 'APPROVED', reviewedAt: '2026-10-15T09:00:00' }),
        ]),
      ),
      http.get('*/api/v1/members/me', () => {
        meCalls++
        return rs({
          id: ME_ID,
          email: 'a@b.c',
          nickname: '하늘',
          role,
          status: 'ACTIVE',
          profileImageUrl: null,
        })
      }),
    )
    renderApp('/promote', 'INFLUENCER')

    const notice = (await screen.findByText(/아직 계정에 반영되지 않았어요/))
      .parentElement as HTMLElement
    expect(meCalls).toBe(1)
    // 상단 바에도 로그아웃이 있으므로 안내 안에서 찾는다.
    expect(
      within(notice).getByRole('button', { name: '로그아웃' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('승급 신청 사유')).toBeNull()

    role = 'VERIFIED_INFLUENCER'
    await userEvent.click(
      within(notice).getByRole('button', { name: '다시 불러오기' }),
    )
    expect(await screen.findByText('승급 완료')).toBeInTheDocument()
    expect(meCalls).toBe(2)
  })

  it('심사 중이면 다시 신청할 수 없다', async () => {
    server.use(
      http.get('*/api/v1/members/upgrade-requests/me', () => rs([upgrade()])),
    )
    renderApp('/promote', 'INFLUENCER')
    expect(await screen.findByText(/에 신청했어요/)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /신청$/ })).toBeNull(),
    )
  })
})
