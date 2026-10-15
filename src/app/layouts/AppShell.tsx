import { useEffect, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Link,
  NavLink,
  useLocation,
  useMatches,
  useNavigate,
  useNavigation,
} from 'react-router'
import { navFor } from '@/app/nav'
import { RoleGate } from '@/app/guards/RoleGate'
import type { RouteHandle } from '@/app/routeHandle'
import { walletQuery } from '@/entities/wallet/api'
import { ChatConnection } from '@/features/chat/ChatConnection'
import { useChatUnreadTotal } from '@/features/chat/useChatUnread'
import { LoginModal } from '@/shared/auth/LoginModal'
import { meQuery } from '@/shared/auth/me'
import { MEMBER, VIEWER_LABEL, type Viewer } from '@/shared/auth/role'
import { useLogout, useViewer } from '@/shared/auth/session'
import { Avatar } from '@/shared/ui/Avatar'
import { HpAmount } from '@/shared/ui/HpAmount'
import { openLoginModal } from '@/shared/ui/loginModal'
import { Toast } from '@/shared/ui/Toast'
import { DevRoleStrip } from './DevRoleStrip'
import styles from './AppShell.module.css'

const NAV_ID = 'main-nav'

/** 채팅을 쓸 수 있는 역할 (BE ChatRoles: 인플루언서 이상 또는 관리자) */
const CHAT_VIEWERS: Viewer[] = ['INFLUENCER', 'VERIFIED_INFLUENCER', 'ADMIN']

/** 가장 안쪽 라우트의 화면 틀 (RouteHandle.layout) */
function useLayout() {
  const matches = useMatches()
  for (let i = matches.length - 1; i >= 0; i--) {
    const layout = (matches[i].handle as RouteHandle | undefined)?.layout
    if (layout) return layout
  }
  return undefined
}

/**
 * 앱 셸: (dev) 역할 전환 스트립 / 상단 바 / 왼쪽 내비 레일 / 작업 영역
 * 좁은 화면(≤860px)에서는 내비 레일이 상단 바의 메뉴 버튼으로 여는 드로어가 된다.
 * 홈처럼 layout이 'top'인 화면은 가로 메뉴가 있는 헤더를 쓰고, 내비 레일은 늘 드로어다.
 */
export function AppShell() {
  const viewer = useViewer() ?? 'GUEST'
  const navigation = useNavigation()
  const { pathname } = useLocation()
  // 드로어를 연 화면의 경로. 다른 화면으로 이동하면 경로가 달라져 저절로 닫힌다.
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const navOpen = openedAt === pathname
  const closeNav = () => setOpenedAt(null)

  useEffect(() => {
    if (!navOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenedAt(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navOpen])

  const { data: me } = useQuery(meQuery)
  const topLayout = useLayout() === 'top'
  const toggleNav = () => setOpenedAt(navOpen ? null : pathname)

  return (
    <div
      className={topLayout ? `${styles.root} ${styles.topLayout}` : styles.root}
    >
      {me && CHAT_VIEWERS.includes(me.role) && (
        <ChatConnection userId={me.id} />
      )}
      {import.meta.env.DEV && <DevRoleStrip />}
      {topLayout ? (
        <HomeHeader viewer={viewer} navOpen={navOpen} onToggleNav={toggleNav} />
      ) : (
        <TopBar viewer={viewer} navOpen={navOpen} onToggleNav={toggleNav} />
      )}
      <div className={styles.shell}>
        {navOpen && (
          <div
            className={styles.navScrim}
            aria-hidden="true"
            onClick={closeNav}
          />
        )}
        {/* 홈(드로어)과 다른 화면(레일)을 오갈 때는 새로 그린다. 같은 요소를 쓰면 드로어의 여닫기
            애니메이션이 레이아웃 전환에도 돌아, 메뉴가 잠깐 미끄러져 들어오거나 나가는 것이 보인다. */}
        <NavRail
          key={topLayout ? 'drawer' : 'rail'}
          viewer={viewer}
          open={navOpen}
        />
        <main
          className={styles.main}
          aria-busy={navigation.state === 'loading'}
        >
          <RoleGate />
        </main>
      </div>
      <LoginModal />
      <Toast />
    </div>
  )
}

type TopBarProps = {
  viewer: Viewer
  navOpen: boolean
  onToggleNav: () => void
}

function MenuButton({ navOpen, onToggleNav }: Omit<TopBarProps, 'viewer'>) {
  return (
    <button
      type="button"
      className={styles.menuBtn}
      aria-label={navOpen ? '메뉴 닫기' : '메뉴 열기'}
      aria-expanded={navOpen}
      aria-controls={NAV_ID}
      onClick={onToggleNav}
    >
      <span aria-hidden="true">{navOpen ? '✕' : '☰'}</span>
    </button>
  )
}

function TopBar({ viewer, navOpen, onToggleNav }: TopBarProps) {
  return (
    <header className={styles.top}>
      <MenuButton navOpen={navOpen} onToggleNav={onToggleNav} />
      <Link to="/" className={styles.logo} aria-label="합방 홈">
        합방<span className={styles.onair}>ON AIR</span>
      </Link>
      <div className={styles.right}>
        {MEMBER.includes(viewer) && <HpPill />}
        {viewer === 'GUEST' ? (
          <button
            type="button"
            className="btn primary sm"
            onClick={() => openLoginModal()}
          >
            로그인
          </button>
        ) : (
          <MeMenu viewer={viewer} />
        )}
      </div>
    </header>
  )
}

/** 홈 헤더의 가로 메뉴 (디자인: 홈·인플루언서·출연 모집·강의 + 역할별) */
function topNavFor(viewer: Viewer) {
  return [
    { path: '/', label: '홈' },
    { path: '/influencers', label: '인플루언서' },
    { path: '/recruits', label: '출연 모집' },
    { path: '/lectures', label: '강의' },
    ...(viewer === 'VERIFIED_INFLUENCER'
      ? [{ path: '/studio', label: '강의 판매' }]
      : []),
    ...(viewer === 'ADMIN' ? [{ path: '/admin', label: '운영' }] : []),
  ]
}

/** 홈 헤더: 햄버거(전체 메뉴) · 로고 · 가로 메뉴 · 검색 · 로그인 또는 HP·알림·프로필 */
function HomeHeader({ viewer, navOpen, onToggleNav }: TopBarProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const search = (e: FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    navigate(q ? `/search?${new URLSearchParams({ q })}` : '/search')
  }
  return (
    <header className={styles.homeTop}>
      <MenuButton navOpen={navOpen} onToggleNav={onToggleNav} />
      <Link to="/" className={styles.logo} aria-label="합방 홈">
        합방<span className={styles.onair}>ON AIR</span>
      </Link>
      <nav className={styles.topnav} aria-label="둘러보기">
        {topNavFor(viewer).map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              isActive ? `${styles.topnavItem} ${styles.on}` : styles.topnavItem
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <form className={styles.search} role="search" onSubmit={search}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          aria-label="검색"
          placeholder="인플루언서, 모집 글, 강의 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>
      <Link to="/search" className={styles.searchIcon} aria-label="검색">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </Link>
      <div className={styles.right}>
        {viewer === 'GUEST' ? (
          <button
            type="button"
            className="btn primary"
            onClick={() => openLoginModal()}
          >
            로그인
          </button>
        ) : (
          <>
            {MEMBER.includes(viewer) && <HpPill />}
            {MEMBER.includes(viewer) && (
              <Link to="/alerts" className={styles.iconBtn} aria-label="알림">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
                  <path d="M10 20a2 2 0 0 0 4 0" />
                </svg>
              </Link>
            )}
            <ProfileMenu viewer={viewer} />
          </>
        )}
      </div>
    </header>
  )
}

/** 프로필 사진을 누르면 닉네임·등급, 계정 설정, 로그아웃 */
function ProfileMenu({ viewer }: { viewer: Viewer }) {
  const { data: me } = useQuery(meQuery)
  const logout = useLogout()
  const [open, setOpen] = useState(false)
  if (!me) return null
  return (
    <div className={styles.profile}>
      <button
        type="button"
        className={styles.avatarBtn}
        aria-label={`${me.nickname} 메뉴`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar name={me.nickname} imageUrl={me.profileImageUrl} size={36} />
      </button>
      {open && (
        <div className={styles.profileMenu}>
          <span className={styles.meText}>
            {me.nickname}
            <small>{VIEWER_LABEL[viewer]}</small>
          </span>
          {viewer !== 'ADMIN' && (
            <Link className="btn ghost sm" to="/settings">
              계정 설정
            </Link>
          )}
          <button type="button" className="btn ghost sm" onClick={logout}>
            로그아웃
          </button>
        </div>
      )}
    </div>
  )
}

/** 사용 가능한 HP(충전 + 수익). 자세한 내역은 지갑에서 본다. */
function HpPill() {
  const { data } = useQuery(walletQuery)
  return (
    <Link to="/wallet" className={styles.hpPill} aria-label="지갑">
      <span className={styles.coin}>HP</span>
      {data ? (
        <HpAmount value={data.availableTotalHp} />
      ) : (
        <span className="num muted">—</span>
      )}
    </Link>
  )
}

function MeMenu({ viewer }: { viewer: Viewer }) {
  const { data: me } = useQuery(meQuery)
  const logout = useLogout()
  return (
    <div className={styles.me}>
      <span className={styles.meText}>
        {me?.nickname}
        <small>{VIEWER_LABEL[viewer]}</small>
      </span>
      <button type="button" className="btn ghost sm" onClick={logout}>
        로그아웃
      </button>
    </div>
  )
}

function NavRail({ viewer, open }: { viewer: Viewer; open: boolean }) {
  const unreadChats = useChatUnreadTotal(CHAT_VIEWERS.includes(viewer))
  return (
    <nav
      id={NAV_ID}
      className={open ? `${styles.side} ${styles.sideOpen}` : styles.side}
      aria-label="주 메뉴"
    >
      {navFor(viewer).map((group) => (
        <div key={group.title} className={styles.navGroup}>
          <h4>{group.title}</h4>
          {group.items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              // 홈·운영 대시보드는 하위 경로에서 켜지지 않게 한다.
              end={item.path === '/' || item.path === '/admin'}
              className={({ isActive }) =>
                isActive ? `${styles.navItem} ${styles.on}` : styles.navItem
              }
            >
              {item.label}
              {item.path === '/chat' && unreadChats > 0 && (
                <span
                  className={styles.cnt}
                  aria-label={`안 읽은 메시지 ${unreadChats}개`}
                >
                  {unreadChats > 99 ? '99+' : unreadChats}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}
