const HIP3_DEFAULTS = {
  minLiquidityEth: 1,
  initialLiquidityEth: 1.2,
  virtualInventoryMultiplier: 4.5,
  targetUtilization: 0.65,
  feeBps: 12,
  maxImpactBps: 240,
}

const toFiniteNumber = (value) => {
  const parsed = typeof value === 'string' ? parseFloat(value) : value
  return Number.isFinite(parsed) ? parsed : NaN
}

const cloneStakers = (stakers) => stakers.map((entry) => ({ ...entry }))

export const createHip3Pool = (config = {}) => {
  const merged = { ...HIP3_DEFAULTS, ...config }
  const initialLiquidity = Math.max(merged.initialLiquidityEth ?? merged.minLiquidityEth, merged.minLiquidityEth)
  return {
    ethLiquidity: initialLiquidity,
    cumulativeFeesEth: 0,
    stakers: [],
    lastEvent: null,
    config: merged,
  }
}

export const stakeEth = (pool, amountEth, stakerId = 'anon') => {
  const amount = toFiniteNumber(amountEth)
  if (!(amount > 0)) {
    throw new Error('Stake amount must be greater than zero.')
  }

  const stakers = cloneStakers(pool.stakers)
  const existing = stakers.find((entry) => entry.id === stakerId)
  if (existing) {
    existing.amountEth += amount
  } else {
    stakers.push({ id: stakerId, amountEth: amount })
  }

  return {
    ...pool,
    ethLiquidity: pool.ethLiquidity + amount,
    stakers,
    lastEvent: { type: 'stake', stakerId, amountEth: amount, timestamp: Date.now() },
  }
}

export const withdrawEth = (pool, amountEth, stakerId = 'anon') => {
  const amount = toFiniteNumber(amountEth)
  if (!(amount > 0)) {
    throw new Error('Withdrawal amount must be greater than zero.')
  }

  const stakers = cloneStakers(pool.stakers)
  const existing = stakers.find((entry) => entry.id === stakerId)
  if (!existing || existing.amountEth < amount - 1e-9) {
    throw new Error('Insufficient staked balance for withdrawal.')
  }

  const nextLiquidity = pool.ethLiquidity - amount
  if (nextLiquidity < pool.config.minLiquidityEth - 1e-9) {
    throw new Error(`Pool requires at least ${pool.config.minLiquidityEth} ETH to remain active.`)
  }

  existing.amountEth -= amount
  const filtered = existing.amountEth > 1e-9 ? stakers : stakers.filter((entry) => entry.id !== stakerId)

  return {
    ...pool,
    ethLiquidity: nextLiquidity,
    stakers: filtered,
    lastEvent: { type: 'withdraw', stakerId, amountEth: amount, timestamp: Date.now() },
  }
}

export const distributeFees = (pool, feeEth) => {
  const amount = toFiniteNumber(feeEth)
  if (!(amount >= 0)) {
    throw new Error('Fee amount must be a valid number.')
  }

  if (amount === 0) {
    return pool
  }

  return {
    ...pool,
    ethLiquidity: pool.ethLiquidity + amount,
    cumulativeFeesEth: pool.cumulativeFeesEth + amount,
    lastEvent: { type: 'fee', amountEth: amount, timestamp: Date.now() },
  }
}

export const getPoolMetrics = (pool) => {
  const { ethLiquidity, config } = pool
  const { minLiquidityEth, virtualInventoryMultiplier, targetUtilization, feeBps, maxImpactBps } = config
  const supportsDex = ethLiquidity >= minLiquidityEth
  const safetyBufferEth = Math.max(ethLiquidity - minLiquidityEth, 0)
  const coverageRatio = minLiquidityEth === 0 ? Infinity : ethLiquidity / minLiquidityEth
  const effectiveDepthEth = ethLiquidity * virtualInventoryMultiplier
  const depthScalar = Math.max(0.25, Math.min(coverageRatio / targetUtilization, 4))
  const baseSpreadBps = feeBps + (supportsDex ? Math.max(6, Math.round(24 / Math.max(coverageRatio, 1))) : 0)

  return {
    supportsDex,
    ethLiquidity,
    safetyBufferEth,
    coverageRatio,
    effectiveDepthEth,
    depthScalar,
    feeBps,
    baseSpreadBps,
    maxImpactBps,
    targetUtilization,
    virtualInventoryMultiplier,
  }
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

export const estimateHip3Execution = (pool, sizeEth, side = 'buy') => {
  const tradeSize = toFiniteNumber(sizeEth)
  if (!(tradeSize >= 0)) {
    return {
      permitted: false,
      reason: 'Trade size must be a valid non-negative number.',
    }
  }

  const metrics = getPoolMetrics(pool)
  if (!metrics.supportsDex) {
    return {
      permitted: false,
      reason: `Pool needs at least ${pool.config.minLiquidityEth} ETH to enable trading.`,
    }
  }

  const effectiveDepth = Math.max(metrics.effectiveDepthEth, 1e-6)
  const utilization = clamp(tradeSize / effectiveDepth, 0, 0.999)
  const impactBps = utilization * metrics.maxImpactBps
  const slipFactor = side === 'buy' ? 1 + impactBps / 10_000 : 1 - impactBps / 10_000
  const feeEth = (tradeSize * metrics.feeBps) / 10_000

  return {
    permitted: true,
    utilization,
    impactBps,
    slipFactor,
    feeEth,
    totalCostEth: tradeSize * slipFactor + feeEth,
    metrics,
  }
}
