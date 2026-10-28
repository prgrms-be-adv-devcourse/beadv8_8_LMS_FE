import { useQuery } from '@tanstack/react-query'
import { meQuery } from '@/shared/auth/me'
import { VIEWER_LABEL } from '@/shared/auth/role'
import { NicknameForm } from '@/features/account/NicknameForm'
import { ProfileImageEditor } from '@/features/account/ProfileImageEditor'
import { PageHead } from '@/shared/ui/PageHead'
import { Loading } from '@/shared/ui/QueryState'

// TODO: 알림 설정·회원 탈퇴는 BE API가 생기면 추가한다.
export function SettingsPage() {
  const { data: me } = useQuery(meQuery)

  return (
    <div className="page narrow">
      <PageHead title="계정 설정" />
      {!me ? (
        <Loading />
      ) : (
        <section className="panel form">
          <h2>계정</h2>
          <dl className="kv">
            <dt>로그인</dt>
            <dd>Google · {me.email}</dd>
            <dt>회원 등급</dt>
            <dd>{VIEWER_LABEL[me.role]}</dd>
          </dl>
          <ProfileImageEditor me={me} />
          {/* 닉네임이 바뀌면 입력값을 새 값으로 다시 시작한다. */}
          <NicknameForm key={me.nickname} current={me.nickname} />
        </section>
      )}
    </div>
  )
}
