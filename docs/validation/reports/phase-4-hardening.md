# Phase 4 hardening checks (orchestrator, 2026-10-19, build of branch phase-4)

Method: Playwright against `vite preview` on http://localhost:4173/ (loopback, scripted from the session; scripts are not stored in the repo). **These are manual, scripted checks, not a CI test, and not an independent validator report.**

## Offline / no runtime network (user decision: no runtime network only)
- Visited all 27 calculator routes in one session: every request went to the single origin `http://localhost:4173`. No cross-origin request was made. No console errors or page errors.
- With the network cut after visiting the routes, hash navigation to Fusing, Clearance, Microstrip and PathLoad still rendered (their chunks were already loaded).
- **Not tested / not claimed:** a hard reload while offline fails (no service worker; by decision, not required). A route never visited before going offline would not load (lazy chunk).

## Performance
- Route switches (hash change to rendered h1) for all 27 routes: slowest 375 ms, none over 1 s.
- Cold loads on loopback: DOMContentLoaded 12-17 ms, first contentful paint 32-52 ms for PathLoad, Fusing, Clearance. **Loopback numbers say nothing about the SPEC target of under 1 s on broadband;** that needs a throttled run (Lighthouse or DevTools throttling) which was not done.
- First-load bundles: largest route 133.5 KB gzip of 150; total 431.0 KB of 460 (check:size).
- Per-compute timings are covered by the unit tests (microseconds); no long-task trace was taken.

## Accessibility (structural checks only)
For each of the 27 routes: exactly one h1, a `main` landmark, every input/select/textarea has a label or aria-label, every button has an accessible name, no img without alt. All 27 passed.
Keyboard: 40 Tab presses on the Fusing page reached 12 distinct focus stops without a trap.
**Not done:** axe-core (third-party code, not approved), colour-contrast measurement, screen-reader run of the live regions, collapsible-panel and radio-group keyboard behaviour beyond tab reach, zoom/reflow at 200 %. These stay open (see OPEN_RISKS Phase 4 hardening).

## Result
No defect found by these checks. Coverage of the SPEC targets is partial and stated above.
