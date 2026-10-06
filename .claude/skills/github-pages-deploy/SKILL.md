---
name: github-pages-deploy
description: Vite + GitHub Actions deployment to GitHub Pages, base path, hash routing, caching, service worker versioning, rollback. Use for CI/CD and build config.
---
# GitHub Pages deployment
- One-time: repo Settings → Pages → Source: **GitHub Actions**.
- `vite.config.ts`: `base: './'`. Use hash routing to avoid 404s.
- Workflow: `.github/workflows/deploy.yml` (verify job on PR+main; deploy job only on main after verify; `concurrency.group: pages`, `cancel-in-progress: false`; permissions `pages: write`, `id-token: write` only on deploy job).
- Use `npm ci`, `.nvmrc`, lockfile committed.
- Check current major versions of `actions/*` (checkout, setup-node, configure-pages, upload-pages-artifact, deploy-pages) on their GitHub release pages; pin to SHAs when confirmed.
- Service worker: versioned precache keyed on build hash; "update available" prompt; must never trap users on a stale build. If in doubt, omit.
- Budgets: gzip JS < 150 KB total; per-calculator dynamic imports.
- Rollback: revert the bad commit on `main`; pipeline redeploys. Document in `docs/RUNBOOK.md`.
- Custom domain: set in repo Settings → Pages (a CNAME file is ignored for Actions-based deployments).
