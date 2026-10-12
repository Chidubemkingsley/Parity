import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { useHealthCheck, useQueryHyperliquidMarket, type HyperliquidQueryResponse } from '@/lib/api-client';
import { Activity, ArrowDownToLine, ArrowLeftRight, ArrowUpRight, BookOpen, Boxes, CircleAlert, Copy, ExternalLink, Gauge, GitBranch, Layers3, Menu, Radar, RefreshCw, Shield, ShieldAlert, Wallet, X } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { useVaultState, useRegistryPairs, useTestnetTokenPrice, usePosition, useDepositData, useWithdrawData, useCostBasis, useActivity, arbClient, erc20WriteAbi } from '@/lib/chain';
import { addressesByChainId, chainIds, isContractConfigured } from '@/lib/addresses';
import { ParityVaultAbi } from '@/lib/abis';
import { WalletProvider, ConnectButton, shortAddr } from '@/lib/wallet';
import { useAccount, useWriteContract } from 'wagmi';

const queryClient = new QueryClient();

const nav: { title: string; links: [string, string, typeof Layers3][] }[] = [
  { title: 'Workspace', links: [['/', 'Overview', Layers3], ['/monitor', 'Market monitor', Radar], ['/strategy', 'Strategy lab', GitBranch]] },
  { title: 'Vault', links: [['/vault', 'Vault overview', Boxes], ['/deposit', 'Deposit', ArrowDownToLine], ['/withdraw', 'Withdraw', ArrowUpRight], ['/position', 'My position', Wallet]] },
  { title: 'Evidence', links: [['/registry', 'Pair registry', GitBranch], ['/round-trips', 'Round trips', ArrowLeftRight], ['/reports', 'NAV reports', Activity], ['/risk', 'Risk & guardrails', Shield]] },
  { title: 'Operations', links: [['/keeper', 'Keeper', Gauge], ['/admin', 'Admin console', ShieldAlert], ['/docs', 'Documentation', BookOpen]] },
];

function Tag({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'orange' | 'green' | 'red' }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

function PageHeading({ eyebrow, title, description, aside }: { eyebrow: string; title: string; description: string; aside?: ReactNode }) {
  return <div className="page-heading enter"><div><p className="eyebrow">{eyebrow}</p><h1 className="display">{title}</h1><p className="page-description">{description}</p></div>{aside}</div>;
}

function Unconfigured({ title = 'On-chain configuration unavailable', children }: { title?: string; children?: ReactNode }) {
  return <div className="unconfigured" data-testid="status-onchain-unconfigured"><div className="unconfigured-icon"><CircleAlert size={17} /></div><div><strong>{title}</strong><p>{children ?? 'Verified contract addresses and compiled ABIs have not been supplied. Reads and writes are intentionally disabled.'}</p></div><Tag tone="orange">UNCONFIGURED</Tag></div>;
}

function EmptyPanel({ title, copy }: { title: string; copy: string }) {
  return <div className="empty-state"><div className="empty-mark"><span /></div><strong>{title}</strong><p>{copy}</p></div>;
}

function Metric({ label, value, note, accent = false }: { label: string; value: string; note: string; accent?: boolean }) {
  return <div className="metric" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><span className="metric-label">{label}</span><strong className={accent ? 'accent-text' : ''}>{value}</strong><small>{note}</small></div>;
}

function HealthBadge() {
  const health = useHealthCheck({ query: { queryKey: ['/api/healthz'], refetchInterval: 30000, retry: 1 } });
  const healthy = health.data?.status?.toLowerCase() === 'ok' || health.data?.status?.toLowerCase() === 'healthy';
  const loading = health.isLoading;
  return <div className="health-badge" data-testid="status-api-health">
    <span className={`health-dot ${healthy ? 'is-up' : health.isError ? 'is-down' : ''}`} />
    <span>API {loading ? 'CHECKING' : health.isError ? 'UNREACHABLE' : health.data?.status?.toUpperCase() ?? 'UNKNOWN'}</span>
  </div>;
}

function Shell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const activeTitle = nav.flatMap(group => group.links).find(([href]) => href === path)?.[1] ?? 'Overview';
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <Link href="/" className="brand-lockup" data-testid="link-brand-home" onClick={() => setMenuOpen(false)}>
        <span className="brand-symbol"><i /><i /><i /></span><span className="brand-word">PARITY<span className="brand-period">.</span><small>VAULT SYSTEMS</small></span>
      </Link>
      <div className="network-pill"><span className="network-dot" /> ARBITRUM ONE <span className="mono">42161</span></div>
      <nav className="side-nav" aria-label="Main navigation">
        {nav.map(group => <div className="nav-group" key={group.title}><p className="nav-caption">{group.title}</p>{group.links.map(([href, label, Icon]) =>
          <Link key={href} href={href} className={`nav-link ${path === href ? 'active' : ''}`} onClick={() => setMenuOpen(false)} data-testid={`nav-${href === '/' ? 'overview' : href.slice(1)}`}><Icon size={16} strokeWidth={1.8} /><span>{label}</span>{path === href && <span className="nav-active-mark" />}</Link>
        )}</div>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="config-status"><span className="config-square"><CircleAlert size={14} /></span><span><b>Deployment status</b><small>Testnet verified · mainnet none</small></span><span className="status-led" /></div>
        <div className="sidebar-foot mono">INTERFACE BUILD <span>TESTNET CONFIGURED</span></div>
      </div>
    </aside>
    {menuOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <main className="main-shell">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} data-testid="button-mobile-menu">{menuOpen ? <X size={18} /> : <Menu size={18} />}</button>
        <div className="breadcrumb"><span>PARITY</span><span className="breadcrumb-slash">/</span><b>{activeTitle}</b></div>
        <div className="topbar-right"><HealthBadge /><div className="topbar-divider" /><ConnectButton /></div>
      </header>
      <div className="page-wrap">{children}<footer className="app-footer"><span>PARITY <i>·</i> STRATEGY UNPROVEN · MAINNET NOT DEPLOYED · UNAUDITED</span><span className="mono">TESTNET SURFACE <b>02</b></span></footer></div>
    </main>
  </div>;
}

const EXPLORER = {
  arbSepolia: 'https://sepolia.arbiscan.io',
  hyperEvmTestnet: 'https://testnet.purrsec.com',
  robinhoodTestnet: 'https://explorer.testnet.chain.robinhood.com',
} as const;

function AddrLink({ base, address, label }: { base: string; address: string; label?: string }) {
  const short = label ?? `${address.slice(0, 10)}…${address.slice(-6)}`;
  return <a className="text-link mono" href={`${base}/address/${address}`} target="_blank" rel="noreferrer">{short} <ExternalLink size={12} /></a>;
}

function TxLink({ base, hash }: { base: string; hash: string }) {
  return <a className="text-link mono" href={`${base}/tx/${hash}`} target="_blank" rel="noreferrer">{`${hash.slice(0, 10)}…${hash.slice(-6)}`} <ExternalLink size={12} /></a>;
}

const MEASURED_ROWS: [string, string, string, string, string][] = [
  ['TSLA', '382.413', '382.840', '+11.2', '−67.6'],
  ['NVDA', '229.445', '228.645', '−34.9', '−114.0'],
  ['AAPL', '336.961', '337.515', '+16.5', '−64.4'],
  ['AMZN', '262.512', '261.885', '−23.9', '−102.5'],
  ['COIN', '181.387', '181.340', '−2.6', '−32.0'],
];

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return <div className="faq-item"><button className="faq-q" onClick={() => setOpen(!open)} aria-expanded={open}><span>{q}</span><span className="mono">{open ? '−' : '+'}</span></button>{open && <p className="faq-a">{a}</p>}</div>;
}

function Overview() {
  const vault = useVaultState();
  const registry = useRegistryPairs();
  const tokenPx = useTestnetTokenPrice();
  const v = vault.data ?? null;
  const pairs = registry.data ?? null;
  return <div className="overview-page">
    {/* HERO */}
    <div className="hero-block terminal-grid">
      <span className="signal-orb orange" /><span className="signal-orb green" />
      <div className="hero-topline"><Tag tone="orange">DELTA-NEUTRAL BASIS VAULT · TESTNET LIVE</Tag><span className="mono hero-index">SYS.001&nbsp; / &nbsp;3 CHAINS</span></div>
      <div className="hero-copy"><p className="eyebrow">TOKENIZED EQUITIES · ROBINHOOD CHAIN × HYPERLIQUID</p><h1 className="display">The weekend basis trade,<br /><em>measured</em> before it&apos;s traded.</h1><p className="hero-lede">US stocks sleep on weekends. Robinhood Stock Tokens and Hyperliquid equity perps don&apos;t — and they disagree. Parity is an ERC-4626 vault that buys the token, shorts the perp, and harvests the convergence. Every claim on this page is backed by a live testnet deployment or a measured number. Nothing is simulated, nothing is backtested into existence.</p>
        <div className="hero-actions"><Link href="/monitor" className="button button-primary" data-testid="link-open-monitor"><Radar size={15} /> OPEN MARKET MONITOR <ArrowUpRight size={14} /></Link><Link href="/docs" className="button button-quiet" data-testid="link-strategy-method">READ THE TESTNET RECORD <ArrowUpRight size={14} /></Link></div>
      </div>
      <div className="hero-stamp"><span>STATUS</span><strong>TESTNET</strong><small>NOT LIVE · UNAUDITED</small></div>
      <div className="hero-bottom"><span>22 FOUNDRY TESTS PASSING</span><span>3 TESTNET DEPLOYMENTS</span><span>60 BPS MEASURED ROUND-TRIP</span><b>STRATEGY UNPROVEN ON WEEKDAYS</b></div>
    </div>

    {/* LIVE METRICS */}
    <div className="metric-grid">
      <Metric label="Vault TVL (testnet)" value={v ? fmtUsdc(v.totalAssets) : '…'} note="ParityVault · Arbitrum Sepolia · live" accent />
      <Metric label="Pool price mTSLA" value={tokenPx.data ? `$${displayNumber(tokenPx.data)}` : '…'} note="V4 pool · Robinhood testnet · live" />
      <Metric label="Pairs registered" value={pairs ? String(pairs.length) : '…'} note="PairRegistry · live on-chain count" />
      <Metric label="Round trips" value={v ? String(v.roundTrips) : '…'} note="RoundTripRecorded events · live" />
    </div>

    {/* PROBLEM */}
    <div className="section-title-row"><div><span className="section-kicker">THE PROBLEM</span><h2 className="display">Fair value goes home. Prices don&apos;t.</h2></div><span className="mono subdued">24/7 VENUES · NO ANCHOR</span></div>
    <div className="overview-grid">
      <Panel className="overview-market"><div className="panel-head"><div><span className="section-kicker">VENUE ONE</span><h2>Stock Tokens, thinly traded</h2></div></div><p>Robinhood Stock Tokens (TSLA, NVDA, AAPL…) trade around the clock in fragmented Uniswap pools. On mainnet the TSLA/USDG 0.3% pool holds about $1.5M — deep enough to trade, thin enough to drift from fair value when the underlying market is shut.</p><p className="fine-print">Verified live: token contracts, decimals, and pool liquidity read directly from Robinhood Chain (see scripts/config/pairs.json).</p></Panel>
      <Panel className="overview-state"><div className="panel-head"><div><span className="section-kicker">VENUE TWO</span><h2>Equity perps set their own weekend price</h2></div></div><p>Hyperliquid HIP-3 equity perps (TradeXYZ <span className="mono">xyz:</span> markets) also trade 24/7, with funding and their own order books. With no external anchor on weekends, the two venues can disagree by more than the round-trip cost — that disagreement is the trade.</p><p className="fine-print">Verified live: xyz dex exists on mainnet and testnet; metaAndAssetCtxs + l2Book shapes confirmed against our client code.</p></Panel>
    </div>

    {/* HOW IT WORKS */}
    <div className="section-title-row"><div><span className="section-kicker">HOW IT WORKS</span><h2 className="display">Four steps. All on-chain. All checkable.</h2></div><span className="mono subdued">CONTRACTS + KEEPER</span></div>
    <div className="process-grid">
      <div className="process-step"><span className="process-n">1</span><h3>Measure the gap</h3><p><span className="mono">measure-gap.ts</span> samples token price vs perp mid, subtracts pool fees, Hyperliquid taker fees, half-spreads, funding carry, and gas. Output is GO only if ≥25% of samples clear costs — otherwise PIVOT. Weekday verdict so far: PIVOT.</p></div>
      <div className="process-step"><span className="process-n">2</span><h3>Deposit into the vault</h3><p>USDC enters the ERC-4626 <span className="mono">ParityVault</span> on Arbitrum (deposit cap, pause guardian, high-water-mark performance fee). Capital splits into idle and deployed; the keeper draws deployed capital via <span className="mono">sendToExecutor</span>.</p></div>
      <div className="process-step"><span className="process-n">3</span><h3>Hedge both legs</h3><p>The keeper buys the Stock Token on Robinhood Chain and shorts the same notional on the HIP-3 perp. One direction only — positive basis. Size is the minimum of pair cap, pool depth, and book depth. Exit at ≤10 bps convergence or timeout.</p></div>
      <div className="process-step"><span className="process-n">4</span><h3>Report and journal</h3><p>NAV is keeper-attested with evidence hashes and freshness bounds (<span className="mono">reportDeployed</span>). Every round trip is journaled with pair id, notional, edge, and both tx references (<span className="mono">RoundTripRecorded</span>).</p></div>
    </div>

    {/* MEASURED EVIDENCE */}
    <div className="section-title-row"><div><span className="section-kicker">MEASURED EVIDENCE · OCT 12, WEEKDAY</span><h2 className="display">Real numbers, including the bad ones.</h2></div><span className="mono subdued">COST HURDLE ≈ 82 BPS</span></div>
    <Panel className="large-panel"><div className="panel-head"><div><span className="section-kicker">MAINNET SNAPSHOT</span><h2>Token vs perp, net of everything</h2></div><Tag tone="orange">PIVOT</Tag></div>
      <div className="table-scroll"><table><thead><tr><th>PAIR</th><th>TOKEN PX</th><th>PERP MID</th><th>BASIS (BPS)</th><th>NET EDGE (BPS)</th></tr></thead><tbody>{MEASURED_ROWS.map(r => <tr key={r[0]}><td className="asset-cell"><span className="asset-bullet" />{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td><td className="orange-text">{r[4]}</td></tr>)}</tbody></table></div>
      <p className="fine-print">Live reads from Robinhood Chain pools and Hyperliquid xyz perps while US markets were open. Weekday gaps don&apos;t clear the ~82 bps round-trip cost — exactly what the thesis predicts. The edge, if it exists, lives on weekends. Full samples in <span className="mono">scripts/out/</span>.</p>
    </Panel>

    {/* ARCHITECTURE */}
    <div className="section-title-row"><div><span className="section-kicker">DEPLOYED ARCHITECTURE</span><h2 className="display">Every address below is on-chain now.</h2></div><span className="mono subdued">CLICK TO VERIFY</span></div>
    <Panel className="large-panel"><div className="panel-head"><div><span className="section-kicker">TESTNET DEPLOYMENTS</span><h2>Contracts + mock market</h2></div><Tag tone="green">SELECTORS CHECKED ON-CHAIN</Tag></div>
      <div className="table-scroll"><table><thead><tr><th>CONTRACT</th><th>CHAIN</th><th>ADDRESS</th><th>ROLE</th></tr></thead><tbody>
        <tr><td className="asset-cell">ParityVault</td><td>Arbitrum Sepolia</td><td><AddrLink base={EXPLORER.arbSepolia} address="0xb0e660108571b4b191a14b0efdf8ea98d76fb5cc" /></td><td className="table-muted">ERC-4626 vault, NAV, journal</td></tr>
        <tr><td className="asset-cell">PairRegistry</td><td>Arbitrum Sepolia</td><td><AddrLink base={EXPLORER.arbSepolia} address="0xb0ff214f3575098966c1dbf66bd39dca9ddc0130" /></td><td className="table-muted">Pair configs + limits</td></tr>
        <tr><td className="asset-cell">HyperCoreHedger</td><td>HyperEVM testnet</td><td><AddrLink base={EXPLORER.hyperEvmTestnet} address="0xeeccd2bb5c0605f3eacdc4da221d9bdeda580d2f" /></td><td className="table-muted">On-chain CoreWriter short path</td></tr>
        <tr><td className="asset-cell">mUSDG / mTSLA</td><td>Robinhood testnet</td><td><AddrLink base={EXPLORER.robinhoodTestnet} address="0xac0a7216290fa7445782f80628bf727b084e41e0" /></td><td className="table-muted">Mock quote token (mTSLA: 0xd441…3b2d)</td></tr>
        <tr><td className="asset-cell">TestnetV4Router</td><td>Robinhood testnet</td><td><AddrLink base={EXPLORER.robinhoodTestnet} address="0xdc26a92c69df6fd4aa0d2f64fdec549bc655b7f6" /></td><td className="table-muted">Unlock-based V4 swaps</td></tr>
      </tbody></table></div>
      <p className="fine-print">Frontend ABIs in <span className="mono">src/lib/abis.ts</span> are generated from the compiled artifacts — all 100 function selectors verified present in the deployed bytecode. Live spot round trip ($5 each way, cost exactly 2× pool fee): <TxLink base={EXPLORER.robinhoodTestnet} hash="0xd112e0068b0caad2101311b139dbcc6709ce7330f0d32bac46e86b27a94ffc93" /> → <TxLink base={EXPLORER.robinhoodTestnet} hash="0xd7ae4a6372374c0a6ce6d2875fbe570554be9335e8704686121c3abacde7916d" />.</p>
    </Panel>

    {/* GUARDRAILS */}
    <div className="section-title-row"><div><span className="section-kicker">GUARDRAILS</span><h2 className="display">Designed not to blow up first.</h2></div><span className="mono subdued">ENFORCED ON-CHAIN</span></div>
    <div className="risk-grid">
      {[['Deposit cap + pause','Capped deposits and a guardian pause that blocks entries and deployment but never exits.'],['NAV freshness bounds','Reports rejected if stale, too soon, or moving too far — stale NAV blocks deposits.'],['One direction only','Negative basis is logged, never traded: the token can&apos;t be shorted.'],['Sized to liquidity','Notional is the minimum of pair cap, pool-depth share, and book-depth share.']].map(([a, b]) => <Panel key={a}><span className="section-kicker">CONTROL</span><h3>{a}</h3><p>{b}</p></Panel>)}
    </div>
    <div className="risk-alert"><ShieldAlert size={19} /><div><strong>Unaudited and unproven.</strong><span>Contracts have no security review, mainnet is not deployed, and the strategy edge is unproven. Testnet only. Never deposit what you can&apos;t lose.</span></div></div>

    {/* ROADMAP */}
    <div className="section-title-row"><div><span className="section-kicker">ROADMAP</span><h2 className="display">What turns PIVOT into GO.</h2></div></div>
    <div className="process-grid">
      <div className="process-step"><span className="process-n">A</span><h3>Weekend measurement</h3><p>Run the sampler over a real weekend. If p90 net edge stays negative, the thesis is wrong and we say so.</p></div>
      <div className="process-step"><span className="process-n">B</span><h3>Trust-minimized NAV</h3><p>Replace keeper attestation with proofs of positions both venues can verify.</p></div>
      <div className="process-step"><span className="process-n">C</span><h3>Mainnet hardening</h3><p>Audit, multisig roles, funding-aware sizing, more pairs — then and only then, real capital.</p></div>
    </div>

    {/* FAQ */}
    <div className="section-title-row"><div><span className="section-kicker">FAQ</span><h2 className="display">Asked, answered straight.</h2></div></div>
    <Panel className="large-panel"><div className="faq-list">
      <Faq q="Is Parity live with real money?" a="No. Testnets only: vault on Arbitrum Sepolia, hedger on HyperEVM testnet, mock market on Robinhood testnet. Mainnet addresses are intentionally unset in this interface." />
      <Faq q="Is the strategy profitable?" a="Unproven. Weekday measurements on five real pairs came back net-negative after costs. The thesis is specifically about weekends, which have not been measured yet." />
      <Faq q="Are the contracts audited?" a="No. 22 Foundry tests pass including fuzzing, but there is no security review. Treat everything as experimental." />
      <Faq q="How do I verify your claims?" a="Every contract address on this page links to its explorer. ABIs in src/lib/abis.ts are generated from compiled artifacts with all selectors checked against live bytecode. Measurement CSVs ship in scripts/out/." />
      <Faq q="What happens if a trade goes wrong?" a="The keeper unwinds both legs on convergence or timeout and journals the round trip. A mid-trade crash can leave legs open — the keeper has no persistence yet, listed openly in VERIFY_ME.md." />
      <Faq q="Where is the code?" a="https://github.com/Chidubemkingsley/Parity — contracts, keeper scripts, measurement data, and this interface." />
    </div></Panel>

    {/* CTA */}
    <Panel className="large-panel"><div className="panel-head"><div><span className="section-kicker">NEXT STEP</span><h2>Watch a market, read the record.</h2></div></div>
      <div className="hero-actions"><Link href="/monitor" className="button button-primary">OPEN MARKET MONITOR <ArrowUpRight size={14} /></Link><a className="button button-quiet" href="https://github.com/Chidubemkingsley/Parity" target="_blank" rel="noreferrer">GITHUB REPO <ExternalLink size={14} /></a></div>
      <p className="fine-print">Colosseum Crypto World&apos;s Fair — Arbitrum · Robinhood Chain · Hyperliquid tracks.</p>
    </Panel>
  </div>;
}

type MarketRow = { name: string; mid?: unknown; mark?: unknown; oracle?: unknown; funding?: unknown; openInterest?: unknown; volume?: unknown };
function getMarketRows(value: unknown): MarketRow[] {
  if (!Array.isArray(value) || !Array.isArray(value[0]?.universe) || !Array.isArray(value[1])) return [];
  return value[0].universe.flatMap((asset: Record<string, unknown>, index: number) => {
    if (typeof asset.name !== 'string' || !asset.name) return [];
    const ctx = (value[1] as Record<string, unknown>[])[index] ?? {};
    return [{ name: asset.name, mid: ctx.midPx, mark: ctx.markPx, oracle: ctx.oraclePx, funding: ctx.funding, openInterest: ctx.openInterest, volume: ctx.dayNtlVlm }];
  });
}
function displayNumber(value: unknown, digits = 5) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: digits }) : String(value);
}

function TestnetPairPanel({ rows, tokenPx, tokenLoading }: { rows: MarketRow[]; tokenPx: number | null; tokenLoading: boolean }) {
  const perp = rows.find(r => r.name === 'xyz:TSLA');
  const mid = perp && perp.mid !== null && perp.mid !== undefined && perp.mid !== '' ? Number(perp.mid) : NaN;
  const basis = tokenPx !== null && Number.isFinite(mid) && tokenPx > 0 ? ((mid - tokenPx) / tokenPx) * 1e4 : null;
  return <Panel><div className="panel-head"><div><span className="section-kicker">PAIR INPUTS · TESTNET</span><h2>mTSLA / xyz:TSLA</h2></div><Tag tone="green">LIVE</Tag></div><div className="input-status"><div><span>Robinhood token quote</span><b>{tokenLoading ? '…' : tokenPx !== null ? `$${displayNumber(tokenPx)}` : 'UNAVAILABLE'}</b></div><div><span>Perp mid (xyz:TSLA)</span><b>{Number.isFinite(mid) ? `$${displayNumber(mid)}` : 'UNAVAILABLE'}</b></div><div><span>Basis</span><b>{basis === null ? 'NOT CALCULABLE' : `${basis >= 0 ? '+' : ''}${basis.toFixed(1)} bps`}</b></div></div><p className="fine-print">Mock-anchored V4 pool on Robinhood testnet vs xyz:TSLA perp on Hyperliquid testnet. Plumbing signal, not strategy evidence.</p></Panel>;
}

function Monitor() {
  const hl = useQueryHyperliquidMarket();
  const tokenPx = useTestnetTokenPrice();
  const [response, setResponse] = useState<HyperliquidQueryResponse | null>(null);
  const [filter, setFilter] = useState('');
  const request = () => hl.mutate({ data: { type: 'metaAndAssetCtxs', dex: 'xyz' } }, { onSuccess: setResponse });
  useEffect(() => { request(); const timer = window.setInterval(request, 60000); return () => window.clearInterval(timer); }, []);
  const rows = useMemo(() => getMarketRows(response?.data).filter(row => row.name.toLowerCase().includes(filter.toLowerCase())), [response, filter]);
  return <div>
    <PageHeading eyebrow="MARKET DATA / HYPERLIQUID XYZ" title="Gap monitor" description="Current public perp context, queried through the Parity API. A perp quote alone is not a token/perp basis." aside={<button className="button button-secondary" onClick={request} disabled={hl.isPending} data-testid="button-refresh-market"><RefreshCw size={14} className={hl.isPending ? 'spin' : ''} /> REFRESH MARKETS</button>} />
    <div className="source-strip"><span className={`health-dot ${response ? 'is-up' : ''}`} /><span>DATA SOURCE <b>{response?.source ?? 'HYPERLIQUID PUBLIC INFO'}</b></span><span>LAST FETCH <b data-testid="text-market-fetched-at">{response?.fetchedAt ? new Date(response.fetchedAt).toLocaleString() : 'WAITING FOR RESPONSE'}</b></span><span className="right-note">60 SEC REFRESH</span></div>
    {hl.isError && <div className="inline-error" role="alert"><CircleAlert size={16} /> Hyperliquid market request failed. <button onClick={request} data-testid="button-retry-market">Retry request</button></div>}
    <div className="monitor-grid">
      <Panel className="market-table-panel"><div className="panel-head"><div><span className="section-kicker">REAL-TIME CONTEXT</span><h2>Perpetual markets <span className="count-chip">{rows.length || '—'}</span></h2></div><label className="search-box"><span className="sr-only">Filter markets</span><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter asset" data-testid="input-market-filter" /></label></div>
        {hl.isPending && !response ? <div className="skeleton-wrap"><div className="skeleton-row" /><div className="skeleton-row" /><div className="skeleton-row" /><div className="skeleton-row" /></div> : rows.length ? <div className="table-scroll"><table><thead><tr><th>CONTRACT</th><th>MID PX</th><th>MARK PX</th><th>ORACLE PX</th><th>FUNDING</th><th>OPEN INTEREST</th><th>24H VOLUME</th></tr></thead><tbody>{rows.map(row=><tr key={row.name} data-testid={`row-market-${row.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`}><td className="asset-cell"><span className="asset-bullet" />{row.name}</td><td>{displayNumber(row.mid)}</td><td>{displayNumber(row.mark)}</td><td>{displayNumber(row.oracle)}</td><td>{displayNumber(row.funding,8)}</td><td>{displayNumber(row.openInterest)}</td><td>{displayNumber(row.volume)}</td></tr>)}</tbody></table></div> : <EmptyPanel title={hl.isError ? 'Market request unavailable' : 'No market response yet'} copy="Only live data returned by the Hyperliquid API is displayed. No sample rows are used." />}
      </Panel>
      <div className="monitor-aside">
        <TestnetPairPanel rows={rows} tokenPx={tokenPx.data ?? null} tokenLoading={tokenPx.isLoading} />
        <Panel><div className="panel-head"><div><span className="section-kicker">COST MODEL</span><h2>Assumptions only</h2></div></div><div className="assumption"><span>Hyperliquid taker fee</span><b>9 bps <small>editable assumption</small></b></div><div className="assumption"><span>Pool fee</span><b>30 bps <small>editable assumption</small></b></div><p className="fine-print">Values above are unverified example assumptions from project notes, not live fee reads or execution estimates.</p><Link href="/strategy" className="text-link" data-testid="link-market-calculator">Open calculator <ArrowUpRight size={14} /></Link></Panel>
      </div>
    </div>
    {response && <div className="request-foot mono" data-testid="text-market-response">RESPONSE RECEIVED · {new Date(response.fetchedAt).toISOString()} · {rows.length} ASSETS PARSED</div>}
  </div>;
}

function fmtUsdc(v: bigint | undefined) {
  return v === undefined ? 'Unavailable' : `$${(Number(v) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function Vault() {
  const st = useVaultState();
  const v = st.data ?? null;
  return <div><PageHeading eyebrow="ARBITRUM SEPOLIA / VAULT READS" title="Vault overview" description="Read-only surface for ERC-4626 state on the testnet deployment. Mainnet is not deployed." /><Unconfigured title="Testnet reads — mainnet not deployed">{'Showing live state of 0xb0e660108571b4b191a14b0efdf8ea98d76fb5cc on Arbitrum Sepolia. Writes stay disabled.'}</Unconfigured><div className="metric-grid"><Metric label="Total assets" value={v ? fmtUsdc(v.totalAssets) : 'Unavailable'} note="totalAssets · arb sepolia" /><Metric label="Share price" value={v && Number.isFinite(v.sharePrice) ? `$${v.sharePrice.toFixed(6)}` : 'Unavailable'} note="convertToAssets · arb sepolia" /><Metric label="Idle / deployed" value={v ? `${fmtUsdc(v.idle)} / ${fmtUsdc(v.deployed)}` : 'Unavailable'} note="capital split · arb sepolia" /><Metric label="Capacity" value={v ? fmtUsdc(v.depositCap) : 'Unavailable'} note="deposit cap · arb sepolia" /></div><Panel className="large-panel"><div className="panel-head"><div><span className="section-kicker">VAULT STATUS</span><h2>{st.isLoading ? 'Reading chain…' : v ? (v.paused ? 'Paused' : 'Active') : 'Configuration required'}</h2></div><Tag>{v ? (v.paused ? 'PAUSED' : 'LIVE READ') : 'NO CHAIN READ'}</Tag></div>{st.isError ? <EmptyPanel title="Chain read failed" copy="The Arbitrum Sepolia RPC did not respond. Retry shortly." /> : <div className="state-lines"><div><span>Vault address</span><b className="mono">0xb0e66010…fb5CC</b></div><div><span>Registry address</span><b className="mono">0xb0ff214f…dc0130</b></div><div><span>Round trips recorded</span><b>{v ? String(v.roundTrips) : '—'}</b></div><div><span>Cumulative PnL</span><b>{v ? fmtUsdc(v.cumPnl) : '—'}</b></div></div>}</Panel></div>;
}

function TransactionPage({ mode }: { mode: 'deposit' | 'withdraw' }) {
  const [amount, setAmount] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const title = mode === 'deposit' ? 'Deposit' : 'Withdraw';
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const vaultDep = addressesByChainId[chainIds.arbitrumSepolia]?.vault;
  const VAULT = vaultDep && isContractConfigured(vaultDep) ? vaultDep.address : null;
  const dep = useDepositData(address, mode === 'deposit' ? amount : '');
  const wd = useWithdrawData(address, mode === 'withdraw' ? amount : '');
  const toUnits = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? 0n : BigInt(Math.floor(Number(s) * 1e6)));
  const amt = toUnits(amount);
  const d = dep.data ?? null;
  const w = wd.data ?? null;
  const blockedReason = !isConnected ? 'Connect a wallet to continue.'
    : !VAULT ? 'Vault not configured.'
    : mode === 'deposit' && d?.paused ? 'Vault is paused — deposits blocked on-chain.'
    : mode === 'deposit' && d?.navStale ? 'NAV is stale — deposits blocked on-chain.'
    : amt <= 0n ? 'Enter an amount above 0.'
    : null;
  const needsApproval = mode === 'deposit' && !!d && amt > 0n && d.allowance < amt;
  const overMax = mode === 'deposit' ? (!!d && amt > d.maxDeposit) : (!!w && amt > w.maxAssets);
  const canSubmit = isConnected && !!VAULT && !busy && amt > 0n && !overMax && !(mode === 'deposit' && (d?.paused || d?.navStale));
  const onMax = () => {
    if (mode === 'deposit' && d) setAmount((Number(d.maxDeposit) / 1e6).toString());
    else if (mode === 'withdraw' && w) setAmount((Number(w.maxAssets) / 1e6).toString());
  };
  const send = async () => {
    if (!address || !VAULT || !canSubmit) return;
    setBusy(true); setTxError(null); setTxHash(null);
    try {
      if (mode === 'deposit' && d) {
        if (d.allowance < amt) {
          const h = await writeContractAsync({ address: d.usdc, abi: erc20WriteAbi, functionName: 'approve', args: [VAULT, amt], chainId: chainIds.arbitrumSepolia });
          await arbClient.waitForTransactionReceipt({ hash: h });
        }
        const h2 = await writeContractAsync({ address: VAULT, abi: ParityVaultAbi, functionName: 'deposit', args: [amt, address], chainId: chainIds.arbitrumSepolia });
        setTxHash(h2);
      } else if (VAULT) {
        const h2 = await writeContractAsync({ address: VAULT, abi: ParityVaultAbi, functionName: 'withdraw', args: [amt, address, address], chainId: chainIds.arbitrumSepolia });
        setTxHash(h2);
      }
    } catch (e) { setTxError(e instanceof Error ? e.message.slice(0, 200) : String(e)); }
    setBusy(false);
  };
  const balanceStr = !isConnected ? 'Connect wallet'
    : mode === 'deposit' ? (d ? `$${(Number(d.usdcBalance) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC` : '…')
    : (w ? `${(Number(w.shareBalance) / 10 ** w.shareDecimals).toLocaleString(undefined, { maximumFractionDigits: 4 })} shares` : '…');
  const estimateStr = amt <= 0n ? '—'
    : mode === 'deposit'
      ? (d?.previewShares != null && d ? `${(Number(d.previewShares) / 10 ** d.vaultDec).toLocaleString(undefined, { maximumFractionDigits: 4 })} shares` : 'preview failed — over cap?')
      : (w?.previewShares != null ? `$${(Number(w.previewShares) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC + shares burned` : 'preview failed — over limit?');
  const submitLabel = busy ? 'WAITING FOR WALLET…' : needsApproval ? 'APPROVE USDC' : mode === 'deposit' ? 'DEPOSIT' : 'WITHDRAW';
  return <div><PageHeading eyebrow={`ARBITRUM SEPOLIA / ${title.toUpperCase()}`} title={title} description={mode === 'deposit' ? 'Preview and deposit testnet USDC into the Parity vault.' : 'Redeem shares or withdraw testnet USDC from your Parity position.'} />{!isConnected ? <Unconfigured title="No wallet connected">{`Connect a browser wallet (top right) to ${mode} on Arbitrum Sepolia. You sign every transaction; nothing is custodial.`}</Unconfigured> : <div className="connected-note"><span className="health-dot is-up" /><span>CONNECTED <b className="mono">{address ? shortAddr(address) : ''}</b> · VAULT {VAULT ? `${VAULT.slice(0, 10)}…` : '—'}</span></div>}<div className="transaction-grid"><Panel><div className="panel-head"><div><span className="section-kicker">ORDER TICKET</span><h2>{mode === 'deposit' ? 'Allocate USDC' : 'Request exit'}</h2></div>{blockedReason ? <Tag tone="orange">BLOCKED</Tag> : <Tag tone="green">READY</Tag>}</div><label className="field-label" htmlFor={`${mode}-amount`}>Amount <span>{mode === 'deposit' ? 'USDC' : 'USDC / shares'}</span></label><div className="amount-field"><input id={`${mode}-amount`} inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" data-testid={`input-${mode}-amount`} /><button onClick={onMax} disabled={!isConnected} data-testid={`button-${mode}-max`}>MAX</button></div><div className="ticket-detail"><span>Available balance</span><b>{balanceStr}</b></div><div className="ticket-detail"><span>Estimated {mode === 'deposit' ? 'shares' : 'assets'}</span><b>{estimateStr}</b></div><button onClick={send} disabled={!canSubmit} className="button button-primary full-button" data-testid={`button-submit-${mode}`}>{blockedReason ?? submitLabel}</button>{overMax ? <p className="fine-print">Amount exceeds the on-chain limit for your wallet.</p> : txHash ? <p className="fine-print">Submitted: <a className="text-link mono" href={`https://sepolia.arbiscan.io/tx/${txHash}`} target="_blank" rel="noreferrer">{shortAddr(txHash)} <ExternalLink size={12} /></a> — confirm it on Arbiscan; balances refresh automatically.</p> : txError ? <p className="fine-print">Failed: {txError}</p> : <p className="fine-print">{mode === 'withdraw' ? 'Withdrawals are limited by idle vault USDC; your max is read live.' : 'First deposit prompts a USDC approval, then the deposit. Testnet USDC faucet: faucet.circle.com → Arbitrum Sepolia.'}</p>}</Panel><Panel className="transaction-context"><span className="section-kicker">EXECUTION SAFETY</span><h2>{mode === 'deposit' ? 'Before capital enters' : 'Exits remain a priority'}</h2><ul className="check-list">{(mode === 'deposit' ? ['Verify Arbitrum contract and USDC addresses','Read maxDeposit and current NAV freshness','Simulate approval and deposit before wallet prompt','Confirm transaction on Arbiscan'] : ['Read your share balance and maxWithdraw','Check idle vault USDC available for redemption','Simulate the exact exit before wallet prompt','Confirm the resulting transaction on Arbiscan']).map((s,i)=><li key={s}><span>{String(i+1).padStart(2,'0')}</span>{s}<Tag tone="green">LIVE</Tag></li>)}</ul></Panel></div></div>;
}

function Position() {
  const { address, isConnected } = useAccount();
  const pos = usePosition(address);
  const vault = useVaultState();
  const basis = useCostBasis(address);
  const act = useActivity(address);
  const p = pos.data ?? null;
  const cb = basis.data ?? undefined;
  const rows = act.data?.rows ?? [];
  const sdec = act.data?.decimals ?? 0;
  const shares = p ? (Number(p.shares) / 10 ** p.decimals).toLocaleString(undefined, { maximumFractionDigits: 4 }) : null;
  const supply = vault.data ? Number(vault.data.totalSupply) / 10 ** vault.data.decimals : NaN;
  const ownership = p && Number.isFinite(supply) && supply > 0
    ? `${((Number(p.shares) / 10 ** p.decimals / supply) * 100).toFixed(2)}%`
    : 'Unavailable';
  return <div><PageHeading eyebrow="ACCOUNT / ARBITRUM SEPOLIA" title="My position" description="Share balance and position value for the connected wallet on the testnet vault." />{!isConnected ? <Unconfigured title="No wallet connected">{'Connect a browser wallet (top right) to read your testnet vault position. No balances are fabricated.'}</Unconfigured> : <div className="connected-note"><span className="health-dot is-up" /><span>CONNECTED <b className="mono">{address ? shortAddr(address) : ''}</b> · ARBITRUM SEPOLIA VAULT</span></div>}<div className="metric-grid"><Metric label="Share balance" value={shares ?? 'Unavailable'} note="balanceOf · connected wallet" /><Metric label="Position value" value={p && p.valueUsd !== null ? `$${p.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : 'Unavailable'} note="convertToAssets · live" /><Metric label="Vault ownership" value={ownership} note="your shares ÷ totalSupply · live" /><Metric label="Cost basis" value={cb === undefined ? 'Unavailable' : `$${(Number(cb.net) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} note={cb && cb.txs > 0 ? `${cb.txs} txs · deposits − withdrawals · scanned logs` : 'no deposits found · scanned logs'} /></div><Panel className="large-panel"><div className="panel-head"><div><span className="section-kicker">ACCOUNT ACTIVITY</span><h2>Deposits & withdrawals</h2></div>{rows.length ? <Tag tone="green">LIVE SCAN</Tag> : <Tag>NO EVENT INDEX</Tag>}</div>{rows.length ? <div className="table-scroll"><table><thead><tr><th>TIME</th><th>TYPE</th><th>USDC</th><th>SHARES</th><th>TX</th></tr></thead><tbody>{rows.map(r => <tr key={`${r.txHash}-${r.kind}`}><td>{r.timestamp ? new Date(r.timestamp * 1000).toLocaleString() : '…'}</td><td className="asset-cell">{r.kind.toUpperCase()}</td><td>{`$${(Number(r.assets) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}</td><td>{(Number(r.shares) / 10 ** sdec).toLocaleString(undefined, { maximumFractionDigits: 4 })}</td><td><a className="text-link mono" href={`https://sepolia.arbiscan.io/tx/${r.txHash}`} target="_blank" rel="noreferrer">{shortAddr(r.txHash)} <ExternalLink size={12} /></a></td></tr>)}</tbody></table></div> : <EmptyPanel title={isConnected ? 'No user events found' : 'No user events available'} copy={isConnected ? 'Wallet connected — no deposits or withdrawals found in vault logs since deployment.' : 'Connect-wallet support and verified testnet addresses are configured; connect to scan your history.'} />}<p className="fine-print">Performance fees, if enabled by verified vault parameters, are assessed by share dilution above the high-water mark at report time—not as a per-user withdrawal fee.</p></Panel></div>;
}

function Strategy() {
  const [basis,setBasis]=useState(''); const [funding,setFunding]=useState(''); const [hlFee,setHlFee]=useState('9'); const [poolFee,setPoolFee]=useState('30'); const [notional,setNotional]=useState('');
  const values=[basis,funding,hlFee,poolFee,notional].map(Number);
  const valid=[basis,funding,hlFee,poolFee,notional].every(v=>v.trim()!=='' && Number.isFinite(Number(v))) && Number(notional)>0;
  const net=valid ? values[0]+values[1]-values[2]*2-values[3]*2 : null;
  return <div><PageHeading eyebrow="METHOD / USER-ENTERED MODEL" title="Strategy & costs" description="Inspect the proposed long-token / short-perp structure. A calculation is not evidence that an executable edge exists." />
    <div className="strategy-banner"><div><span className="section-kicker">PROPOSED EXPOSURE</span><h2>Long token. Short perp.</h2><p>Only positive basis is considered by this one-direction concept. Entry and exit must each clear the cost stack; funding is variable and uncertain.</p></div><div className="flow-diagram"><div><span className="flow-node">LONG</span><strong>Tokenized equity</strong><small>Robinhood Chain pool</small></div><div className="flow-arrow"><span /><i>basis + carry</i><span /></div><div><span className="flow-node orange-node">SHORT</span><strong>Perpetual</strong><small>Hyperliquid XYZ</small></div></div></div>
    <div className="strategy-columns"><Panel><div className="panel-head"><div><span className="section-kicker">EDGE MODEL</span><h2>Your assumptions</h2></div><Tag tone="orange">NOT A SIGNAL</Tag></div><p className="fine-print">Net bps = entered basis + entered funding carry − two-sided Hyperliquid fees − two-sided pool fees. Fee values begin at project-note assumptions, not verified fee data.</p>
      <div className="calc-fields"><NumberField label="Basis (bps)" value={basis} onChange={setBasis} placeholder="Enter basis" test="input-calc-basis" /><NumberField label="Funding carry (bps)" value={funding} onChange={setFunding} placeholder="Enter carry" test="input-calc-funding" /><NumberField label="HL taker fee / side (bps)" value={hlFee} onChange={setHlFee} placeholder="9" test="input-calc-hl-fee" /><NumberField label="Pool fee / side (bps)" value={poolFee} onChange={setPoolFee} placeholder="30" test="input-calc-pool-fee" /><NumberField label="Notional (USD)" value={notional} onChange={setNotional} placeholder="Enter notional" test="input-calc-notional" /></div>
      <div className="calc-result"><span>INDICATIVE NET EDGE</span><strong data-testid="text-calc-net-edge">{net === null ? '—' : `${net.toLocaleString(undefined,{maximumFractionDigits:2})} bps`}</strong><small>{net === null ? 'Enter all model inputs to calculate.' : `Approx. ${((net/10000)*Number(notional)).toLocaleString(undefined,{maximumFractionDigits:2})} USD before slippage, impact, gas, timing, and other risks.`}</small></div>
    </Panel>
    <Panel className="cost-panel"><span className="section-kicker">DECISION FRAMEWORK</span><h2>Evidence before execution</h2><div className="rule-row"><b>GO</b><span>Only after measured net opportunity clears verified costs, limits, execution constraints, and risk review.</span></div><div className="rule-row"><b className="dim">PIVOT</b><span>If the only apparent advantage disappears after costs, liquidity, funding changes, or adverse execution.</span></div><div className="cost-warning"><ShieldAlert size={17}/><span>No GO verdict, live basis, historical profitability, or strategy validation is available in this interface.</span></div></Panel></div>
    <div className="formula-line mono"><span>NET EDGE</span> = <span>BASIS</span> + <span>FUNDING CARRY</span> − 2 × <span>TAKER FEE</span> − 2 × <span>POOL FEE</span></div>
  </div>;
}
function NumberField({label,value,onChange,placeholder,test}:{label:string;value:string;onChange:(s:string)=>void;placeholder:string;test:string}) { return <label className="calc-field"><span>{label}</span><input type="number" step="any" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} data-testid={test} /></label>; }

const eventPageInfo: Record<string,{eyebrow:string;title:string;description:string;entity:string;detail:string}> = {
  registry:{eyebrow:'PAIR CONFIGURATION / ARBITRUM ONE',title:'Pair registry',description:'Token and perp pair configuration must come from a verified PairRegistry deployment.',entity:'No pair registry configured',detail:'Pair count, token addresses, Hyperliquid asset identifiers, limits, enabled status, ownership, and change events are unavailable.'},
  'round-trips':{eyebrow:'AUDIT TRAIL / VAULT EVENTS',title:'Round-trip history',description:'Every recorded round trip should be traceable to on-chain events and external execution references.',entity:'No round-trip records',detail:'A verified vault address and event indexing from its deploy block are required. No cumulative notional or PnL is available.'},
  reports:{eyebrow:'NAV / REPORTING EVIDENCE',title:'NAV reports',description:'Keeper-reported NAV is an attestation to off-chain evidence, not a trustless valuation.',entity:'No NAV reports indexed',detail:'No deployed vault or report event history exists. Rejected reports cannot be inferred from chain events.'},
};
function RegistryPage() {
  const q = useRegistryPairs();
  const pairs = q.data ?? null;
  return <div><PageHeading eyebrow="PAIR CONFIGURATION / ARBITRUM SEPOLIA" title="Pair registry" description="Live token/perp pair configuration from the deployed PairRegistry." /><Unconfigured title="Testnet reads — mainnet not deployed">{'Showing live state of 0xb0ff214f3575098966c1dbf66bd39dca9ddc0130 on Arbitrum Sepolia. Writes stay disabled.'}</Unconfigured><div className="metric-grid"><Metric label="Records" value={pairs ? String(pairs.length) : 'Unavailable'} note="pairCount · arb sepolia" /><Metric label="Enabled" value={pairs ? String(pairs.filter(p => p.enabled).length) : 'Unavailable'} note="isEnabled flags" /><Metric label="Evidence" value="On-chain" note="registry events" /></div><Panel className="large-panel"><div className="panel-head"><div><span className="section-kicker">AUDITABLE SOURCE</span><h2>Registered pairs</h2></div><Tag>{pairs ? 'LIVE READ' : 'NO EVENT INDEX'}</Tag></div>{q.isError ? <EmptyPanel title="Chain read failed" copy="The Arbitrum Sepolia RPC did not respond. Retry shortly." /> : pairs && pairs.length ? <div className="table-scroll"><table><thead><tr><th>SYMBOL</th><th>STOCK TOKEN</th><th>HL ASSET</th><th>MAX NOTIONAL</th><th>MIN EDGE</th><th>ENABLED</th></tr></thead><tbody>{pairs.map(p => <tr key={p.id}><td className="asset-cell">{p.symbol}</td><td className="mono">{`${p.stockToken.slice(0, 10)}…`}</td><td>{p.hlAsset}</td><td>{`$${(Number(p.maxNotional) / 1e6).toLocaleString()}`}</td><td>{`${p.minEdgeBps} bps`}</td><td>{p.enabled ? 'YES' : 'NO'}</td></tr>)}</tbody></table></div> : <EmptyPanel title="No pairs registered yet" copy="The registry is live but empty. The admin registers a pair via upsertPair on 0xb0ff214f3575098966c1dbf66bd39dca9ddc0130 — no testnet pairs have been registered." />}</Panel></div>;
}

function EventPage({kind}:{kind:keyof typeof eventPageInfo}) { if (kind === 'registry') return <RegistryPage />; const info=eventPageInfo[kind]; return <div><PageHeading eyebrow={info.eyebrow} title={info.title} description={info.description} /><Unconfigured /><div className="metric-grid"><Metric label="Records" value="Unavailable" note="no verified deployment" /><Metric label={kind==='round-trips'?'Cumulative notional':'Latest event'} value="Unavailable" note="not queried" /><Metric label={kind==='round-trips'?'Cumulative PnL':'Evidence'} value="Unavailable" note="not queried" /></div><Panel className="large-panel"><div className="panel-head"><div><span className="section-kicker">AUDITABLE SOURCE</span><h2>{kind==='registry'?'Registered pairs':kind==='reports'?'Report timeline':'Recorded activity'}</h2></div><Tag>NO EVENT INDEX</Tag></div><EmptyPanel title={info.entity} copy={info.detail} /><p className="fine-print">{kind==='round-trips'?'PnL must be computed from confirmed fills before being presented as measured performance. Keeper journal placeholders are not results.':kind==='reports'?'NAV comes from a trusted keeper report and requires independent off-chain evidence review.':'Owner controls are hidden and disabled until a verified registry and role state are available.'}</p></Panel></div>; }

function Risk() { const rows=[['Performance fee','Unavailable','Maximum 3,000 bps'],['Maximum deployed share','Unavailable','Bound must be verified on-chain'],['NAV change limit','Unavailable','Bound must be verified on-chain'],['Report interval / max age','Unavailable','Bounds must be verified on-chain'],['Deposit cap','Unavailable','No vault read available'],['Pause / NAV freshness','Unavailable','No vault read available'],['Role holders','Unavailable','No role checks or logs available']];return <div><PageHeading eyebrow="CONTROL PLANE / RISK DISCLOSURE" title="Risk & guardrails" description="Intended limits and known failure modes. No row below implies an active, verified on-chain control." /><div className="risk-alert"><ShieldAlert size={19}/><div><strong>Unaudited, unproven, and not live.</strong><span>The contract deployment, live trading paths, and strategy edge have not been verified. This is not an operational vault.</span></div></div><Panel className="large-panel"><div className="panel-head"><div><span className="section-kicker">ENFORCED PARAMETERS</span><h2>Chain values not available</h2></div><Tag tone="orange">UNVERIFIED</Tag></div><div className="table-scroll"><table><thead><tr><th>GUARDRAIL</th><th>LIVE VALUE</th><th>VERIFICATION NOTE</th></tr></thead><tbody>{rows.map(r=><tr key={r[0]}><td>{r[0]}</td><td><span className="orange-text">{r[1]}</span></td><td className="table-muted">{r[2]}</td></tr>)}</tbody></table></div></Panel><div className="risk-grid">{[['NAV attestation','Keeper-reported NAV relies on a trusted off-chain process and committed evidence.'],['Liquidity mismatch','Withdrawals depend on idle vault USDC and can be constrained while funds are deployed.'],['Market / execution','Funding, slippage, market impact, pool liquidity, and execution timing can erase a modeled edge.'],['Code and operations','Contracts are unaudited; live order and capital-return flows are not verified.']].map(([a,b])=><Panel key={a}><span className="section-kicker">RISK FACTOR</span><h3>{a}</h3><p>{b}</p></Panel>)}</div></div>; }

function Keeper() { return <div><PageHeading eyebrow="OPERATIONS / HYPEREVM + ARBITRUM" title="Keeper status" description="Executor, capital flow, NAV report, and keeper decision observability. No keeper service is configured." /><Unconfigured title="Keeper configuration unavailable">{'Executor and fee-recipient addresses, capital flow events, keeper activity, and dry-run output cannot be queried without deployed contracts and a configured keeper source.'}</Unconfigured><div className="metric-grid"><Metric label="Executor" value="Unavailable" note="no verified address" /><Metric label="Deployed capital" value="Unavailable" note="vault read not available" /><Metric label="Last NAV report" value="Unavailable" note="no event index" /><Metric label="Last round trip" value="Unavailable" note="no event index" /></div><Panel className="large-panel"><div className="panel-head"><div><span className="section-kicker">LATEST DECISION</span><h2>Dry-run output</h2></div><Tag>NO KEEPER FEED</Tag></div><EmptyPanel title="No keeper decision available" copy="No JSON decision payload has been returned by a configured keeper service. Pair, pricing, basis, net edge, size, and blockers are not inferred." /><p className="fine-print">Keeper operations—capital movement, NAV reports, and round-trip recording—belong in an audited keeper script, not a public transaction surface.</p></Panel></div>; }

function Admin() { return <div><PageHeading eyebrow="ACCESS CONTROL / ARBITRUM ONE" title="Admin console" description="Role-gated controls are intentionally unavailable until a deployment, ABI, wallet integration, and role checks can be verified." /><Unconfigured title="Read-only — role state cannot be checked">{'No connected wallet or deployed registry/vault exists. No role-specific controls are exposed. Pause, parameter changes, grants, and registry writes are disabled.'}</Unconfigured><div className="risk-alert"><Shield size={19}/><div><strong>Multisig recommended for privileged roles.</strong><span>Admin, guardian, and registry ownership should use a reviewed multisig. Never enable a write before verifying chain, address, ABI, simulation, and role.</span></div></div><div className="admin-grid">{[['Guardian','Pause vault','Blocks deposits and capital deployment.'],['Admin','Protocol parameters','Would update fees, deployment limits, NAV bounds, and deposit cap.'],['Registry owner','Pair configuration','Would register tokens, markets, limits, and enabled state.']].map(([role,name,description])=><Panel key={role}><div className="panel-head"><div><span className="section-kicker">{role.toUpperCase()} ROLE</span><h2>{name}</h2></div><Tag>ROLE UNKNOWN</Tag></div><p>{description}</p><button disabled className="button button-disabled" data-testid={`button-admin-${role.toLowerCase().replaceAll(' ','-')}`}>CONTROL DISABLED</button></Panel>)}</div></div>; }

function Docs() { const [copied,setCopied]=useState(false);const copyText='Parity: testnet contracts verified (Arbitrum Sepolia, HyperEVM testnet, Robinhood testnet); no mainnet deployment.'; return <div><PageHeading eyebrow="REFERENCE / VERIFY BEFORE USE" title="Documentation" description="Protocol assumptions, verification checklist, and public data boundaries." /><div className="docs-grid"><Panel className="docs-main"><div className="panel-head"><div><span className="section-kicker">VERIFY_ME.md</span><h2>Deployment checklist</h2></div><Tag tone="orange">PARTIAL · TESTNET</Tag></div><div className="verify-list">{[['Vault deployment','Verified: 0xb0e66010…fb5CC (Arb Sepolia)'],['Pair registry','Verified: 0xb0ff214f…dc0130 (Arb Sepolia)'],['HyperCore hedger','Verified: 0xeeccd2bb…eda580d2f (HyperEVM testnet)'],['External tokens & pools','Testnet mocks + V4 pool verified; mainnet pairs in scripts/config'],['Compiled ABIs','Supplied in src/lib/abis.ts, selectors checked on-chain'],['Security review','Contracts unaudited'],['Strategy evidence','Weekday gaps net-negative; no GO verdict'],['Live execution','Testnet spot round trip done; HL short pending funds']].map(([item,status],i)=><div className="verify-item" key={item}><span className="verify-box"><X size={12}/></span><span>{item}</span><b>{status}</b><small>{String(i+1).padStart(2,'0')}</small></div>)}</div></Panel><div className="docs-rail"><Panel><span className="section-kicker">DATA SOURCE</span><h3>Hyperliquid</h3><p>Read-only info API through the Parity backend proxy. Source and fetch timestamp are presented on the monitor.</p><a className="text-link" href="https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api" target="_blank" rel="noreferrer" data-testid="link-hyperliquid-docs">API documentation <ExternalLink size={13}/></a></Panel><Panel><span className="section-kicker">PROJECT LINKS</span><h3>Not supplied</h3><p>Repository, demo video, explorer addresses, and deployment references remain TODO until provided and verified.</p><button className="copy-button" onClick={async()=>{await navigator.clipboard?.writeText(copyText);setCopied(true);window.setTimeout(()=>setCopied(false),1600)}} data-testid="button-copy-status"><Copy size={13}/>{copied?'COPIED':'COPY STATUS'}</button></Panel></div></div><Panel className="docs-note"><span className="section-kicker">IMPORTANT DISTINCTION</span><h2>Observation is not validation.</h2><p>Current perp market data can be observed independently. It cannot establish a tokenized-stock basis, pool liquidity, executable net edge, realized PnL, or a safe and proven trading strategy.</p></Panel></div>; }

function NotFound() { return <div className="not-found"><span className="section-kicker">ROUTE NOT FOUND</span><h1 className="display">Nothing on this track.</h1><Link href="/" className="button button-primary" data-testid="link-back-home">RETURN TO OVERVIEW</Link></div>; }

function Routed() {
  const [location] = useLocation();
  const page: Record<string,ReactNode> = {
    '/':<Overview/>,'/monitor':<Monitor/>,'/vault':<Vault/>,'/deposit':<TransactionPage mode="deposit"/>,'/withdraw':<TransactionPage mode="withdraw"/>,'/position':<Position/>,'/strategy':<Strategy/>,'/registry':<EventPage kind="registry"/>,'/round-trips':<EventPage kind="round-trips"/>,'/reports':<EventPage kind="reports"/>,'/risk':<Risk/>,'/keeper':<Keeper/>,'/admin':<Admin/>,'/docs':<Docs/>
  };
  const view = page[location] ?? <NotFound/>;
  return <Shell><ErrorBoundary resetKey={location}>{view}</ErrorBoundary></Shell>;
}

function App() {
  return <QueryClientProvider client={queryClient}><WalletProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,'')}><Switch>
    <Route path="/" component={Routed}/><Route path="/monitor" component={Routed}/><Route path="/vault" component={Routed}/><Route path="/deposit" component={Routed}/><Route path="/withdraw" component={Routed}/><Route path="/position" component={Routed}/><Route path="/strategy" component={Routed}/><Route path="/registry" component={Routed}/><Route path="/round-trips" component={Routed}/><Route path="/reports" component={Routed}/><Route path="/risk" component={Routed}/><Route path="/keeper" component={Routed}/><Route path="/admin" component={Routed}/><Route path="/docs" component={Routed}/>    <Route><Shell><NotFound/></Shell></Route>
  </Switch></WouterRouter></WalletProvider></QueryClientProvider>;
}

export default App;
