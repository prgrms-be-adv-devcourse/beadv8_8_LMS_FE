import type { ReactNode } from 'react'

type PageHeadProps = { title: string; lede?: ReactNode; actions?: ReactNode }

export function PageHead({ title, lede, actions }: PageHeadProps) {
  return (
    <div className="page-head">
      <div className="ph-text">
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
      </div>
      {actions && <div className="ph-actions">{actions}</div>}
    </div>
  )
}
