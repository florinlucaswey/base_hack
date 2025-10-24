// src/wagmi/client.js
import '../polyfills/buffer'
import { createConfig, http } from 'wagmi'
import { mainnet, polygon } from 'wagmi/chains'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  walletConnectWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets'

const chains = [mainnet, polygon]
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Wallets',
      wallets: [walletConnectWallet, injectedWallet],
    },
  ],
  {
    projectId,
    appName: 'My Miniapp',
  }
)

export const wagmiClient = createConfig({
  chains,
  connectors,
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
  },
  ssr: false,
  autoConnect: true,
})
