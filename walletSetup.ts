/// <reference types="vite/client" />
import { createConfig, http } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

export const config = createConfig({
  chains: [mainnet],
  connectors: [
    injected(), // MetaMask or in-app wallet
    walletConnect({
      projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID, // get from .env (VITE_WALLETCONNECT_PROJECT_ID)
    }),
  ],
  transports: {
    [mainnet.id]: http(),
  },
})
