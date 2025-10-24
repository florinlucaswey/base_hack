import React from 'react'
import { WalletContext } from './wallet-context'
import { useUserWallet } from '../hooks/useUserWallet'

export const WalletProvider = ({ children }) => {
  const wallet = useUserWallet()
  return (
    <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>
  )
}
