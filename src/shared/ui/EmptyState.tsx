import type { ReactNode } from 'react'

type EmptyStateProps = {
  title: string
  children?: ReactNode
  action?: ReactNode
}

export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <div className="panel empty-state">
      <b>{title}</b>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}
