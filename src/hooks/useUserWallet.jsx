// useUserWallet.jsx
import { useAccount, useBalance } from 'wagmi';

export const useUserWallet = () => {
  const { address, isConnected } = useAccount();
  const { data: balance } = useBalance({ address });
  return { address, balance, isConnected };
};
