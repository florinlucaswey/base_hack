// src/App.jsx
import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Trade from './pages/Trade'
import { WalletProvider } from './context/WalletContext'
import { sdk } from '@farcaster/miniapp-sdk'

function App() {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const initMiniApp = async () => {
      try {
        const inMiniApp = await sdk.isInMiniApp()

        if (!inMiniApp) {
          console.warn('[app] Not running inside Farcaster MiniApp. Skipping sdk.actions.ready().')
          return
        }

        await sdk.actions.ready()
        console.log('[app] Farcaster MiniApp ready')
      } catch (err) {
        console.error('[app] Error initializing Farcaster SDK:', err)
      } finally {
        setIsReady(true)
      }
    }

    initMiniApp()
  }, [])

  // Optional loading screen (displayed while sdk.ready() resolves)
  if (!isReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-700">
        <h2 className="text-2xl font-semibold mb-4">Loading MiniApp...</h2>
        <p>Please hold on a moment.</p>
      </div>
    )
  }

  // Main application content (rendered after sdk.ready() completes)
  return (
    <Router>
      <WalletProvider>
        <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
          <div className="relative">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_55%)]" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_center,_rgba(168,85,247,0.12),_transparent_70%)]" />
          </div>
          <div className="relative">
            <Header />
            <main className="pb-20">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/trade" element={<Trade />} />
              </Routes>
            </main>
          </div>
        </div>
      </WalletProvider>
    </Router>
  )
}

export default App

