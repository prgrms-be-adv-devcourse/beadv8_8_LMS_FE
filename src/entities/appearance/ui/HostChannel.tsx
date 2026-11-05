import { hostChannelView } from '../rules'

/** 요청서·모집글의 호스트 채널. 정상 주소는 새 탭 링크, 탈퇴로 파기된 채널은 안내 글자다 */
export function HostChannel({ url }: { url: string }) {
  const view = hostChannelView(url)
  if (view.kind === 'withdrawn')
    return <span className="muted">탈퇴한 회원의 채널</span>
  if (view.kind === 'text') return <span>{view.text}</span>
  return (
    <a className="link" href={view.href} target="_blank" rel="noreferrer">
      {view.href}
    </a>
  )
}
