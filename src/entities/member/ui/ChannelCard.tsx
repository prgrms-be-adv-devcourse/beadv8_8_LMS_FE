import type { ReactNode } from 'react'
import { formatDate } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { PLATFORM_LABEL, type Channel } from '../types'

type ChannelCardProps = {
  channel: Channel
  /** 상태 표시·버튼 등 오른쪽에 붙일 것 */
  aside?: ReactNode
  children?: ReactNode
}

/** 채널 한 줄: 플랫폼, 채널 이름(채널 주소로 이동), 팔로워 수 */
export function ChannelCard({ channel, aside, children }: ChannelCardProps) {
  return (
    <div className="row-item">
      <div className="row-main">
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <span className="pill info">{PLATFORM_LABEL[channel.platform]}</span>
          <a
            className="row-title"
            href={channel.channelUrl}
            target="_blank"
            rel="noreferrer"
          >
            {channel.channelName}
          </a>
        </div>
        <span className="fine">
          팔로워 <b className="num">{formatNumber(channel.followerCount)}</b>
          {channel.followerCountAt &&
            ` · ${formatDate(channel.followerCountAt)} 기준`}
        </span>
        {children}
      </div>
      {aside}
    </div>
  )
}
