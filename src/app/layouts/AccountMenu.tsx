import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { NavLink, useLocation } from 'react-router'
import { BROWSE, navFor, shadowedByChild, type NavGroup } from '@/app/nav'
import { meQuery } from '@/shared/auth/me'
import { MEMBER, viewerLabel, type Viewer } from '@/shared/auth/role'
import { useLogout } from '@/shared/auth/session'
import { Avatar } from '@/shared/ui/Avatar'
import styles from './AppShell.module.css'
import { Icon, NavIcon } from './icons'
import site from './SiteNav.module.css'
import { ThemeRadios } from './ThemeSwitch'

const LOGOUT_ICON =
  'M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 8l-4 4 4 4M6 12h10'

/** 계정 메뉴 맨 아래에 늘 두는 항목. 메뉴 그룹에 같은 경로가 있으면 그룹에서 뺀다. */
function accountItems(viewer: Viewer) {
  return [
    ...(MEMBER.includes(viewer) ? [{ path: '/wallet', label: '지갑' }] : []),
    { path: '/settings', label: '계정 설정' },
  ]
}

/**
 * 계정 메뉴에 둘 메뉴 그룹: 둘러보기(상단 메뉴·하단 탭바)를 뺀 나머지(내 활동·판매·인증·지원).
 * 관리자는 모든 그룹을 왼쪽 레일로 보므로 그룹을 두지 않는다.
 */
function accountGroups(viewer: Viewer): NavGroup[] {
  if (viewer === 'ADMIN') return []
  const fixed = accountItems(viewer).map((it) => it.path)
  return navFor(viewer)
    .filter((g) => g.title !== BROWSE)
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => !fixed.includes(it.path)),
    }))
    .filter((g) => g.items.length > 0)
}

/**
 * 계정 메뉴 내용: 닉네임·등급 → 메뉴 그룹 → 지갑·계정 설정 → 화면 테마 → 로그아웃.
 * 넓은 화면의 아바타 드롭다운과 좁은 화면 하단 탭바 '마이' 시트가 같이 쓴다. onNavigate는 링크를 누르면 부른다(닫기).
 */
export function AccountMenuContent({
  viewer,
  onNavigate,
}: {
  viewer: Viewer
  onNavigate: () => void
}) {
  const { data: me } = useQuery(meQuery)
  const logout = useLogout()
  const { pathname } = useLocation()
  const id = useId()
  if (!me) return null

  const groups = accountGroups(viewer)
  const fixed = accountItems(viewer)
  const paths = [
    ...groups.flatMap((g) => g.items.map((it) => it.path)),
    ...fixed.map((it) => it.path),
  ]
  const link = (path: string, label: string) => (
    <NavLink
      key={path}
      to={path}
      // 하위 메뉴(쿠폰함 등) 안에서는 상위 메뉴(내 강의)를 끈다.
      end={shadowedByChild(path, pathname, paths)}
      onClick={onNavigate}
      className={({ isActive }) =>
        isActive ? `${styles.menuItem} ${site.current}` : styles.menuItem
      }
    >
      <NavIcon path={path} />
      <span className={site.itemLabel}>{label}</span>
    </NavLink>
  )

  return (
    <>
      <div className={styles.meCard}>
        <span aria-hidden="true" className={styles.meAvatar}>
          <Avatar name={me.nickname} imageUrl={me.profileImageUrl} size={40} />
        </span>
        <span className={styles.meText}>
          {me.nickname}
          <small className={styles.rolePill}>{viewerLabel(viewer)}</small>
        </span>
      </div>
      <nav className={site.accountNav} aria-label="계정 메뉴">
        {groups.map((group, i) => (
          <div
            key={group.title}
            className={site.accountGroup}
            role="group"
            aria-labelledby={`${id}-${i}`}
          >
            <span id={`${id}-${i}`} className={styles.eyebrow}>
              {group.title}
            </span>
            {group.items.map((item) => link(item.path, item.label))}
          </div>
        ))}
        <div
          className={
            groups.length
              ? `${site.accountGroup} ${site.accountFixed}`
              : site.accountGroup
          }
        >
          {fixed.map((item) => link(item.path, item.label))}
        </div>
      </nav>
      <ThemeRadios />
      <hr className={styles.menuRule} />
      <button type="button" className={styles.menuItem} onClick={logout}>
        <Icon d={LOGOUT_ICON} size={18} />
        로그아웃
      </button>
    </>
  )
}

/**
 * 아바타 버튼으로 여닫는 계정 메뉴(링크 묶음 + aria-expanded 버튼).
 * 경로가 바뀌거나, Esc(아바타 버튼으로 포커스를 돌려준다), 바깥 클릭, 포커스가 메뉴 밖으로 나가면 닫는다.
 */
export function AccountMenu({ viewer }: { viewer: Viewer }) {
  const { data: me } = useQuery(meQuery)
  const { pathname } = useLocation()
  // 메뉴를 연 화면의 경로. 다른 화면으로 이동하면 경로가 달라져 저절로 닫힌다.
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const open = openedAt === pathname
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpenedAt(null)
      button.current?.focus()
    }
    const onPointer = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpenedAt(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  if (!me) return null
  return (
    <div
      className={styles.profile}
      ref={box}
      onBlur={(e) => {
        // Tab으로 메뉴 밖에 나가면 닫는다. 창 밖으로 나간 것(relatedTarget 없음)은 두고, 바깥 클릭은 pointerdown이 닫는다.
        const next = e.relatedTarget
        if (open && next instanceof Node && !box.current?.contains(next))
          setOpenedAt(null)
      }}
    >
      <button
        ref={button}
        type="button"
        className={styles.avatarBtn}
        aria-label={`${me.nickname} 메뉴`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpenedAt(open ? null : pathname)}
      >
        <Avatar name={me.nickname} imageUrl={me.profileImageUrl} size={36} />
      </button>
      {open && (
        <div id={panelId} className={styles.profileMenu}>
          <AccountMenuContent
            viewer={viewer}
            onNavigate={() => setOpenedAt(null)}
          />
        </div>
      )}
    </div>
  )
}
