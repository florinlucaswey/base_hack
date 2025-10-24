import { useContext } from 'react'
import { WalletContext } from '../context/wallet-context'

export const useWallet = () => useContext(WalletContext)
