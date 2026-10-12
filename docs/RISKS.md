# Risks

| Risk | Mitigation | Residual |
|---|---|---|
| Edge doesn't exist / costs exceed basis | `measure-gap` GO/PIVOT gate before any trading | Real; the fee stack is large relative to typical gaps |
| Keeper misreports NAV | move cap, min interval, stale block, evidence hash, pause | Trusted keeper; not trustless |
| Executor hot-wallet theft | deploy cap (≤90%), small deposit cap, separate API wallet for HL | Funds sent out are exposed |
| Legging risk (one leg fills, other fails) | marketable IOC orders, slippage limits, small size | Possible loss until unwound |
| Thin-pool slippage / sandwich | `amountOutMinimum`, size ≤ 2% depth | Exit uses minOut=0 in the sample keeper — tighten |
| Funding flips against the short | carry modelled, time-boxed hold | Can eat edge |
| HL oracle / halt / HIP-3 deployer risk | HL mark vs oracle check; builder-deployed markets carry deployer risk | Real |
| Stock Token is a debt security, not stock; issuer/jurisdiction limits | Disclose; no retail promises | Regulatory unknown |
| Cross-chain capital friction | Pre-positioned capital for MVP | Operational burden |
| CoreWriter async / non-atomic | Treat as intent; confirm via info API | Fills uncertain |
| Smart-contract bugs | 22 tests incl. fuzz | **Unaudited** |

This is a hackathon prototype. Not audited. Do not deposit real user funds.
