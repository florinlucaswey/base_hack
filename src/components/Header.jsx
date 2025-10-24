import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'

const NAV_ITEMS = [
  { label: 'Home', to: '/' },
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Trade', to: '/trade' },
]

export const Header = () => {
  const { pathname } = useLocation()

  return (
    <header className="sticky top-0 z-50 border-b border-slate-900/70 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="text-xs uppercase tracking-[0.4em] text-blue-200 transition-colors hover:text-blue-100"
          >
            Oracle Trade
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium text-slate-300 sm:gap-6">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.to
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`rounded-full px-4 py-2 transition-colors ${
                    isActive
                      ? 'bg-blue-500/20 text-blue-200 shadow-[0_0_0_1px_rgba(59,130,246,0.4)]'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <ConnectButton showBalance={false} />
      </div>
    </header>
  )
}

export default Header
