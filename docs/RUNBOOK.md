# Runbook
- **Deploy:** merge PR to `main`; Actions runs verify → deploy. Pages source must be "GitHub Actions".
- **Rollback:** `git revert <bad-commit>` on `main`; pipeline redeploys the previous good build.
- **Stale cache complaints:** bump service worker cache version / disable SW.
- **Dependency updates:** Dependabot PRs go through the same gates.
- **Failing golden vector:** do not loosen tolerance. Run `/recheck-calcs`, resolve against ledger sources.
