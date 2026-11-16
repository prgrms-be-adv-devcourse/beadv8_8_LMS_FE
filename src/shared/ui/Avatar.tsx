type AvatarProps = {
  name: string
  imageUrl?: string | null
  size?: number
  /** 사진을 불러오지 못했을 때. 주소를 다시 받아 바꿔 끼우거나 null로 바꿔 글자 아바타로 돌린다 */
  onImageError?: () => void
}

const COLORS = [
  '#EE5A24',
  '#2C5FD6',
  '#0A8659',
  '#A0650C',
  '#7A3FD1',
  '#14161B',
]

/** 프로필 사진. 없으면 이름 첫 글자를 색 원 안에 보여 준다. */
export function Avatar({
  name,
  imageUrl,
  size = 40,
  onImageError,
}: AvatarProps) {
  const style = { width: size, height: size, fontSize: size * 0.42 }
  if (imageUrl)
    return (
      <img
        className="avatar"
        src={imageUrl}
        alt=""
        style={{ ...style, objectFit: 'cover' }}
        onError={onImageError}
      />
    )
  const code = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  return (
    <span
      className="avatar"
      style={{ ...style, background: COLORS[code % COLORS.length] }}
      aria-hidden="true"
    >
      {[...name][0] ?? '?'}
    </span>
  )
}
