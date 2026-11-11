# THIS DEMO IS NOT A SECURE ENVIRONMENT - DO NOT ENTER SENSITIVE INFORMATION

# Foxbard shared desktop

The demo runs on Vercel at **https://foxbard-demo-mark-5769s-projects.vercel.app**. Enter a display name and the shared demo password, then choose **Open desktop**. Everyone joins the same KDE workspace. Type directly in chat to talk to Foxbard; choose a suggested answer or type your own response when Foxbard asks a question.

The password stays on the server as a hash. Signed, secure HTTP-only cookies protect the entry API and the desktop gateway. The direct Sandbox URL requires a separate authenticated desktop session. Launch tickets expire after 60 seconds and can be used once. Sign-ins last eight hours. Vercel Authentication still protects preview and unique deployment URLs; cofounders use the production URL above.

## Running and stopping

The desktop starts on demand and stops after 15 minutes without a connected visitor. The Foxbard assistant does not count as a visitor. Use **Demo / Reconnect** in the desktop to return to the entry page. Use **Stop shared desktop** there to save and stop it for everyone. Use **Log out** to end your access without stopping other visitors.

The Hobby plan limits each run to 45 minutes. The browser attempts to return to the entry page and reconnect after a connection failure; if the desktop is still saving, wait a few seconds and choose **Open desktop** again. Files, KDE settings, installed tools, and Hermes configuration persist in the named Sandbox. Open windows and running processes restart, so save work before stopping.

Runtime services and persistent desktop data stay on Vercel. The local development machine can be turned off. No paid plan upgrade or external host was added. See [deployment validation and limits](docs/deployment.md).

## Implementation

- `public/`: password login, status, launch, reconnect, logout, and shutdown controls.
- `api/`: authenticated Vercel Functions for sign-in and Sandbox lifecycle operations.
- `desktop/gateway.mjs`: HTTP/WebSocket gate inside the Sandbox, in front of Neko on loopback port 8081.
- `desktop/start.py`: service startup after resume, guarded by a filesystem lock.
- `desktop/hermes-chat.py`: Neko chat bridge to Hermes, using the private Neko endpoint.
- `patches/`: Neko cursor crash fix, interactive chat choices, and Foxbard client styling.
- `desktop/design/`: Foxbard desktop colors, wallpaper, and app icons.

The linked project is `prj_FmEBPE4H8628ZRLCJVvfwRIOCFAg`, under team `team_F8SKlf6Ja69GFWw5dC0d7Y8C`. The shared Sandbox is named `neko-kde-feasibility`; the historical name is retained to preserve its saved desktop.

## Development and verification

The entry page uses the dark palette from the supplied Foxbard design system v0.3.0 in `public/design-system/`. `public/style.css` adapts the shared components to the login and desktop controls. Fonts are served locally from `public/fonts/` and `public/design-system/fonts/`; their license files are included. To change palette values, edit `public/design-system/tokens/tokens.json` and run `python3 public/design-system/tools/build.py` to regenerate the tokens and check contrast.

The desktop client uses the same palette through `patches/neko-foxbard-design.patch`. Visible assistant names map to Foxbard; transport names, session keys, commands, and question metadata retain their existing identifiers. See [the client build and installation steps](patches/README.md#foxbard-design).

For branches, pull requests, CI checks, and automatic website deployments, see [the contribution guide](CONTRIBUTING.md).

Use Node.js 24. Install dependencies with `npm ci`. Local lifecycle commands need the linked project's OIDC credentials in the ignored `.env.local`. Probe credentials stay in the ignored `.env.probe`. Never commit these files or `.env.gate.json`.

```sh
node --test tests/gate.test.mjs
node --env-file=.env.probe scripts/gate-probe.mjs
node --env-file=.env.local --env-file=.env.probe scripts/gate-input-probe.mjs
node --env-file=.env.local --env-file=.env.probe scripts/persistence-probe.mjs
```

The input probe briefly opens a test window. The persistence probe stops the desktop for everyone; run both only when visitors have saved their work. The earlier direct Neko media and chat probes predate the gateway. Use the gated probes for the published demo.

To stop the desktop from the CLI:

```sh
npm run probe:desktop -- stop
npm run probe:desktop -- status
```

`status` does not resume the Sandbox. The saved snapshot remains available without automatic expiration. Stopping does not delete the desktop or its registry image.

Production uses the Vercel secrets `DEMO_PASSWORD_HASH` and `DEMO_SESSION_SECRET`. The gateway keeps its matching configuration in `/etc/foxbard/gate.json`, readable only by root. To rotate access, update both configurations together and restart the gateway; changing the signing secret invalidates existing sessions.

See [developer tools and Hermes](docs/desktop-tools.md), [transport feasibility history](docs/feasibility.md), and [Neko patches](patches/README.md).
