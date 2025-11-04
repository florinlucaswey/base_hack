import React, { useMemo, useState } from 'react'

const formatEth = (value, precision = 4) => {
  if (!Number.isFinite(value)) return '0.0000'
  return value.toFixed(precision)
}

const formatPercent = (value) => {
  if (!Number.isFinite(value)) return '0.0%'
  return `${(value * 100).toFixed(1)}%`
}

const statusBadgeClass = (supportsDex, utilization) => {
  if (!supportsDex) return 'bg-amber-500/20 text-amber-300 border border-amber-400/20'
  if (utilization >= 0.8) return 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
  return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
}

export const Hip3LiquidityPanel = ({
  metrics,
  lastEvent,
  onStake,
  onWithdraw,
  estimateExecution,
}) => {
  const [stakeAmount, setStakeAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const previewImpact = useMemo(() => {
    if (!stakeAmount) return null
    const parsed = parseFloat(stakeAmount)
    if (!Number.isFinite(parsed) || parsed <= 0) return null
    return estimateExecution(parsed, 'buy')
  }, [stakeAmount, estimateExecution])

  const utilizationPreview = previewImpact?.permitted ? previewImpact.utilization : null

  const handleStake = () => {
    try {
      const parsed = parseFloat(stakeAmount)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError('Enter a valid ETH amount to stake.')
        return
      }
      onStake(parsed)
      setStakeAmount('')
      setError('')
      setInfo(`Staked ${parsed.toFixed(4)} ETH into the HIP-3 pool.`)
    } catch (err) {
      setError(err.message ?? 'Failed to stake liquidity.')
    }
  }

  const handleWithdraw = () => {
    try {
      const parsed = parseFloat(withdrawAmount)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError('Enter a valid ETH amount to withdraw.')
        return
      }
      onWithdraw(parsed)
      setWithdrawAmount('')
      setError('')
      setInfo(`Withdrew ${parsed.toFixed(4)} ETH from the HIP-3 pool.`)
    } catch (err) {
      setError(err.message ?? 'Failed to withdraw liquidity.')
    }
  }

  const dexStatus = metrics.supportsDex ? 'Active' : 'Inactive'

  return (
    <section className="rounded-xl border border-slate-900 bg-slate-950/60 shadow-lg shadow-blue-500/5">
      <header className="border-b border-slate-900/70 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">HIP-3 Liquidity</h2>
            <p className="text-xs text-slate-400">
              Single-sided ETH staking powers synthetic market depth.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide ${statusBadgeClass(
              metrics.supportsDex,
              utilizationPreview ?? 0
            )}`}
          >
            {dexStatus}
          </span>
        </div>
      </header>

      <div className="space-y-6 px-5 py-5 text-sm">
        <dl className="grid grid-cols-2 gap-4 text-slate-300">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Total ETH</dt>
            <dd className="text-lg font-semibold text-slate-100">{formatEth(metrics.ethLiquidity, 3)} ETH</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Coverage</dt>
            <dd className="text-lg font-semibold text-slate-100">
              {metrics.supportsDex ? `${metrics.coverageRatio.toFixed(2)}x` : 'Below minimum'}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Effective Depth</dt>
            <dd className="text-lg font-semibold text-slate-100">
              {formatEth(metrics.effectiveDepthEth, 3)} ETH
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Base Spread</dt>
            <dd className="text-lg font-semibold text-slate-100">
              {(metrics.baseSpreadBps / 100).toFixed(2)}%
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Stress Spread</dt>
            <dd className="text-lg font-semibold text-slate-100">
              {((metrics.widenedSpreadBps ?? metrics.baseSpreadBps) / 100).toFixed(2)}%
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Max Utilization</dt>
            <dd className="text-lg font-semibold text-slate-100">
              {(((metrics.maxUtilization ?? 1) * 100)).toFixed(0)}%
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Taker Fee</dt>
            <dd className="text-lg font-semibold text-slate-100">
              {(metrics.feeBps / 100).toFixed(2)}%
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Treasury</dt>
            <dd className="text-lg font-semibold text-slate-100">
              {formatEth(metrics.treasuryEth ?? 0, 4)} ETH
            </dd>
          </div>
        </dl>

        <div className="rounded-lg border border-slate-900/80 bg-slate-950/80 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Stake ETH
          </h3>
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <input
                value={stakeAmount}
                onChange={(event) => setStakeAmount(event.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
                placeholder="Amount in ETH"
                inputMode="decimal"
              />
              <button
                type="button"
                onClick={handleStake}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-500"
              >
                Stake
              </button>
            </div>
            {previewImpact?.permitted && (
              <p className="text-xs text-slate-400">
                Projected utilization: {formatPercent(previewImpact.utilization)} • Estimated fee:{' '}
                {formatEth(previewImpact.feeEth, 5)} ETH
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-900/80 bg-slate-950/80 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Withdraw ETH
          </h3>
          <div className="mt-3 flex items-center gap-3">
            <input
              value={withdrawAmount}
              onChange={(event) => setWithdrawAmount(event.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
              placeholder="Amount in ETH"
              inputMode="decimal"
            />
            <button
              type="button"
              onClick={handleWithdraw}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
            >
              Withdraw
            </button>
          </div>
        </div>

        {(error || info || lastEvent) && (
          <div className="space-y-2 text-xs text-slate-400">
            {error && <p className="text-rose-300">{error}</p>}
            {info && !error && <p className="text-emerald-300">{info}</p>}
            {lastEvent && (
              <p className="text-slate-500">
                Last event:{' '}
                <span className="text-slate-300">
                  {lastEvent.type === 'stake' && `Stake +${formatEth(lastEvent.amountEth, 4)} ETH`}
                  {lastEvent.type === 'withdraw' && `Withdraw -${formatEth(lastEvent.amountEth, 4)} ETH`}
                  {lastEvent.type === 'fee' && `Fees +${formatEth(lastEvent.amountEth, 5)} ETH`}
                </span>
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
