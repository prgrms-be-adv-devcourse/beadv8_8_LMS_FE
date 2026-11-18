import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Link,
  NavLink,
  useLocation,
  useMatches,
  useNavigation,
} from 'react-router'
import { browseItems, hidesTabBar, navFor, shadowedByChild } from '@/app/nav'
import { RoleGate } from '@/app/guards/RoleGate'
import type { RouteHandle } from '@/app/routeHandle'
import { unreadCountQuery } from '@/entities/notification/api'
import { walletQuery } from '@/entities/wallet/api'
import { useCartCount } from '@/features/cart/useCartCount'
import { ChatConnection } from '@/features/chat/ChatConnection'
import { ChatbotRoot } from '@/features/chatbot/ChatbotRoot'
import { useChatUnreadTotal } from '@/features/chat/useChatUnread'
import { NotificationConnection } from '@/features/notification/NotificationConnection'
import { LoginModal } from '@/features/auth/LoginModal'
import { meQuery } from '@/shared/auth/me'
import { MEMBER, type Viewer } from '@/shared/auth/role'
import { useLogoutSync, useViewer } from '@/shared/auth/session'
import { HpAmount } from '@/shared/ui/HpAmount'
import { openLoginModal } from '@/shared/ui/loginModal'
import { Toast } from '@/shared/ui/Toast'
import { AccountMenu } from './AccountMenu'
import styles from './AppShell.module.css'
import { Icon, NavIcon } from './icons'
import { BottomTabBar, SectionTabs } from './SiteNav'
import { ThemeCycleButton } from './ThemeSwitch'
import { useNarrow } from './useNarrow'

const NAV_ID = 'main-nav'
const MAIN_ID = 'main'

/** 채팅을 쓸 수 있는 역할 (BE ChatRoles: 인플루언서 이상 또는 관리자) */
const CHAT_VIEWERS: Viewer[] = ['INFLUENCER', 'VERIFIED_INFLUENCER', 'ADMIN']

/** 배지 숫자. 99개를 넘으면 줄여 보인다. */
function badgeText(count: number) {
  return count > 99 ? '99+' : String(count)
}

/** 장바구니 링크의 읽는 이름. 개수를 모르거나 0이면 개수를 붙이지 않는다. */
function cartLabel(count: number | undefined) {
  return count ? `장바구니 ${count}개` : '장바구니'
}

/** 채팅 링크의 읽는 이름. 안 읽은 메시지가 없으면 개수를 붙이지 않는다. */
function chatLabel(unread: number) {
  return unread ? `채팅, 안 읽은 메시지 ${unread}개` : '채팅'
}

/** 알림 링크의 읽는 이름. 안 읽은 알림이 없거나 수를 모르면 개수를 붙이지 않는다. */
function alertsLabel(unread: number | undefined) {
  return unread ? `알림, 안 읽은 알림 ${unread}개` : '알림'
}

/** 가장 안쪽 라우트부터 handle에 그 값이 있는 것을 찾는다. */
function useInnermostHandle<K extends keyof RouteHandle>(name: K) {
  const matches = useMatches()
  for (let i = matches.length - 1; i >= 0; i--) {
    const value = (matches[i].handle as RouteHandle | undefined)?.[name]
    if (value) return value
  }
  return undefined
}

const APP_NAME = '합방'

/** 브라우저 탭 제목: 가장 안쪽 라우트의 handle.title로 "<제목> · 합방", 제목이 없으면 "합방" */
function useDocumentTitle() {
  const title = useInnermostHandle('title')
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME
  }, [title])
}

/** 페이지를 조금이라도 내렸는지. 상단 바 아래 그림자를 이때만 보여 본문과 떨어져 보이게 한다. */
function useScrolled() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return scrolled
}

/** 키보드 사용자가 헤더·메뉴를 건너뛰고 본문으로 간다. 주소에 #main을 남기지 않게 직접 포커스를 옮긴다. */
function SkipLink() {
  return (
    <a
      href={`#${MAIN_ID}`}
      className={styles.skip}
      onClick={(e) => {
        e.preventDefault()
        document.getElementById(MAIN_ID)?.focus()
      }}
    >
      본문으로 건너뛰기
    </a>
  )
}

/**
 * 앱 셸. 역할에 따라 두 가지다.
 * - 비회원·회원: 상단 헤더 하나(로고 · 주요 메뉴 '둘러보기' · HP·장바구니·채팅·알림·계정 메뉴) + 본문. 둘러보기 밖의 메뉴는
 *   아바타의 계정 메뉴에 있고, 내 강의·스튜디오 목록 화면은 본문 맨 위 구역 탭으로 오간다. 좁은 화면(≤860px)은 주요 메뉴를
 *   하단 탭바로 옮기고 '마이'가 계정 메뉴를 시트로 연다.
 * - 관리자: 상단 바 / 왼쪽 내비 레일 / 작업 영역. 좁은 화면(≤860px)과 홈에서는 레일이 상단 바의 메뉴 버튼으로 여는 드로어가 된다.
 * 홈처럼 layout이 'top'인 화면은 본문 바깥 여백이 없다(관리자는 가로 메뉴가 있는 홈 헤더를 쓴다).
 */
export function AppShell() {
  const viewer = useViewer() ?? 'GUEST'
  useLogoutSync()
  const navigation = useNavigation()
  const { pathname } = useLocation()
  const { data: me } = useQuery(meQuery)
  const topLayout = useInnermostHandle('layout') === 'top'
  const narrow = useNarrow()
  useDocumentTitle()
  const admin = viewer === 'ADMIN'
  const tabBar = !admin && narrow && !hidesTabBar(pathname)

  const classes = [
    styles.root,
    topLayout && styles.topLayout,
    !admin && styles.siteLayout,
  ]
  return (
    <div
      className={classes.filter(Boolean).join(' ')}
      data-tab-bar={tabBar || undefined}
    >
      {me && CHAT_VIEWERS.includes(me.role) && (
        <ChatConnection userId={me.id} />
      )}
      {/* 알림센터 실시간 연결: 알림을 받는 회원만(관리자는 알림을 받지 않는다) */}
      {me && MEMBER.includes(me.role) && (
        <NotificationConnection userId={me.id} />
      )}
      <SkipLink />
      {admin ? (
        <AdminChrome topLayout={topLayout} />
      ) : (
        <>
          <SiteHeader viewer={viewer} />
          <main
            id={MAIN_ID}
            tabIndex={-1}
            className={styles.main}
            aria-busy={navigation.state === 'loading'}
          >
            <SectionTabs viewer={viewer} />
            <RoleGate />
          </main>
          {tabBar && <BottomTabBar viewer={viewer} />}
        </>
      )}
      <ChatbotRoot />
      <LoginModal />
      <Toast />
    </div>
  )
}

/** 관리자 셸: 상단 바(홈은 가로 메뉴가 있는 홈 헤더) + 왼쪽 내비 레일(좁은 화면·홈은 드로어) + 작업 영역 */
function AdminChrome({ topLayout }: { topLayout: boolean }) {
  const navigation = useNavigation()
  const { pathname } = useLocation()
  // 드로어를 연 화면의 경로. 다른 화면으로 이동하면 경로가 달라져 저절로 닫힌다.
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const navOpen = openedAt === pathname
  const closeNav = () => setOpenedAt(null)
  const toggleNav = () => setOpenedAt(navOpen ? null : pathname)

  useEffect(() => {
    if (!navOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenedAt(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navOpen])

  return (
    <>
      {topLayout ? (
        <HomeHeader navOpen={navOpen} onToggleNav={toggleNav} />
      ) : (
        <TopBar navOpen={navOpen} onToggleNav={toggleNav} />
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
          viewer="ADMIN"
          open={navOpen}
        />
        <main
          id={MAIN_ID}
          tabIndex={-1}
          className={styles.main}
          aria-busy={navigation.state === 'loading'}
        >
          <RoleGate />
        </main>
      </div>
    </>
  )
}

type TopBarProps = {
  navOpen: boolean
  onToggleNav: () => void
}

function MenuButton({ navOpen, onToggleNav }: TopBarProps) {
  return (
    <button
      type="button"
      className={styles.menuBtn}
      aria-label={navOpen ? '메뉴 닫기' : '메뉴 열기'}
      aria-expanded={navOpen}
      aria-controls={NAV_ID}
      onClick={onToggleNav}
    >
      {/* 세 줄이 X로 접힌다(CSS) */}
      <span className={styles.burger} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </button>
  )
}

/** 로고. ON AIR 램프는 장식이라 읽는 이름은 "합방 홈"뿐이다. */
function Logo() {
  return (
    <Link to="/" className={styles.logo} aria-label="합방 홈">
      <span className={styles.wordmark}>합방</span>
      <span className={styles.onair} aria-hidden="true">
        <span className={styles.lamp} />
        ON AIR
      </span>
    </Link>
  )
}

/**
 * 비회원·회원 상단 헤더(홈 포함 모든 화면): 로고 · 주요 메뉴 · 로그인 또는 HP·장바구니·채팅·알림·계정 메뉴.
 * 주요 메뉴는 좁은 화면(≤860px)에서 숨기고 하단 탭바가 대신한다. 통합 검색은 BE API가 없어 두지 않는다.
 */
function SiteHeader({ viewer }: { viewer: Viewer }) {
  const scrolled = useScrolled()
  return (
    <header
      className={`${styles.bar} ${styles.siteTop}`}
      data-scrolled={scrolled}
    >
      <Logo />
      <nav className={styles.topnav} aria-label="둘러보기">
        {browseItems(viewer).map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              isActive ? `${styles.topnavItem} ${styles.on}` : styles.topnavItem
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className={styles.right}>
        <HeaderActions viewer={viewer} loginClassName="btn primary sm" />
      </div>
    </header>
  )
}

/** 관리자 상단 바(홈 밖): 메뉴 버튼(좁은 화면) · 로고 · 채팅·계정 메뉴 */
function TopBar({ navOpen, onToggleNav }: TopBarProps) {
  const scrolled = useScrolled()
  return (
    <header className={`${styles.bar} ${styles.top}`} data-scrolled={scrolled}>
      <MenuButton navOpen={navOpen} onToggleNav={onToggleNav} />
      <Logo />
      <div className={styles.right}>
        <HeaderActions viewer="ADMIN" loginClassName="btn primary sm" />
      </div>
    </header>
  )
}

/** 관리자 홈 헤더의 가로 메뉴 */
const ADMIN_HOME_NAV = [
  { path: '/', label: '홈' },
  { path: '/influencers', label: '인플루언서' },
  { path: '/recruits', label: '출연 모집' },
  { path: '/lectures', label: '강의' },
  { path: '/admin', label: '운영' },
]

/** 관리자 홈 헤더: 햄버거(전체 메뉴) · 로고 · 가로 메뉴 · 채팅·계정 메뉴 */
function HomeHeader({ navOpen, onToggleNav }: TopBarProps) {
  const scrolled = useScrolled()
  return (
    <header
      className={`${styles.bar} ${styles.homeTop}`}
      data-scrolled={scrolled}
    >
      <MenuButton navOpen={navOpen} onToggleNav={onToggleNav} />
      <Logo />
      <nav className={styles.topnav} aria-label="둘러보기">
        {ADMIN_HOME_NAV.map((item) => (
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
      <div className={styles.right}>
        <HeaderActions viewer="ADMIN" loginClassName="btn primary" />
      </div>
    </header>
  )
}

/**
 * 헤더 오른쪽: 로그인 또는 HP · 장바구니 · 채팅 · 알림 · 계정 메뉴. 모든 폭에서 헤더에 둔다.
 * HP 칸이 지갑 진입점이다(관리자는 지갑이 없어 숨긴다). 채팅은 채팅을 쓰는 역할에만, 알림은 회원에게만 보인다(관리자는 알림을 받지 않는다).
 */
function HeaderActions({
  viewer,
  loginClassName,
}: {
  viewer: Viewer
  loginClassName: string
}) {
  if (viewer === 'GUEST') {
    // 비회원은 계정 메뉴가 없어 화면 테마를 헤더에서 바꾼다.
    return (
      <>
        <ThemeCycleButton />
        <button
          type="button"
          className={loginClassName}
          onClick={() => openLoginModal()}
        >
          로그인
        </button>
      </>
    )
  }
  const member = MEMBER.includes(viewer)
  return (
    <>
      {member && <HpPill />}
      {member && <CartLink />}
      {CHAT_VIEWERS.includes(viewer) && <ChatLink />}
      {member && <AlertsLink />}
      <AccountMenu viewer={viewer} />
    </>
  )
}

function CartLink() {
  const count = useCartCount(true)
  return (
    <NavLink
      to="/cart"
      className={styles.iconBtn}
      aria-label={cartLabel(count)}
    >
      <CartIcon />
      {!!count && (
        <span className={styles.badge} aria-hidden="true">
          {badgeText(count)}
        </span>
      )}
    </NavLink>
  )
}

/** docs/mockup-ui.html ICONS.cart */
function CartIcon() {
  return (
    <Icon
      d="M3 4h2.2l2.3 11h10.3L20 8H6.3M9.5 20h.01M16.5 20h.01"
      strokeWidth={1.8}
    />
  )
}

/** 좁은 화면에서도 헤더에 남겨, 안 읽은 메시지 배지가 메뉴를 열지 않아도 보이게 한다. */
function ChatLink() {
  const unread = useChatUnreadTotal(true)
  return (
    <NavLink
      to="/chat"
      className={styles.iconBtn}
      aria-label={chatLabel(unread)}
    >
      <ChatIcon />
      {unread > 0 && (
        <span className={styles.badge} aria-hidden="true">
          {badgeText(unread)}
        </span>
      )}
    </NavLink>
  )
}

/** 말풍선. 목업 ICONS에 없어 같은 규격(24 viewBox, stroke 2)으로 그렸다. */
function ChatIcon() {
  return (
    <Icon
      d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
      strokeWidth={1.8}
    />
  )
}

/** 알림센터. 좁은 화면에서도 헤더에 둔다. 안 읽은 수를 불러오지 못하면 배지만 숨긴다. */
function AlertsLink() {
  const { data: unread } = useQuery({
    ...unreadCountQuery,
    select: (d) => d.count,
  })
  return (
    <NavLink
      to="/alerts"
      className={styles.iconBtn}
      aria-label={alertsLabel(unread)}
    >
      <BellIcon />
      {!!unread && (
        <span className={styles.badge} aria-hidden="true">
          {badgeText(unread)}
        </span>
      )}
    </NavLink>
  )
}

/** docs/mockup-ui.html ICONS.bell */
function BellIcon() {
  return (
    <Icon
      d="M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9M10 21h4"
      strokeWidth={1.8}
    />
  )
}

/** 사용 가능한 HP(충전 + 수익). 자세한 내역은 지갑에서 본다. */
function HpPill() {
  const { data } = useQuery(walletQuery)
  return (
    <Link to="/wallet" className={styles.hpPill} aria-label="지갑">
      <span className={styles.coin} aria-hidden="true">
        HP
      </span>
      {data ? (
        <HpAmount value={data.availableTotalHp} />
      ) : (
        <span className="num muted">—</span>
      )}
    </Link>
  )
}

/** 관리자의 왼쪽 내비 레일(좁은 화면·홈은 드로어) */
function NavRail({ viewer, open }: { viewer: Viewer; open: boolean }) {
  const { pathname } = useLocation()
  const groups = navFor(viewer)
  const paths = groups.flatMap((g) => g.items.map((it) => it.path))
  return (
    <nav
      id={NAV_ID}
      className={open ? `${styles.side} ${styles.sideOpen}` : styles.side}
      aria-label="주 메뉴"
    >
      {groups.map((group, i) => (
        <div
          key={group.title}
          className={styles.navGroup}
          role="group"
          aria-labelledby={`${NAV_ID}-${i}`}
        >
          <h4 id={`${NAV_ID}-${i}`} className={styles.eyebrow}>
            {group.title}
          </h4>
          {group.items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              // 운영 대시보드는 하위 경로에서 켜지지 않게 한다. 하위 메뉴(쿠폰함 등) 안에서는 상위 메뉴를 끈다.
              end={
                item.path === '/admin' ||
                shadowedByChild(item.path, pathname, paths)
              }
              className={({ isActive }) =>
                isActive ? `${styles.navItem} ${styles.on}` : styles.navItem
              }
            >
              <NavIcon path={item.path} />
              <span className={styles.navLabel}>{item.label}</span>
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}
