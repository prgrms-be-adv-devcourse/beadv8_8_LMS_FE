/** 모집 인원만큼 칸을 그리고 성립한 자리를 채운다 (목업 .seats) */
export function RecruitSeats({
  selected,
  total,
}: {
  selected: number
  total: number
}) {
  return (
    <div
      className="seats"
      role="img"
      aria-label={`성립 ${selected}명 / 모집 ${total}명`}
    >
      {Array.from({ length: total }, (_, k) => (
        <span key={k} className={k < selected ? 'seat on' : 'seat'} />
      ))}
    </div>
  )
}
