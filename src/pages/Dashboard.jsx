import React, { useEffect, useMemo, useState } from 'react'
import StatCard from '../components/StatCard'
import { useWallet } from '../hooks/useWalletContext'
import { formatAddress } from '../utils/formatAddress'
import { generateCompanyValuations, ORACLE_UPDATE_INTERVAL_MS } from '../utils/oracle'
import './Dashboard.css'

const formatPrice = (value) => {
  if (!Number.isFinite(value)) return '$0.00'
  return `$${value.toFixed(2)}`
}

const buildSeries = (seed = 1, points = 16) =>
  Array.from({ length: points }, (_, index) => {
    const base = Math.sin((index + seed) * 0.35) * 6 + 50
    const variance = Math.cos((index + seed * 2) * 0.22) * 4
    return Math.max(15, base + variance)
  })

const getPath = (data, width = 320, height = 120, padding = 8) => {
  if (!data || data.length === 0) return ''
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const innerWidth = width - padding * 2
  const innerHeight = height - padding * 2

  return data
    .map((value, index) => {
      const x = padding + (innerWidth * index) / Math.max(data.length - 1, 1)
      const y = padding + innerHeight - ((value - min) / range) * innerHeight
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

const Dashboard = () => {
  const { address, balance, isConnected } = useWallet()
  const [valuations, setValuations] = useState([])

  useEffect(() => {
    if (!isConnected) return
    let isMounted = true

    const pullValuations = () => {
      const data = generateCompanyValuations()
      if (isMounted) {
        setValuations(data)
      }
    }

    pullValuations()
    const intervalId = setInterval(pullValuations, ORACLE_UPDATE_INTERVAL_MS)

    return () => {
      isMounted = false
      clearInterval(intervalId)
    }
  }, [isConnected])

  const holdings = useMemo(() => {
    if (!valuations.length) {
      return []
    }
    const baseSize = 240
    return valuations.map((asset, index) => {
      const quantity = baseSize - index * 40
      const notional = quantity * (asset.targetPrice ?? 0)
      return {
        ...asset,
        quantity,
        notional,
        allocation: notional,
        sparkline: buildSeries(index + 1),
      }
    })
  }, [valuations])

  const portfolioValue = holdings.reduce((total, holding) => total + holding.notional, 0)
  const dailyChange = holdings.reduce(
    (total, holding) => total + holding.notional * (holding.compositeScore ?? 0) * 0.01,
    0
  )
  const topHolding = holdings.reduce(
    (prev, curr) => (curr.notional > (prev?.notional ?? 0) ? curr : prev),
    null
  )

  if (!isConnected) {
    return (
      <section className="dashboard-gate flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-24 text-center text-slate-400">
        <div className="max-w-lg space-y-4">
          <h1 className="text-2xl font-semibold text-white">Connect your wallet to view the desk</h1>
          <p className="text-sm text-slate-400">
            Gain access to portfolio analytics, performance telemetry, and curated trade ideas once your
            wallet is connected.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="dashboard-page">
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-24 pt-16 sm:px-8 lg:px-12">
        <header className="flex flex-wrap items-center justify-between gap-6 pb-10">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Portfolio dashboard</p>
            <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
              Welcome back, here&apos;s the latest desk pulse
            </h1>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-slate-300 shadow-lg">
            <p className="font-medium text-white">{formatAddress(address)}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.35em] text-slate-500">Wallet connected</p>
            <p className="mt-2 text-sm text-slate-300">
              Balance: {balance?.formatted} {balance?.symbol}
            </p>
          </div>
        </header>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Portfolio value"
            value={formatPrice(portfolioValue)}
            helper="Mark-to-model using blended oracle price targets."
            badge="Total"
            accent="blue"
          />
          <StatCard
            label="24h delta"
            value={`${dailyChange >= 0 ? '+' : ''}${formatPrice(Math.abs(dailyChange))}`}
            helper="Composite change derived from internal & external score shifts."
            accent="emerald"
          />
          <StatCard
            label="Top holding"
            value={topHolding ? topHolding.name : 'Syncing'}
            helper={topHolding ? `${topHolding.quantity.toLocaleString()} units • ${formatPrice(topHolding.notional)}` : 'Awaiting oracle sync'}
            accent="violet"
          />
          <StatCard
            label="Cash available"
            value={`${balance?.formatted ?? '0.00'} ${balance?.symbol ?? ''}`}
            helper="Ready for deployment on the synthetic desk."
            accent="amber"
          />
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-blue-500/10 backdrop-blur">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Holdings breakdown</h2>
                <p className="text-sm text-slate-400">
                  Allocation across synthetic assets with live oracle telemetry.
                </p>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.35em] text-slate-400">
                {holdings.length} assets
              </span>
            </header>

            <div className="mt-6 overflow-hidden rounded-2xl border border-white/5">
              <table className="w-full text-sm text-slate-300">
                <thead className="bg-slate-950/60 text-xs uppercase tracking-[0.35em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Asset</th>
                    <th className="px-4 py-3 text-left font-medium">Quantity</th>
                    <th className="px-4 py-3 text-left font-medium">Target</th>
                    <th className="px-4 py-3 text-left font-medium">Performance</th>
                    <th className="px-4 py-3 text-right font-medium">Notional</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((holding) => (
                    <tr key={holding.id} className="border-t border-white/[0.06] hover:bg-white/[0.03]">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-sm text-white">{holding.name}</span>
                          <span className="text-xs font-mono uppercase tracking-[0.35em] text-slate-500">
                            {holding.ticker}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {holding.quantity.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {formatPrice(holding.targetPrice)}
                      </td>
                      <td className="px-4 py-3">
                        <svg viewBox="0 0 320 120" className="h-12 w-full">
                          <defs>
                            <linearGradient id={`spark-${holding.id}`} x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#34d399" />
                              <stop offset="100%" stopColor="#38bdf8" />
                            </linearGradient>
                          </defs>
                          <rect x="0" y="0" width="320" height="120" fill="none" stroke="rgba(148,163,184,0.15)" />
                          <path
                            d={getPath(holding.sparkline)}
                            fill="none"
                            stroke={`url(#spark-${holding.id})`}
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-white">
                        {formatPrice(holding.notional)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-slate-900/30 backdrop-blur">
            <header className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Performance radar</h2>
              <span className="text-xs uppercase tracking-[0.35em] text-slate-500">Risk bands</span>
            </header>

            <div className="mt-8 grid gap-5 text-sm text-slate-300">
              <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Volatility</p>
                  <p className="mt-2 text-lg font-semibold text-white">Moderate</p>
                </div>
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-200">
                  47%
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Sentiment</p>
                  <p className="mt-2 text-lg font-semibold text-white">Bullish</p>
                </div>
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/20 text-blue-200">
                  63%
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Dry powder</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {balance?.formatted ?? '0.00'} {balance?.symbol ?? ''}
                  </p>
                </div>
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/20 text-violet-200">
                  28%
                </div>
              </div>

              <button className="mt-2 inline-flex items-center justify-center rounded-full bg-blue-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-blue-500/25 transition hover:bg-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300">
                Generate strategy brief
              </button>
            </div>
          </section>
        </div>
      </div>
    </section>
  )
}

export default Dashboard
