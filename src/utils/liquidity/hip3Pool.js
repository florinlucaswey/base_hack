const HIP3_DEFAULTS = {
  minLiquidityEth: 1,
  initialLiquidityEth: 1.4,
  virtualInventoryMultiplier: 5,
  targetUtilization: 0.65,
  feeBps: 12,
  maxImpactBps: 240,
  baseSpreadBps: 8,
  widenedSpreadBps: 15,
  widenThreshold: 0.75,
  maxUtilization: 0.9,
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
    treasuryEth: 0,
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

export const creditTreasury = (pool, amountEth) => {
  const amount = toFiniteNumber(amountEth)
  if (!(amount >= 0)) {
    throw new Error('Treasury credit must be a valid number.')
  }
  if (amount === 0) {
    return pool
  }
  return {
    ...pool,
    treasuryEth: pool.treasuryEth + amount,
    lastEvent: { type: 'treasury', amountEth: amount, timestamp: Date.now() },
  }
}

export const getPoolMetrics = (pool) => {
  const { ethLiquidity, config } = pool
  const {
    minLiquidityEth,
    virtualInventoryMultiplier,
    targetUtilization,
    feeBps,
    maxImpactBps,
    baseSpreadBps,
    widenedSpreadBps,
    widenThreshold,
    maxUtilization,
  } = config
  const supportsDex = ethLiquidity >= minLiquidityEth
  const safetyBufferEth = Math.max(ethLiquidity - minLiquidityEth, 0)
  const coverageRatio = minLiquidityEth === 0 ? Infinity : ethLiquidity / minLiquidityEth
  const effectiveDepthEth = ethLiquidity * virtualInventoryMultiplier
  const depthScalar = Math.max(0.25, Math.min(coverageRatio / targetUtilization, 4))

  return {
    supportsDex,
    ethLiquidity,
    safetyBufferEth,
    coverageRatio,
    effectiveDepthEth,
    depthScalar,
    treasuryEth: pool.treasuryEth,
    feeBps,
    baseSpreadBps,
    widenedSpreadBps,
    widenThreshold,
    maxImpactBps,
    maxUtilization,
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

  const effectiveDepth = Math.max(metrics.effectiveDepthEth * (metrics.maxUtilization ?? 1), 1e-6)
  const utilization = clamp(tradeSize / effectiveDepth, 0, 1)
  const impactBps = utilization * metrics.maxImpactBps
  let spreadBps = metrics.baseSpreadBps ?? 0
  if (metrics.widenThreshold !== undefined && metrics.widenedSpreadBps !== undefined) {
    if (utilization > metrics.widenThreshold) {
      spreadBps = metrics.widenedSpreadBps
    }
  }
  const slipBps = spreadBps + impactBps
  const slipFactor =
    side === 'buy'
      ? 1 + slipBps / 10_000
      : Math.max(0, 1 - slipBps / 10_000)
  const feeEth = (tradeSize * metrics.feeBps) / 10_000

  return {
    permitted: true,
    utilization,
    impactBps,
    spreadBps,
    slipBps,
    slipFactor,
    feeEth,
    totalCostEth: tradeSize * slipFactor + feeEth,
    metrics,
  }
}
