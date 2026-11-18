import type { ReactNode } from 'react'

type PageHeadProps = {
  title: string
  lede?: ReactNode
  actions?: ReactNode
  /** 제목 위 작은 머리표(모노, 대문자). 화면 묶음 이름처럼 짧게 */
  eyebrow?: string
}

export function PageHead({ title, lede, actions, eyebrow }: PageHeadProps) {
  return (
    <div className="page-head">
      <div className="ph-text">
        {eyebrow && <p className="ph-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
      </div>
      {actions && <div className="ph-actions">{actions}</div>}
    </div>
  )
}
