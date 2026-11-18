import { useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { browseItems, sectionFor } from '@/app/nav'
import type { Viewer } from '@/shared/auth/role'
import { openLoginModal } from '@/shared/ui/loginModal'
import { Modal } from '@/shared/ui/Modal'
import { AccountMenuContent } from './AccountMenu'
import { Icon, LOGIN_ICON, ME_ICON, NavIcon } from './icons'
import site from './SiteNav.module.css'

/**
 * 구역 탭: 내 강의(내 강의·주문 내역·쿠폰함), 스튜디오(강의 판매·쿠폰 신청)의 목록 화면 맨 위에 둔다.
 * 화면 파일이 아니라 셸이 경로를 보고 그린다(nav.ts SECTIONS).
 */
export function SectionTabs({ viewer }: { viewer: Viewer }) {
  const { pathname } = useLocation()
  const section = sectionFor(viewer, pathname)
  if (!section) return null
  return (
    <nav
      className={`tabs ${site.sectionTabs}`}
      aria-label={`${section.name} 메뉴`}
    >
      {section.items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end
          className={({ isActive }) =>
            isActive ? `tab on ${site.sectionTab}` : `tab ${site.sectionTab}`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

/**
 * 좁은 화면(≤860px) 하단 탭바: 홈 · 둘러보기 항목 · 마이(회원) 또는 로그인(비회원).
 * '마이'는 계정 메뉴를 시트(공용 Modal, 좁은 화면에서 아래에서 올라온다)로 연다. 화면을 옮기면 닫힌다.
 */
export function BottomTabBar({ viewer }: { viewer: Viewer }) {
  const { pathname } = useLocation()
  const [sheetAt, setSheetAt] = useState<string | null>(null)
  const sheetOpen = sheetAt === pathname
  const close = () => setSheetAt(null)
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${site.tabItem} ${site.on}` : site.tabItem

  return (
    <>
      <nav className={site.tabBar} aria-label="주요 메뉴">
        <NavLink to="/" end className={tabClass}>
          <NavIcon path="/" />
          <span className={site.tabLabel}>홈</span>
        </NavLink>
        {browseItems(viewer).map((item) => (
          <NavLink key={item.path} to={item.path} className={tabClass}>
            <NavIcon path={item.path} />
            <span className={site.tabLabel}>{item.label}</span>
          </NavLink>
        ))}
        {viewer === 'GUEST' ? (
          <button
            type="button"
            className={site.tabItem}
            onClick={() => openLoginModal()}
          >
            <Icon d={LOGIN_ICON} />
            <span className={site.tabLabel}>로그인</span>
          </button>
        ) : (
          <button
            type="button"
            className={sheetOpen ? `${site.tabItem} ${site.on}` : site.tabItem}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            onClick={() => setSheetAt(pathname)}
          >
            <Icon d={ME_ICON} />
            <span className={site.tabLabel}>마이</span>
          </button>
        )}
      </nav>
      {sheetOpen && (
        <Modal title="내 메뉴" onClose={close}>
          <div className={site.sheet}>
            <AccountMenuContent viewer={viewer} onNavigate={close} />
          </div>
        </Modal>
      )}
    </>
  )
}
