import { createConfig, http } from 'wagmi'
import { mainnet } from '@wagmi/core/chains'
import { injected, walletConnect } from '@wagmi/connectors'

export const config = createConfig({
  chains: [mainnet],
  transports: {
    [mainnet.id]: http(), // ersetzt publicProvider()
  },
  connectors: [
    injected(),
    walletConnect({
      projectId: 'DEIN_WALLETCONNECT_PROJECT_ID',
    }),
  ],
})
