import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { walletQuery } from '@/entities/wallet/api'
import { ExchangeRequestForm } from '@/features/wallet-exchange/ExchangeRequestForm'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'

/** 환전 신청: 수익 HP를 신청마다 입력하는 테스트 계좌로 환전 신청한다(인플루언서·인증된 인플루언서). */
export function ExchangeRequestPage() {
  const { data: wallet, error, refetch } = useQuery(walletQuery)
  return (
    <div className="page narrow">
      <Link className="back" to="/wallet">
        ← 지갑
      </Link>
      <PageHead
        title="환전 신청"
        lede="출연료·강의 판매로 받은 수익 HP를 수수료 10%를 빼고 계좌로 보내요."
      />
      {error && !wallet ? (
        <LoadError error={error} retry={() => void refetch()} />
      ) : !wallet ? (
        <Loading />
      ) : (
        <ExchangeRequestForm wallet={wallet} />
      )}
    </div>
  )
}
