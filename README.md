# Oracle Trade

Oracle Trade is a Farcaster-ready, wallet-connected trading lab that simulates pre-IPO markets. It is built with Vite + React, styled with Tailwind CSS, and wired to RainbowKit/Wagmi so you can plug in a real wallet while still executing orders in a fully sandboxed environment. The app ships three experiences—Home, Dashboard, and Trade—that all consume a shared synthetic oracle stream, making it ideal for demos, hackathons, or onboarding flows where you need live-feeling data without touching production markets.

## Key Features

- **MiniApp aware:** `src/App.jsx` boots against `@farcaster/miniapp-sdk` and only proceeds once `sdk.actions.ready()` resolves when the bundle runs inside Warpcast.
- **Wallet-first experience:** `src/wagmi/client.js` configures RainbowKit + Wagmi (mainnet/polygon) with wallet-connectors so users can connect, read balances, and see personalized dashboard copy.
- **Synthetic oracle pipeline:** `src/utils/oracle.js` continuously generates valuations, history series, and telemetry for OpenAI, SpaceX, and Neuralink with configurable price bands and refresh intervals.
- **Purpose-built views:** Each route focuses on a different slice—marketing splash (Home), analytics (Dashboard), and market micro-structure with live order entry (Trade).
- **Modern tooling:** Vite 7, React 18, Tailwind 3, React Router, TanStack Query, and ESLint 9 keep builds fast and DX familiar.

## Tech Stack

- React 18 + React Router for UI/flow.
- Vite for dev server and builds.
- Tailwind CSS for styling, plus bespoke utility classes.
- Wagmi + RainbowKit + WalletConnect for authentication.
- TanStack Query for request state management.
- Farcaster MiniApp SDK for host integration.

## Getting Started

1. **Prerequisites**  
   Install Node.js ≥ 18.18 and npm ≥ 9. (pnpm/yarn works too, but the repo ships with `package-lock.json`.)

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**  
   Create a `.env` (or `.env.local`) alongside `package.json` and add your WalletConnect project id. Without it, RainbowKit can still render, but WalletConnect won’t initialize.
   ```ini
   VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here
   ```

4. **Start the dev server**
   ```bash
   npm run dev
   ```
   Vite prints a local URL plus a network URL you can point Warpcast to when side-loading a MiniApp.

### Available Scripts

| Command          | Description                                                                          |
| ---------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`    | Launches Vite with Hot Module Replacement.                                           |
| `npm run build`  | Creates a production build in `dist/`.                                               |
| `npm run preview`| Serves the production build locally for smoke-testing.                               |
| `npm run lint`   | Runs ESLint across `src/` using the configs in `eslint.config.js`.                   |

## Project Layout

- `src/App.jsx` – Routes (`/`, `/dashboard`, `/trade`) and Farcaster readiness gate.
- `src/pages/` – View-specific logic and layouts:
  - `Home.jsx` – Marketing hero, stats, and live oracle snapshot table.
  - `Dashboard.jsx` – Portfolio table, sparkline SVGs, and wallet-aware metrics.
  - `Trade.jsx` – Asset cards, generated orderbook, order ticket with validation.
- `src/components/` – Header navigation, shared CTA button, StatCard, and RainbowKit wrapper.
- `src/context` + `src/hooks` – Wallet context powered by `useUserWallet` (Wagmi `useAccount`/`useBalance`).
- `src/utils/oracle.js` – Deterministic pseudo-random data engine (`generateCompanyValuations`, `initializeOracleState`, `advanceOracleState`, `ORACLE_UPDATE_INTERVAL_MS`).
- `src/wagmi/client.js` – RainbowKit/Wagmi config with buffer polyfill for browser builds.
- `walletSetup.ts` – Minimal Wagmi setup example for environments outside of Vite/React.

## Synthetic Oracle & Data Flow

- `generateCompanyValuations()` is used on Home + Dashboard to emit company metadata, target prices, categories, timestamps, and composite scores on a configurable cadence (`ORACLE_UPDATE_INTERVAL_MS`, default 15 min).
- `initializeOracleState()` + `advanceOracleState()` feed the Trade view with rolling price/volume history and sparkline-ready arrays. The helper also fabricates orderbooks and volume metrics so the UI feels “live.”
- All pricing bands, baseline telemetry, and jitter parameters live in `PRICE_BANDS`, `DEFAULT_BASELINES`, and the `INTERNAL_SCHEMA` / `EXTERNAL_SCHEMA` arrays inside `src/utils/oracle.js`. Tweak these to support more tickers or different market personalities.

Because the oracle code caches scrape attempts and expects `fetch`, you can progressively replace simulated data with real APIs (Crunchbase, Alpha Vantage, etc.)—the scaffolding for caching, debouncing, and env lookups already exists.

## Farcaster MiniApp Notes

- The app calls `sdk.isInMiniApp()` before `sdk.actions.ready()`. When running outside of Warpcast it simply logs a warning and continues, so local development is frictionless.
- When packaging for Warpcast, ensure you host the `dist/` output over HTTPS and register the URL in your frame/miniapp config.
- If you need MiniApp actions (notifications, storage, etc.), extend `src/App.jsx` once `sdk.actions.ready()` resolves—the `WalletProvider` and router already sit inside that boundary.

## Extending the Experience

- Add more issuers by appending to `COMPANY_METADATA` and `PRICE_BANDS`, then surface them inside `Trade.jsx`.
- Replace `orderbook` generation with on-chain reads or API calls; the current helper lives in `Trade.jsx`.
- Wire actual execution flows by swapping the final CTA in the trade ticket with Wagmi write hooks or Farcaster actions.

Have fun experimenting, and feel free to repurpose Oracle Trade as a template for other Farcaster-connected, data-intensive experiences.
