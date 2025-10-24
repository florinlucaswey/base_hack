import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import WalletConnectButton from '../components/WalletConnectButton'
import StatCard from '../components/StatCard'
import { generateCompanyValuations, ORACLE_UPDATE_INTERVAL_MS } from '../utils/oracle'
import './Home.css'

const formatPrice = (value) => (Number.isFinite(value) ? `$${value.toFixed(2)}` : 'N/A')

const Home = () => {
  const [valuations, setValuations] = useState([])

  useEffect(() => {
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
  }, [])

  const totalValuation = useMemo(
    () => valuations.reduce((sum, company) => sum + (company.targetPrice ?? 0), 0),
    [valuations]
  )
  const topAsset = useMemo(
    () =>
      valuations.reduce(
        (prev, current) => (current.targetPrice > (prev?.targetPrice ?? 0) ? current : prev),
        null
      ),
    [valuations]
  )
  const lastUpdated = valuations[0]?.timestamp ? new Date(valuations[0].timestamp) : null

  return (
    <section className="home-page">
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl flex-col gap-16 px-6 pb-24 pt-28 sm:px-8 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/60 px-3 py-1 text-[0.7rem] font-medium uppercase tracking-[0.35em] text-slate-300">
              Demo environment
            </div>
            <div className="space-y-6">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
                A modern trading lab for pre-IPO innovators
              </h1>
              <p className="text-base text-slate-300 sm:text-lg">
                Explore a fully simulated trading terminal designed for alternative assets. Practice
                pricing, order routing, and risk management using live oracle data — without touching
                real capital.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <WalletConnectButton className="rounded-full bg-blue-500 px-7 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-blue-500/25 transition hover:bg-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" />
              <Link
                to="/trade"
                className="rounded-full border border-white/20 px-7 py-3 text-sm font-semibold text-slate-200 transition hover:border-blue-400/70 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
              >
                Launch trading terminal
              </Link>
            </div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
              No live funds — education-focused demo
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <StatCard
              label="Total synthetic exposure"
              value={formatPrice(totalValuation)}
              helper="Blended price targets across all tracked issuers."
              badge="Live"
              accent="blue"
            />
            <StatCard
              label="Assets tracked"
              value={valuations.length.toString().padStart(2, '0')}
              helper="High-growth private companies streaming real telemetry."
              accent="emerald"
            />
            <StatCard
              label="Top momentum"
              value={topAsset ? topAsset.name : 'Awaiting data'}
              helper={
                topAsset ? `${topAsset.ticker} • ${formatPrice(topAsset.targetPrice)}` : 'Oracle syncing'
              }
              accent="violet"
            />
            <StatCard
              label="Last oracle update"
              value={lastUpdated ? lastUpdated.toLocaleTimeString() : 'Syncing'}
              helper={lastUpdated ? lastUpdated.toLocaleDateString() : 'Pulling latest snapshot'}
              accent="amber"
            />
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-2xl shadow-blue-500/5 backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-white">Trusted by builders & analysts</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Build conviction with blended internal performance and external sentiment streaming from
                  our synthetic oracle.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs uppercase tracking-[0.35em] text-slate-400">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
                Oracle synced
              </div>
            </div>

            <ul className="mt-8 grid gap-5 text-sm text-slate-300 sm:grid-cols-2">
              {[
                'Live financial telemetry from Crunchbase and PitchBook',
                'Sector sentiment blended with macro market indices',
                'Risk analytics calibrated for private market volatility',
                'Workflow designed to mirror institutional trading desks',
              ].map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-1 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-200"
                  >
                    ✓
                  </span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-slate-900/30 backdrop-blur">
            <header className="flex items-center justify-between text-sm text-slate-400">
              <span className="uppercase tracking-[0.35em]">Oracle snapshot</span>
              {lastUpdated ? (
                <span>Updated {lastUpdated.toLocaleTimeString()}</span>
              ) : (
                <span>Awaiting first sync…</span>
              )}
            </header>
            <div className="mt-4 overflow-hidden rounded-2xl border border-white/5">
              <table className="w-full text-sm text-slate-300">
                <thead className="bg-slate-950/60 text-xs uppercase tracking-[0.35em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Company</th>
                    <th className="px-4 py-3 text-left font-medium">Ticker</th>
                    <th className="px-4 py-3 text-left font-medium">Category</th>
                    <th className="px-4 py-3 text-right font-medium">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {valuations.map((company) => (
                    <tr key={company.id} className="border-t border-white/[0.06] hover:bg-white/[0.03]">
                      <td className="px-4 py-3 text-sm text-white">{company.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{company.ticker}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{company.category}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-white">
                        {formatPrice(company.targetPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 text-xs text-slate-500">
              Targets blend internal KPIs, public sentiment, and sector momentum. Refresh cadence: every
              15 minutes.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Home
