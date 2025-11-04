import { useCallback, useMemo, useState } from 'react'
import {
  createHip3Pool,
  distributeFees,
  estimateHip3Execution,
  getPoolMetrics,
  stakeEth,
  withdrawEth,
} from '../utils/liquidity/hip3Pool.js'

export const useHip3Pool = (config) => {
  const [pool, setPool] = useState(() => createHip3Pool(config))

  const stake = useCallback((amountEth, stakerId = 'user') => {
    setPool((prev) => stakeEth(prev, amountEth, stakerId))
  }, [])

  const withdraw = useCallback((amountEth, stakerId = 'user') => {
    setPool((prev) => withdrawEth(prev, amountEth, stakerId))
  }, [])

  const addFees = useCallback((amountEth) => {
    setPool((prev) => distributeFees(prev, amountEth))
  }, [])

  const metrics = useMemo(() => getPoolMetrics(pool), [pool])

  const estimateExecution = useCallback(
    (sizeEth, side) => estimateHip3Execution(pool, sizeEth, side),
    [pool]
  )

  return {
    pool,
    metrics,
    stake,
    withdraw,
    addFees,
    estimateExecution,
  }
}
