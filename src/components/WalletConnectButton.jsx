import React from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'

export const WalletConnectButton = ({ className }) => {
  return (
    <div className={className}>
      <ConnectButton showBalance={false} />
    </div>
  )
}

export default WalletConnectButton
