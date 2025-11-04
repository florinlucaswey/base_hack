import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  COMPANY_IDS,
  initializeOracleState,
  advanceOracleState,
  ORACLE_UPDATE_INTERVAL_MS,
} from '../utils/oracle'
import './Trade.css'
import { useHip3Pool } from '../hooks/useHip3Pool.jsx'
import { Hip3LiquidityPanel } from '../components/Hip3LiquidityPanel.jsx'
import { useWallet } from '../hooks/useWalletContext.js'

const QUICK_AMOUNTS = ['0.5', '1', '2', '5']
const ORDER_TYPES = ['market', 'limit', 'stop']
const ETH_TO_USD = 3200
const HYPE_TO_USD = 1
const XI_SYMBOL = '\u039E'
const PROFIT_FEE_RATE = 0.005
const SUPPORTED_COLLATERAL = [
  { symbol: 'ETH', label: 'ETH', priceUsd: ETH_TO_USD, minAmount: 0.01 },
  { symbol: 'HYPE', label: 'HYPE', priceUsd: HYPE_TO_USD, minAmount: 10 },
]

const formatPrice = (value) => {
  if (!Number.isFinite(value)) return '$0.00'
  return `$${value.toFixed(2)}`
}

const formatChange = (value) => {
  if (!Number.isFinite(value)) return '+0.0%'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

const getSparklinePath = (data, width = 320, height = 160, padding = 10) => {
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

const getAreaPath = (data, width = 320, height = 160, padding = 10) => {
  if (!data || data.length === 0) return ''
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const innerWidth = width - padding * 2
  const innerHeight = height - padding * 2

  const points = data.map((value, index) => {
    const x = padding + (innerWidth * index) / Math.max(data.length - 1, 1)
    const y = padding + innerHeight - ((value - min) / range) * innerHeight
    return `${x.toFixed(2)} ${y.toFixed(2)}`
  })

  const lastX = padding + innerWidth
  const bottom = padding + innerHeight

  return `M${points[0]} L${points.slice(1).join(' L')} L${lastX.toFixed(
    2
  )} ${bottom.toFixed(2)} L${padding.toFixed(2)} ${bottom.toFixed(2)} Z`
}

const buildOrderbook = (price, depthScalar = 1) => {
  const basis = Number.isFinite(price) ? price : 0
  const liquidityBoost = Number.isFinite(depthScalar) && depthScalar > 0 ? depthScalar : 1
  const step = basis * 0.003 / Math.max(liquidityBoost, 0.5)
  const baseSize = Math.max(basis / 12, 8) * liquidityBoost
  const levels = 4

  const bids = Array.from({ length: levels }, (_, index) => {
    const levelPrice = basis - step * (index + 1)
    return {
      price: formatPrice(levelPrice),
      size: Math.max(baseSize - index * 1.4, 0.1).toFixed(1),
    }
  })

  const asks = Array.from({ length: levels }, (_, index) => {
    const levelPrice = basis + step * (index + 1)
    return {
      price: formatPrice(levelPrice),
      size: Math.max(baseSize - index * 1.2, 0.1).toFixed(1),
    }
  })

  return { bids, asks }
}

const Trade = () => {
  const wallet = useWallet() ?? {}
  const { address, isConnected } = wallet
  const [oracleState, setOracleState] = useState(() => initializeOracleState())
  const assets = oracleState.assets
  const [selectedId, setSelectedId] = useState(oracleState.assets[0]?.id ?? COMPANY_IDS[0] ?? '')
  const [side, setSide] = useState('buy')
  const [orderType, setOrderType] = useState('market')
  const [sizeEth, setSizeEth] = useState('1')
  const [sizeUsd, setSizeUsd] = useState(ETH_TO_USD.toFixed(2))
  const [sizeError, setSizeError] = useState('')
  const [collateralSymbol, setCollateralSymbol] = useState(SUPPORTED_COLLATERAL[0].symbol)
  const [collateralAmount, setCollateralAmount] = useState('1')
  const [collateralError, setCollateralError] = useState('')
  const {
    pool,
    metrics: poolMetrics,
    stake,
    withdraw,
    addFees,
    allocateTreasury,
    estimateExecution,
  } = useHip3Pool({
    initialLiquidityEth: 1.4,
    minLiquidityEth: 1,
    virtualInventoryMultiplier: 5,
    feeBps: 12,
    maxImpactBps: 240,
    baseSpreadBps: 8,
    widenedSpreadBps: 15,
    widenThreshold: 0.75,
    targetUtilization: 0.65,
    maxUtilization: 0.9,
  })
  const stakeIntoPool = useCallback(
    (amount) => {
      stake(amount, 'demo-liquidity-provider')
    },
    [stake]
  )
  const withdrawFromPool = useCallback(
    (amount) => {
      withdraw(amount, 'demo-liquidity-provider')
    },
    [withdraw]
  )
  const [positionsByWallet, setPositionsByWallet] = useState({})
  const [tradeNotice, setTradeNotice] = useState(null)

  useEffect(() => {
    const selectedExists = assets.some((asset) => asset.id === selectedId)
    if (!selectedExists && assets.length > 0) {
      setSelectedId(assets[0].id)
    }
  }, [assets, selectedId])
  const walletKey = useMemo(() => (address ? address.toLowerCase() : null), [address])
  const positions = useMemo(
    () => (walletKey ? positionsByWallet[walletKey] ?? [] : []),
    [positionsByWallet, walletKey]
  )
  const collateralMeta = useMemo(
    () => SUPPORTED_COLLATERAL.find((item) => item.symbol === collateralSymbol) ?? SUPPORTED_COLLATERAL[0],
    [collateralSymbol]
  )
  const collateralValueUsd = useMemo(() => {
    const amount = parseFloat(collateralAmount)
    if (!Number.isFinite(amount) || amount <= 0 || !collateralMeta) {
      return 0
    }
    return amount * collateralMeta.priceUsd
  }, [collateralAmount, collateralMeta])

  useEffect(() => {
    const interval = setInterval(() => {
      setOracleState((prev) => advanceOracleState(prev))
    }, ORACLE_UPDATE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])
  useEffect(() => {
    setTradeNotice(null)
  }, [walletKey])
  const assetsById = useMemo(() => {
    const map = new Map()
    assets.forEach((asset) => {
      map.set(asset.id, asset)
    })
    return map
  }, [assets])
  const updateWalletPositions = useCallback(
    (updater) => {
      if (!walletKey) return
      setPositionsByWallet((prev) => {
        const current = prev[walletKey] ?? []
        const next = updater(current)
        if (next === current) {
          return prev
        }
        const updated = { ...prev }
        if (Array.isArray(next) && next.length > 0) {
          updated[walletKey] = next
        } else {
          delete updated[walletKey]
        }
        return updated
      })
    },
    [walletKey]
  )

  const selectedAsset = useMemo(() => assetsById.get(selectedId) ?? assets[0], [assetsById, selectedId, assets])
  const orderbook = useMemo(
    () => buildOrderbook(selectedAsset?.price ?? 0, poolMetrics.depthScalar),
    [selectedAsset?.price, poolMetrics.depthScalar]
  )

  const validateSizes = useCallback((ethValue, usdValue, collateralUsd) => {
    const eth = parseFloat(ethValue)
    const usd = parseFloat(usdValue)
    if (Number.isNaN(eth) || Number.isNaN(usd)) {
      setSizeError('Enter valid numeric amounts for both ETH and USD sizes.')
      return
    }
    if (eth <= 0 || usd <= 0) {
      setSizeError('Order size must be greater than zero.')
      return
    }
    if (Math.abs(eth * ETH_TO_USD - usd) > ETH_TO_USD * 0.1) {
      setSizeError('ETH and USD amounts appear misaligned - please review your inputs.')
      return
    }
    setSizeError('')
    if (Number.isFinite(usd) && Number.isFinite(collateralUsd)) {
      if (usd > collateralUsd + 1e-6) {
        setCollateralError('Collateral must cover the full position size (no leverage).')
      } else {
        setCollateralError('')
      }
    } else if (!Number.isFinite(collateralUsd) || collateralUsd <= 0) {
      setCollateralError('Enter a valid collateral amount.')
    }
  }, [])

  const handleEthChange = (value) => {
    setSizeEth(value)
    const parsed = parseFloat(value)
    if (Number.isFinite(parsed)) {
      setSizeUsd((parsed * ETH_TO_USD).toFixed(2))
      validateSizes(value, (parsed * ETH_TO_USD).toFixed(2), collateralValueUsd)
    } else if (value === '') {
      setSizeUsd('')
      setSizeError('Order size cannot be empty.')
    } else {
      setSizeError('Enter a valid numeric amount.')
    }
  }

  const handleUsdChange = (value) => {
    setSizeUsd(value)
    const parsed = parseFloat(value)
    if (Number.isFinite(parsed)) {
      setSizeEth((parsed / ETH_TO_USD).toFixed(4))
      validateSizes((parsed / ETH_TO_USD).toFixed(4), value, collateralValueUsd)
    } else if (value === '') {
      setSizeEth('')
      setSizeError('Order size cannot be empty.')
    } else {
      setSizeError('Enter a valid numeric amount.')
    }
  }

  const handleCollateralAmountChange = (value) => {
    setCollateralAmount(value)
    const parsed = parseFloat(value)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setCollateralError('Enter a positive collateral amount.')
      return
    }
    setCollateralError('')
    validateSizes(sizeEth, sizeUsd, parsed * (collateralMeta?.priceUsd ?? 0))
  }

  const handleCollateralSymbolChange = (symbol) => {
    const target = SUPPORTED_COLLATERAL.find((item) => item.symbol === symbol) ?? SUPPORTED_COLLATERAL[0]
    setCollateralSymbol(symbol)
    const notionalUsdValue = Number.isFinite(parseFloat(sizeUsd))
      ? parseFloat(sizeUsd)
      : parseFloat(sizeEth) * ETH_TO_USD
    if (target && Number.isFinite(notionalUsdValue) && notionalUsdValue > 0) {
      const suggestedAmount = (notionalUsdValue / target.priceUsd).toFixed(target.symbol === 'ETH' ? 4 : 2)
      setCollateralAmount(suggestedAmount)
      setCollateralError('')
      validateSizes(sizeEth, sizeUsd, notionalUsdValue)
    } else {
      setCollateralAmount('')
      setCollateralError('Enter a positive collateral amount.')
    }
  }

  const notionalEth = parseFloat(sizeEth) || 0
  const notionalUsd = parseFloat(sizeUsd) || 0
  const collateralCoverageRatio =
    collateralValueUsd > 0 && notionalUsd > 0 ? collateralValueUsd / notionalUsd : null
  const executionPreview = useMemo(() => {
    if (sizeError || notionalEth <= 0) {
      return null
    }
    return estimateExecution(notionalEth, side)
  }, [estimateExecution, notionalEth, side, sizeError])
  const enrichedPositions = useMemo(
    () =>
      positions.map((position) => {
        const asset = assetsById.get(position.assetId)
        const markPrice = Number.isFinite(asset?.price) ? asset.price : position.entryPrice
        const grossPnlUsd =
          position.side === 'long'
            ? (markPrice - position.entryPrice) * position.size
            : (position.entryPrice - markPrice) * position.size
        const netPnlUsd = grossPnlUsd - (position.openFeeEth ?? 0) * ETH_TO_USD
        const collateralSymbol = position.collateralSymbol ?? 'ETH'
        const collateralPriceUsd =
          position.collateralPriceUsd ??
          (collateralSymbol === 'ETH' ? ETH_TO_USD : HYPE_TO_USD)
        const collateralAmount = position.collateralAmount ?? 0
        const collateralValueUsd =
          position.collateralValueUsd ?? collateralAmount * collateralPriceUsd
        const collateralCoverageRatio =
          collateralValueUsd > 0 && Number.isFinite(position.notionalUsd)
            ? position.notionalUsd / collateralValueUsd
            : null
        return {
          ...position,
          markPrice,
          grossPnlUsd,
          netPnlUsd,
          collateralSymbol,
          collateralAmount,
          collateralPriceUsd,
          collateralValueUsd,
          collateralCoverageRatio,
        }
      }),
    [positions, assetsById]
  )

  const canSubmit =
    isConnected &&
    executionPreview?.permitted &&
    !sizeError &&
    !collateralError &&
    Number.isFinite(notionalEth) &&
    notionalEth > 0 &&
    collateralValueUsd > 0 &&
    collateralValueUsd + 1e-6 >= notionalUsd

  const handleSubmitOrder = useCallback(() => {
    if (!walletKey) {
      setTradeNotice({ type: 'error', message: 'Connect your wallet to open a position.' })
      return
    }
    if (!selectedAsset) {
      setTradeNotice({ type: 'error', message: 'Select a market before placing an order.' })
      return
    }
    const size = parseFloat(sizeEth)
    if (!Number.isFinite(size) || size <= 0) {
      setSizeError('Order size must be greater than zero.')
      return
    }
    const collateralQty = parseFloat(collateralAmount)
    const collateralConfig = collateralMeta ?? SUPPORTED_COLLATERAL[0]
    if (!Number.isFinite(collateralQty) || collateralQty <= 0 || !collateralConfig) {
      setCollateralError('Enter a positive collateral amount.')
      return
    }
    const collateralUsd = collateralQty * (collateralConfig.priceUsd ?? 0)
    const notionalUsdValue = Number.isFinite(parseFloat(sizeUsd)) ? parseFloat(sizeUsd) : size * ETH_TO_USD
    if (collateralUsd + 1e-6 < notionalUsdValue) {
      setCollateralError('Collateral must be at least equal to the position notional.')
      return
    }
    if (!executionPreview?.permitted) {
      setTradeNotice({
        type: 'error',
        message: executionPreview?.reason ?? 'Liquidity not available for this order size.',
      })
      return
    }
    if (!Number.isFinite(selectedAsset.price)) {
      setTradeNotice({ type: 'error', message: 'Live price unavailable. Try again shortly.' })
      return
    }
    const fillPrice = selectedAsset.price * (executionPreview.slipFactor ?? 1)
    const openFeeEth = executionPreview.feeEth ?? 0
    if (openFeeEth > 0) {
      addFees(openFeeEth)
    }
    const displayCollateralAmount =
      collateralConfig.symbol === 'ETH' ? collateralQty.toFixed(4) : collateralQty.toFixed(2)
    const position = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      assetId: selectedAsset.id,
      ticker: selectedAsset.ticker,
      name: selectedAsset.name,
      side,
      size,
      notionalUsd: notionalUsdValue,
      sizeUsd: notionalUsdValue,
      entryPrice: fillPrice,
      entryTimestamp: Date.now(),
      openFeeEth,
      collateralSymbol: collateralConfig.symbol,
      collateralAmount: collateralQty,
      collateralPriceUsd: collateralConfig.priceUsd,
      collateralValueUsd: collateralUsd,
    }
    updateWalletPositions((current) => [...current, position])
    setTradeNotice({
      type: 'success',
      message: `Opened ${side} ${selectedAsset.ticker} @ ${formatPrice(fillPrice)} with ${displayCollateralAmount} ${collateralConfig.symbol} collateral.`,
    })
  }, [
    walletKey,
    selectedAsset,
    sizeEth,
    sizeUsd,
    executionPreview,
    addFees,
    updateWalletPositions,
    side,
    collateralAmount,
    collateralMeta,
  ])

  const handleClosePosition = useCallback(
    (position) => {
      const asset = assetsById.get(position.assetId)
      if (!asset) {
        setTradeNotice({ type: 'error', message: 'Unable to fetch latest price for this asset.' })
        return
      }
      if (!Number.isFinite(asset.price)) {
        setTradeNotice({ type: 'error', message: 'Live price unavailable. Try again shortly.' })
        return
      }
      const closeSide = position.side === 'long' ? 'sell' : 'buy'
      const closePreview = estimateExecution(position.size, closeSide)
      if (!closePreview?.permitted) {
        setTradeNotice({
          type: 'error',
          message: closePreview?.reason ?? 'Not enough liquidity to close this position right now.',
        })
        return
      }
      const exitPrice = (asset.price ?? position.entryPrice) * (closePreview.slipFactor ?? 1)
      let grossPnlUsd =
        position.side === 'long'
          ? (exitPrice - position.entryPrice) * position.size
          : (position.entryPrice - exitPrice) * position.size
      const closeFeeEth = closePreview.feeEth ?? 0
      if (closeFeeEth > 0) {
        addFees(closeFeeEth)
      }
      const closeFeeUsd = closeFeeEth * ETH_TO_USD
      const openFeeUsd = (position.openFeeEth ?? 0) * ETH_TO_USD
      const profitFeeUsd = grossPnlUsd > 0 ? grossPnlUsd * PROFIT_FEE_RATE : 0
      if (profitFeeUsd > 0) {
        allocateTreasury(profitFeeUsd / ETH_TO_USD)
      }
      const netPnlUsd = grossPnlUsd - closeFeeUsd - openFeeUsd - profitFeeUsd
      const totalFeesUsd = closeFeeUsd + openFeeUsd + profitFeeUsd
      const collateralReturnAmount = position.collateralAmount ?? 0
      const collateralReturnSymbol = position.collateralSymbol ?? 'ETH'
      const collateralReturnFormatted =
        collateralReturnSymbol === 'ETH'
          ? collateralReturnAmount.toFixed(4)
          : collateralReturnAmount.toFixed(2)
      updateWalletPositions((current) => current.filter((entry) => entry.id !== position.id))
      setTradeNotice({
        type: netPnlUsd >= 0 ? 'success' : 'warn',
        message: `Closed ${position.side} ${position.ticker} @ ${formatPrice(exitPrice)} • Net PnL ${
          netPnlUsd >= 0 ? '+' : '-'
        }$${Math.abs(netPnlUsd).toFixed(2)} (fees $${totalFeesUsd.toFixed(
          2
        )}) • Collateral returned: ${collateralReturnFormatted} ${collateralReturnSymbol}`,
      })
    },
    [assetsById, estimateExecution, addFees, allocateTreasury, updateWalletPositions]
  )

  useEffect(() => {
    validateSizes(sizeEth, sizeUsd, collateralValueUsd)
  }, [sizeEth, sizeUsd, collateralValueUsd, validateSizes])

  if (!selectedAsset) {
    return (
      <section className="trade-page text-slate-100">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center text-slate-400">
          No market data available yet. Try again shortly.
        </div>
      </section>
    )
  }

  return (
    <section className="trade-page text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Synthetic Markets</h1>
          <p className="text-sm text-slate-400">
            Trade pre-IPO exposures for OpenAI, SpaceX, and Neuralink in a controlled demo environment.
          </p>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.8fr_1fr] xl:grid-cols-[2fr_1fr]">
          <div className="space-y-8">
            <section className="rounded-xl border border-slate-900 bg-slate-900">
              <div className="border-b border-slate-900/70 px-5 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-200">Market overview</h2>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                      Charts refresh every 15 minutes with oracle pricing.
                    </p>
                  </div>
                  <div className="text-xs text-slate-400">
                    Focused on <span className="font-semibold text-slate-100">{selectedAsset.name}</span> ({selectedAsset.ticker})
                  </div>
                </div>
              </div>

              <div className="grid gap-6 px-5 py-6 md:grid-cols-2 xl:grid-cols-3">
                {assets.map((asset) => {
                  const isActive = asset.id === selectedAsset.id
                  const areaPath = getAreaPath(asset.history)
                  const linePath = getSparklinePath(asset.history)
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => setSelectedId(asset.id)}
                      className={`relative overflow-hidden rounded-xl border px-5 pb-5 pt-4 text-left transition ${
                        isActive
                          ? 'border-blue-500/70 bg-blue-500/10 text-white shadow-lg shadow-blue-500/10'
                          : 'border-slate-900 hover:border-slate-800 hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{asset.name}</p>
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                            {asset.ticker}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-semibold ${
                            asset.change >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {formatChange(asset.change)}
                        </span>
                      </div>

                      <svg viewBox="0 0 320 160" className="mt-4 h-36 w-full">
                        <defs>
                          <linearGradient id={`cardStroke-${asset.id}`} x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#60a5fa" />
                            <stop offset="100%" stopColor="#34d399" />
                          </linearGradient>
                          <linearGradient id={`cardFill-${asset.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgba(96,165,250,0.25)" />
                            <stop offset="100%" stopColor="rgba(15,23,42,0.02)" />
                          </linearGradient>
                        </defs>
                        <rect
                          x="0"
                          y="0"
                          width="320"
                          height="160"
                          fill="none"
                          stroke="rgba(71,85,105,0.2)"
                        />
                        <path d={areaPath} fill={`url(#cardFill-${asset.id})`} />
                        <path
                          d={linePath}
                          fill="none"
                          stroke={`url(#cardStroke-${asset.id})`}
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                      </svg>

                      <div className="mt-4 flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-100">
                          {formatPrice(asset.price)}
                        </span>
                        <span className="text-xs text-slate-400">
                          24h vol: {XI_SYMBOL} {asset.volume}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-900 bg-slate-900 p-5">
                <h3 className="text-sm font-semibold text-slate-200">
                  Orderbook {'\u2022'} {selectedAsset.ticker}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Mark price {formatPrice(selectedAsset.price)} {'\u2022'} Daily change{' '}
                  <span
                    className={selectedAsset.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}
                  >
                    {formatChange(selectedAsset.change)}
                  </span>
                </p>
                <p className="mt-2 text-[0.7rem] uppercase tracking-[0.3em] text-slate-600">
                  HIP-3 depth x{poolMetrics.depthScalar.toFixed(2)} • Effective {poolMetrics.effectiveDepthEth.toFixed(2)} ETH
                </p>
                <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-slate-300">
                  <div className="space-y-2">
                    <p className="text-slate-400">Bids</p>
                    {orderbook.bids.map((row) => (
                      <div key={`${row.price}-bid`} className="flex justify-between">
                        <span>{row.price}</span>
                        <span>
                          {XI_SYMBOL} {row.size}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <p className="text-slate-400">Asks</p>
                    {orderbook.asks.map((row) => (
                      <div key={`${row.price}-ask`} className="flex justify-between">
                        <span>{row.price}</span>
                        <span>
                          {XI_SYMBOL} {row.size}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-900 bg-slate-900 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200">Open Positions</h3>
                  {isConnected ? (
                    <span className="text-xs text-slate-500">{enrichedPositions.length} live</span>
                  ) : (
                    <span className="text-xs text-amber-300">Connect wallet to trade</span>
                  )}
                </div>
                <div className="mt-4 space-y-3">
                  {!isConnected ? (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200">
                      Connect your wallet to open and manage perpetual positions.
                    </div>
                  ) : enrichedPositions.length === 0 ? (
                    <div className="rounded-lg border border-slate-900/80 bg-slate-950/70 p-6 text-xs text-slate-500">
                      No open positions yet. Submit a trade to start tracking PnL.
                    </div>
                  ) : (
                    enrichedPositions.map((position) => {
                      const markPriceFormatted = formatPrice(position.markPrice)
                      const entryPriceFormatted = formatPrice(position.entryPrice)
                      const pnlClass =
                        position.netPnlUsd > 0
                          ? 'text-emerald-400'
                          : position.netPnlUsd < 0
                          ? 'text-rose-400'
                          : 'text-slate-300'
                      const collateralAmountNumber = Number(position.collateralAmount ?? 0)
                      const collateralAmountDisplay =
                        position.collateralSymbol === 'ETH'
                          ? collateralAmountNumber.toFixed(4)
                          : collateralAmountNumber.toFixed(2)
                      const collateralValueDisplay = Number(
                        position.collateralValueUsd ??
                          collateralAmountNumber * (position.collateralPriceUsd ?? 0)
                      ).toFixed(2)
                      const coverageDisplay =
                        position.collateralCoverageRatio && position.collateralCoverageRatio > 0
                          ? position.collateralCoverageRatio.toFixed(2)
                          : null
                      return (
                        <div
                          key={position.id}
                          className="rounded-lg border border-slate-900/70 bg-slate-950/70 p-4 text-xs text-slate-300"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-100">
                                {position.ticker}{' '}
                                <span
                                  className={`ml-2 rounded-full px-2 py-1 text-[0.65rem] uppercase tracking-wide ${
                                    position.side === 'long'
                                      ? 'bg-emerald-500/10 text-emerald-300'
                                      : 'bg-rose-500/10 text-rose-300'
                                  }`}
                                >
                                  {position.side}
                                </span>
                              </p>
                              <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-500">
                                Size {XI_SYMBOL} {position.size.toFixed(4)}
                              </p>
                              <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-500">
                                Notional ${position.notionalUsd?.toFixed ? position.notionalUsd.toFixed(2) : (position.size * ETH_TO_USD).toFixed(2)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleClosePosition(position)}
                              className="rounded-lg border border-slate-700 px-3 py-1 text-[0.7rem] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                            >
                              Close
                            </button>
                          </div>
                          <div className="mt-3 grid gap-2 text-[0.7rem] leading-relaxed md:grid-cols-2">
                            <div>
                              <span className="text-slate-500">Entry</span>
                              <div>{entryPriceFormatted}</div>
                            </div>
                            <div>
                              <span className="text-slate-500">Mark</span>
                              <div>{markPriceFormatted}</div>
                            </div>
                            <div>
                              <span className="text-slate-500">Collateral</span>
                              <div>
                                {collateralAmountDisplay} {position.collateralSymbol}{' '}
                                <span className="text-slate-500">(${collateralValueDisplay})</span>
                              </div>
                              {coverageDisplay && (
                                <div className="text-slate-500">Coverage {coverageDisplay}x</div>
                              )}
                            </div>
                            <div>
                              <span className="text-slate-500">Unrealized PnL</span>
                              <div className={pnlClass}>
                                {position.netPnlUsd >= 0 ? '+' : '-'}${Math.abs(position.netPnlUsd).toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-500">Opened</span>
                              <div>{new Date(position.entryTimestamp).toLocaleTimeString()}</div>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <section className="space-y-6 rounded-xl border border-slate-900 bg-slate-900 p-6">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-slate-200">New position</h2>
                <p className="text-xs font-medium text-slate-300">
                  {selectedAsset?.name ?? 'Select a company'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-[0.7rem] uppercase tracking-[0.3em] text-slate-500">
                Simulated execution only
              </div>
              {tradeNotice && (
                <div
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    tradeNotice.type === 'success'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : tradeNotice.type === 'warn'
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                      : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                  }`}
                >
                  {tradeNotice.message}
                </div>
              )}
              {!isConnected && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  Connect your wallet to open a position.
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-sm">
                {['buy', 'sell'].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSide(option)}
                    className={`rounded-lg px-4 py-2 capitalize transition ${
                      side === option
                        ? option === 'buy'
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-red-500 text-white'
                        : 'bg-slate-950 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs text-slate-400">
                {ORDER_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setOrderType(type)}
                    className={`rounded-lg border px-3 py-2 capitalize transition ${
                      orderType === type
                        ? 'border-slate-300 text-slate-100'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 text-xs">
                <label className="space-y-2">
                  <span className="uppercase tracking-[0.3em] text-slate-500">
                    Size ({XI_SYMBOL})
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={sizeEth}
                    onChange={(event) => handleEthChange(event.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </label>
                <label className="space-y-2">
                  <span className="uppercase tracking-[0.3em] text-slate-500">Size ($)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={sizeUsd}
                    onChange={(event) => handleUsdChange(event.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </label>
              </div>
              {sizeError ? (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {sizeError}
                </p>
              ) : null}

            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((amount) => {
                const parsed = parseFloat(amount)
                const collateralPreset =
                  collateralSymbol === 'ETH'
                    ? amount
                    : Number.isFinite(parsed)
                    ? (parsed * ETH_TO_USD).toFixed(2)
                    : ''
                return (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => {
                      handleEthChange(amount)
                      if (collateralSymbol === 'ETH' && collateralPreset) {
                        handleCollateralAmountChange(collateralPreset)
                      } else if (collateralSymbol === 'HYPE' && collateralPreset) {
                        handleCollateralAmountChange(collateralPreset)
                      }
                    }}
                    className={`rounded-lg border px-3 py-1 text-xs transition ${
                      Math.abs(parseFloat(sizeEth) - parsed) < 1e-9
                        ? 'border-slate-200 text-slate-100'
                        : 'border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {XI_SYMBOL} {amount}
                  </button>
                )
              })}
            </div>

            <div className="space-y-2 text-xs">
              <span className="uppercase tracking-[0.3em] text-slate-500">Collateral asset</span>
              <div className="flex flex-wrap gap-2">
                {SUPPORTED_COLLATERAL.map((coll) => (
                  <button
                    key={coll.symbol}
                    type="button"
                    onClick={() => handleCollateralSymbolChange(coll.symbol)}
                    className={`rounded-lg border px-3 py-1 transition ${
                      collateralSymbol === coll.symbol
                        ? 'border-blue-400 bg-blue-500/10 text-blue-200'
                        : 'border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {coll.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="space-y-2 text-xs">
              <span className="uppercase tracking-[0.3em] text-slate-500">
                Collateral amount ({collateralSymbol})
              </span>
              <input
                type="number"
                min="0"
                step="0.0001"
                value={collateralAmount}
                onChange={(event) => handleCollateralAmountChange(event.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </label>
            <p className="text-[0.7rem] text-slate-500">
              Collateral value: ${collateralValueUsd.toFixed(2)}{' '}
              {collateralCoverageRatio ? `• Coverage ${(collateralCoverageRatio).toFixed(2)}x` : ''}
            </p>
            {collateralError ? (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                {collateralError}
              </p>
            ) : null}

            {orderType !== 'market' && (
                <label className="space-y-2 text-xs">
                  <span className="uppercase tracking-[0.3em] text-slate-500">Trigger price</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="$ 0.00"
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </label>
              )}

              <button
                type="button"
                onClick={handleSubmitOrder}
                disabled={!canSubmit}
                className={`w-full rounded-lg py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  side === 'buy'
                    ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                    : 'bg-red-500 text-white hover:bg-red-400'
                }`}
              >
                {side === 'buy' ? 'Submit buy order' : 'Submit sell order'}
              </button>

              <div className="rounded-lg border border-slate-900 bg-slate-950 p-4 text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>HIP-3 liquidity</span>
                  <span className={executionPreview?.permitted ? 'text-emerald-400' : 'text-amber-300'}>
                    {executionPreview?.permitted ? 'Sufficient' : 'Unavailable'}
                  </span>
                </div>
                <div className="mt-2 flex justify-between">
                  <span>Slippage</span>
                  <span>
                    {executionPreview?.permitted ? `${executionPreview.impactBps.toFixed(1)} bps` : '---'}
                  </span>
                </div>
                <div className="mt-2 flex justify-between">
                  <span>Spread</span>
                  <span>
                    {executionPreview?.permitted
                      ? `${(executionPreview.spreadBps ?? 0).toFixed(1)} bps`
                      : '---'}
                  </span>
                </div>
                <div className="mt-2 flex justify-between">
                  <span>Fees</span>
                  <span>
                    {executionPreview?.permitted
                      ? `${XI_SYMBOL} ${executionPreview.feeEth.toFixed(4)}`
                      : `${XI_SYMBOL} 0.0000`}
                  </span>
                </div>
                <div className="mt-2 flex justify-between text-slate-200">
                  <span>Total ETH</span>
                  <span>
                    {executionPreview?.permitted
                      ? `${XI_SYMBOL} ${executionPreview.totalCostEth.toFixed(4)}`
                      : `${XI_SYMBOL} ${notionalEth.toFixed(4)}`}
                  </span>
                </div>
                <div className="mt-2 flex justify-between text-slate-500">
                  <span>Collateral value</span>
                  <span>
                    ${collateralValueUsd.toFixed(2)} ({collateralSymbol})
                  </span>
                </div>
                <div className="mt-2 flex justify-between text-slate-500">
                  <span>Coverage</span>
                  <span>{collateralCoverageRatio ? `${collateralCoverageRatio.toFixed(2)}x` : '--'}</span>
                </div>
                <div className="mt-2 flex justify-between text-slate-500">
                  <span>Notional</span>
                  <span>
                    {XI_SYMBOL} {notionalEth.toFixed(4)} {'\u2022'} ${notionalUsd.toFixed(2)}
                  </span>
                </div>
                {!executionPreview?.permitted && executionPreview?.reason && (
                  <p className="mt-3 text-[0.7rem] text-amber-200">{executionPreview.reason}</p>
                )}
              </div>

              <p className="text-xs text-slate-500">
                Orders settle off-chain in this demo. Connect your wallet to save activity.
              </p>
            </section>

            <Hip3LiquidityPanel
              metrics={poolMetrics}
              lastEvent={pool.lastEvent}
              onStake={stakeIntoPool}
              onWithdraw={withdrawFromPool}
              estimateExecution={estimateExecution}
            />
          </aside>
        </div>
      </div>
    </section>
  )
}

export default Trade
