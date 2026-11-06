# Deployment validation

Date: 2026-11-06. Project: `foxbard-demo`. Production URL: https://foxbard-demo-mark-5769s-projects.vercel.app.

## Verified flow

The staged production deployment was tested through Vercel's authenticated request path before promotion. The production alias was then tested without Vercel credentials: its password form returned 200, and two authenticated visitors received video through the gate. Tests ran outside the hosting environment.

| Check | Result |
| --- | --- |
| Wrong password | Entry API returned 401 |
| Unauthenticated lifecycle API | Returned 401 |
| Cross-origin sign-in | Returned 403 |
| Direct desktop HTTP without its session cookie | Returned 401 |
| Direct WebSocket without its session cookie | Production endpoint returned 401 before upgrade |
| Launch ticket replay and expiration | Rejected by gateway/session tests |
| Two simultaneous visitors through the deployed gate | Both decoded 1280×720 video; 264 and 263 frames over 12 seconds; both input channels opened |
| Actual mouse and keyboard delivery | X11 received mouse press/release and key press/release through the gated WebRTC channel |
| Neko cursor regression | Neko survived closing the input test window |
| Stop and resume through the deployed API | Passed; resume and handoff took about 6.2 seconds in one measurement |
| Persisted state | Existing home file, KDE SingleClick setting, and saved OpenRouter key remained after resume |
| Stale desktop session after resume | Old desktop cookie returned 401 |
| Logout and active socket closure | Passed gateway integration test |
| Idle claim while a visitor is connected | Rejected in gateway integration test |
| Automatic idle shutdown | Live gateway called the production lifecycle API and stopped the Sandbox with a temporary five-second test interval; the saved configuration was restored to 15 minutes before shutdown |
| Startup error message | A real startup API error returned a retry instruction and Vercel diagnostic guidance; the SDK parameter mismatch causing it was fixed |
| Regression tests | Two gateway test cases and 11 Hermes bridge tests passed |

The user previously confirmed the KDE desktop and chat interface in their browser. No interactive browser was connected for this deployment turn. The new login page and browser handoff were checked at the HTTP/protocol level; fresh browser rendering and two-browser interaction remain unverified.

## Limits and cost

No plan upgrade was made. Current [Vercel pricing](https://vercel.com/pricing) includes 5 Sandbox active CPU hours, 420 GB-hours of memory, 20 GB of Sandbox transfer, and 15 GB of snapshot storage on Hobby. The desktop uses 2 vCPUs and 4 GB of memory, so each running hour uses 4 GB-hours of memory allowance. CPU and transfer use vary with desktop activity and viewers. Compute stays within the free allowance until the quota is exhausted; this is not an unlimited desktop service.

The same pricing page lists 10 GB of included Container Registry image storage. The imported image is about 1.39 GB. The earlier feasibility note quoted the paid storage rate without the included allowance; that estimate is superseded here. This project's imported image fits within the listed allowance, subject to other team usage. No paid resource was provisioned for the gate.

[Sandbox duration and persistence](https://vercel.com/kb/guide/vercel-sandbox-duration-and-persistence) are separate: Hobby runs last up to 45 minutes, while the named Sandbox retains its filesystem across stops. This demo keeps one snapshot without automatic expiration. Files persist; running processes and open windows do not.

## Operations

Use the production entry page's **Stop shared desktop** button to stop runtime compute. The next **Open desktop** action resumes the saved Sandbox and starts D-Bus, KDE, Neko, Docker Engine, Hermes chat, and the authentication gateway. The gateway requests shutdown through a signed lifecycle call after 15 minutes without connected visitor sockets. The lifecycle function checks the idle condition again before stopping, and the gateway rejects new joins once that stop is claimed.

Preview and unique deployment URLs retain Vercel Authentication. The production alias uses the application's shared password so cofounders do not need Vercel accounts. Runtime credentials use Vercel OIDC; the deployed application does not depend on a local token or personal access token.

For diagnosis, inspect the project's Vercel Function logs and Sandbox status. Inside the Sandbox, service logs are under `/var/log/neko/`. Do not print Hermes's `.env` file or the gateway configuration when gathering diagnostics.
