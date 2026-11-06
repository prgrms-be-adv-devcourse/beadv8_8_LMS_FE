import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { meQuery } from '@/shared/auth/me'
import { viewerLabel } from '@/shared/auth/role'
import { NicknameForm } from '@/features/account/NicknameForm'
import { PasswordForm } from '@/features/account/PasswordForm'
import { ProfileImageEditor } from '@/features/account/ProfileImageEditor'
import { PageHead } from '@/shared/ui/PageHead'
import { Loading } from '@/shared/ui/QueryState'

// TODO: 알림 설정은 BE API가 생기면 추가한다.
export function SettingsPage() {
  const { data: me } = useQuery(meQuery)

  return (
    <div className="page narrow">
      <PageHead title="계정 설정" />
      {!me ? (
        <Loading />
      ) : (
        <>
          <section className="panel form">
            <h2>계정</h2>
            <dl className="kv">
              {/* 구글·비밀번호 중 어느 방식으로 가입했는지는 BE가 알려 주지 않아 이메일만 보인다. */}
              <dt>이메일</dt>
              <dd>{me.email}</dd>
              <dt>회원 등급</dt>
              <dd>{viewerLabel(me.role)}</dd>
            </dl>
            <ProfileImageEditor me={me} />
            {/* 닉네임이 바뀌면 입력값을 새 값으로 다시 시작한다. */}
            <NicknameForm key={me.nickname} current={me.nickname} />
          </section>
          <PasswordForm />
          {/* 관리자는 탈퇴 화면(/settings/withdraw)에 들어갈 수 없다. */}
          {me.role !== 'ADMIN' && (
            <section
              className="panel"
              aria-labelledby="settings-withdraw-title"
            >
              <h2 id="settings-withdraw-title">회원 탈퇴</h2>
              <p className="fine">
                탈퇴하면 30일 안에 다시 로그인해 복구할 수 있어요. 30일이 지나면
                이메일·닉네임 같은 개인정보를 파기하고, 거래 기록은 남아요.
              </p>
              <Link
                className="btn danger"
                style={{ alignSelf: 'flex-start' }}
                to="/settings/withdraw"
              >
                탈퇴 절차 보기
              </Link>
            </section>
          )}
        </>
      )}
    </div>
  )
}
