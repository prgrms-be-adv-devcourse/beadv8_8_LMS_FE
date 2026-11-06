import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { viewerLabel } from '@/shared/auth/role'
import { AppearanceStatusPill } from './appearance/ui/AppearanceStatusPill'
import { ApplicationStatusPill } from './appearance/ui/ApplicationStatusPill'
import { CancelRequestStatusPill } from './appearance/ui/CancelRequestStatusPill'
import {
  RecruitDeadlinePill,
  RecruitStatusOnlyPill,
  RecruitStatusPill,
} from './appearance/ui/RecruitStatusPill'
import { RequestStatusPill } from './appearance/ui/RequestStatusPill'
import { groupStatusLabel } from './chat/group'
import { HpTaskStatusPill } from './hp-task/ui/HpTaskStatusPill'
import {
  CategoryPill,
  InquiryStatusPill,
  ObjectionResultPill,
} from './inquiry/ui/InquiryPills'
import { MyLectureStatusPill } from './lecture/ui/MyLectureStatusPill'
import { SaleStatusPill } from './lecture/ui/SaleStatusPill'
import { ChannelCard } from './member/ui/ChannelCard'
import { ChannelStatusPill } from './member/ui/ChannelStatusPill'
import { UpgradeStatusPill } from './member/ui/UpgradeStatusPill'
import { OrderItemStatusPill } from './order/ui/OrderItemStatusPill'
import { EarningStatusPill } from './wallet/ui/EarningStatusPill'
import { ExchangeStatusPill } from './wallet/ui/ExchangeStatusPill'
import { RefundStatusPill } from './wallet/ui/RefundStatusPill'

/** BE가 새로 더한, FE가 아직 모르는 값 */
const NEW = 'BRAND_NEW_STATUS' as never
const recruit = { status: NEW, recruitDeadline: '2099-12-31T00:00:00' } as never

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('모르는 상태 값의 상태 표시 (#183)', () => {
  const pills: [name: string, pill: () => ReactElement][] = [
    ['OrderItemStatusPill', () => <OrderItemStatusPill status={NEW} />],
    ['ExchangeStatusPill', () => <ExchangeStatusPill status={NEW} />],
    [
      'HpTaskStatusPill',
      () => <HpTaskStatusPill status={NEW} outcome={null} />,
    ],
    ['AppearanceStatusPill', () => <AppearanceStatusPill status={NEW} />],
    ['ApplicationStatusPill', () => <ApplicationStatusPill status={NEW} />],
    ['ChannelStatusPill', () => <ChannelStatusPill status={NEW} />],
    ['UpgradeStatusPill', () => <UpgradeStatusPill status={NEW} />],
    ['EarningStatusPill', () => <EarningStatusPill status={NEW} />],
    ['RefundStatusPill', () => <RefundStatusPill status={NEW} />],
    ['CancelRequestStatusPill', () => <CancelRequestStatusPill status={NEW} />],
    [
      'RequestStatusPill(호스트)',
      () => <RequestStatusPill status={NEW} side="host" />,
    ],
    [
      'RequestStatusPill(게스트)',
      () => <RequestStatusPill status={NEW} side="guest" />,
    ],
    ['RecruitStatusPill', () => <RecruitStatusPill recruit={recruit} />],
    ['RecruitStatusOnlyPill', () => <RecruitStatusOnlyPill status={NEW} />],
    ['RecruitDeadlinePill', () => <RecruitDeadlinePill recruit={recruit} />],
    [
      'MyLectureStatusPill',
      () => <MyLectureStatusPill lecture={{ status: NEW, deleted: false }} />,
    ],
    ['InquiryStatusPill', () => <InquiryStatusPill status={NEW} />],
    ['ObjectionResultPill', () => <ObjectionResultPill result={NEW} />],
  ]

  it.each(pills)('%s는 모르는 값에도 대체 표시를 그린다', (_, pill) => {
    render(pill())
    expect(screen.getByText('알 수 없는 상태')).toHaveClass('pill', 'mute')
  })

  // 판매 상태는 saleStateOf가 FE 상태로 바꾼 뒤 그린다. 모르는 판매 상태를 지급 예정으로 몰지 않는다(#184).
  it('SaleStatusPill은 모르는 판매 상태를 알 수 없는 상태로 그린다', () => {
    render(
      <SaleStatusPill
        sale={
          { status: NEW, objectionStatus: 'NONE', paidOutAt: null } as never
        }
      />,
    )
    expect(screen.getByText('알 수 없는 상태')).toHaveClass('pill', 'mute')
  })
})

describe('모르는 값의 이름 (#183)', () => {
  it('단체방 상태는 알 수 없는 상태로 부른다', () => {
    expect(groupStatusLabel(NEW)).toBe('알 수 없는 상태')
  })

  it('회원 역할은 알 수 없음으로 부른다', () => {
    expect(viewerLabel(NEW)).toBe('알 수 없음')
  })

  it('문의 분류 배지는 알 수 없음을 그린다', () => {
    render(<CategoryPill category={NEW} />)
    expect(screen.getByText('알 수 없음')).toHaveClass('pill')
  })

  it('채널 플랫폼은 알 수 없음을 그린다', () => {
    render(
      <ChannelCard
        channel={{
          platform: NEW,
          channelName: '별빛 채널',
          channelUrl: 'https://example.com/star',
          followerCount: 10,
          followerCountAt: null,
        }}
      />,
    )
    expect(screen.getByText('알 수 없음')).toHaveClass('pill')
  })
})
