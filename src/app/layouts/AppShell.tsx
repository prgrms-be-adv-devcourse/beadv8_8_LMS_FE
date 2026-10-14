import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, useNavigation } from 'react-router'
import { navFor } from '@/app/nav'
import { RoleGate } from '@/app/guards/RoleGate'
import { walletQuery } from '@/entities/wallet/api'
import { LoginModal } from '@/shared/auth/LoginModal'
import { meQuery } from '@/shared/auth/me'
import { MEMBER, VIEWER_LABEL, type Viewer } from '@/shared/auth/role'
import { useLogout, useViewer } from '@/shared/auth/session'
import { HpAmount } from '@/shared/ui/HpAmount'
import { openLoginModal } from '@/shared/ui/loginModal'
import { Toast } from '@/shared/ui/Toast'
import { DevRoleStrip } from './DevRoleStrip'
import styles from './AppShell.module.css'

/** 앱 셸: (dev) 역할 전환 스트립 / 상단 바 / 왼쪽 내비 레일 / 작업 영역 */
export function AppShell() {
  const viewer = useViewer() ?? 'GUEST'
  const navigation = useNavigation()

  return (
    <div className={styles.root}>
      {import.meta.env.DEV && <DevRoleStrip />}
      <TopBar viewer={viewer} />
      <div className={styles.shell}>
        <NavRail viewer={viewer} />
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

function TopBar({ viewer }: { viewer: Viewer }) {
  return (
    <header className={styles.top}>
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

function NavRail({ viewer }: { viewer: Viewer }) {
  return (
    <nav className={styles.side} aria-label="주 메뉴">
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
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}
