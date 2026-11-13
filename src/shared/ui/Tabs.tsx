import * as RadixTabs from '@radix-ui/react-tabs'
import type { ReactNode } from 'react'
import { formatNumber } from '@/shared/lib/money'

type TabItem<T extends string> = {
  value: T
  label: string
  /**
   * 탭 이름 옆 개수. 0 이하이면 숨긴다. 화면 낭독기는 숫자 대신 label을 탭 이름에 이어 읽는다
   * (예: '게스트로, 응답 필요 2건')
   */
  count?: { value: number; label: string }
}

type TabsProps<T extends string> = {
  /** 탭 목록의 접근 가능한 이름 */
  label: string
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  /** 선택된 탭의 패널 내용 */
  children: ReactNode
}

/**
 * WAI-ARIA 탭(Radix Tabs). ←/→·Home·End는 포커스만 옮기고 Enter·Space·클릭으로 고른다.
 * 탭을 고를 때마다 목록을 새로 불러오므로 수동 활성화를 쓴다.
 * 이미 선택된 탭을 다시 고르면 onChange를 부르지 않는다.
 */
export function Tabs<T extends string>({
  label,
  items,
  value,
  onChange,
  children,
}: TabsProps<T>) {
  return (
    <RadixTabs.Root
      value={value}
      onValueChange={(next) => onChange(next as T)}
      activationMode="manual"
      className="tab-group"
    >
      <RadixTabs.List className="tabs" aria-label={label}>
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.value}
            value={item.value}
            className={item.value === value ? 'tab on' : 'tab'}
          >
            {item.label}
            {item.count && item.count.value > 0 && (
              <>
                <span className="n" aria-hidden="true">
                  {formatNumber(item.count.value)}
                </span>
                <span className="sr-only">, {item.count.label}</span>
              </>
            )}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      <RadixTabs.Content value={value} className="tab-panel">
        {children}
      </RadixTabs.Content>
    </RadixTabs.Root>
  )
}
