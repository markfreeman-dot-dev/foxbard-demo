# Neko cursor crash fix

The upstream desktop repeatedly crashed in `pkg/xorg.GetCursorImage()` when `XFixesGetCursorImage` returned a null pointer during window transitions. Supervisor restarted Neko, disconnecting visitors and resetting the live control setting.

`neko-cursor-null.patch` applies to Neko source commit `22e35dd52560acc4c17522b029c215c5cc6e14de`. It returns a transparent one-pixel cursor when no native cursor is available. Copy `cursor_null_test.go` to `server/pkg/xorg/` before testing.

Build on the same Debian image as the desktop with Go and the X11, GTK, xcvt, and GStreamer development packages:

```sh
git apply /path/to/neko-cursor-null.patch
cd server
go test ./pkg/xorg ./internal/webrtc/cursor
go build -buildvcs=false -o /tmp/neko-fixed cmd/neko/main.go
```

The tested binary's SHA-256 is `ce2ee7b42e63a9246763eb488e5b4799f7e6188ee484a2b07094b406045c8d01`. It replaced `/usr/bin/neko` in the persistent desktop; the original remains at `/usr/bin/neko.original`. The imported VCR base image has not been rebuilt with this patch.

The supervisor command also includes `--session.implicit_hosting=true`, so control on click survives Neko restarts. The regression test passed. External WebRTC mouse and keyboard input passed after installation, and Neko kept the same PID after the test window closed.

# Hermes chat UI

`neko-chat-ui.patch` targets the same Neko source commit. It changes the chat input to address Hermes by default and adds question buttons plus a custom-answer path. Question metadata travels inside the existing authenticated chat transport. Replies include the question ID, and the Python bridge rejects expired questions.

Apply the patch at the Neko repository root, then build the client:

```sh
cd client
npm ci --ignore-scripts
npm run test -- src/plugins/chat/hermes.test.ts
npm run build
tar -czf /tmp/neko-chat-ui.tgz -C dist .
```

Deploy the resulting archive from this project:

```sh
node --env-file=.env.local scripts/install-chat-ui.mjs /tmp/neko-chat-ui.tgz
```

The installer preserves existing hashed assets for already-open clients and replaces the entry HTML after the new assets are present. Refresh the desktop page to load the update.

## Foxbard design

`neko-foxbard-design.patch` applies after `neko-chat-ui.patch` at the same pinned source commit. It replaces the client logo and visible product names with Foxbard, uses the supplied palette and fonts, and styles chat choices and participant avatars. The choice payloads, commands, transport identifiers, and permission checks stay unchanged. The client accepts both old and new assistant confirmation text.

Build from a Neko source checkout without modifying that checkout:

```sh
node scripts/build-chat-ui.mjs /path/to/neko-source /tmp/foxbard-chat-ui.tgz
```

The script creates a temporary checkout, applies both patches, copies the local design assets and icons, installs dependencies, runs the client tests, and builds the archive. It includes the upstream license and attribution in `licenses/`.

Install the client and native desktop appearance separately from the entry-page deployment:

```sh
node --env-file=.env.local scripts/install-chat-ui.mjs /tmp/foxbard-chat-ui.tgz
node --env-file=.env.local scripts/install-design.mjs
```

The appearance installer adds the KDE color scheme, Plasma theme, fonts, and ink wallpaper with a small fox mark. It relabels the existing assistant launcher without changing its command. Appearance changes apply at the next desktop login; window positions and panel widgets are retained. Run `/opt/foxbard/design/apply.sh` from the desktop session to apply them immediately.

The bridge's updated display text is in `desktop/hermes-chat.py`, and the gateway's reconnect strip is styled in `desktop/gateway.mjs`. Install those service files during a maintenance window using the existing service deployment workflow. The frontend patch remains compatible with the previous bridge text.

Validation for this update: 115 client tests, two gateway tests, and 11 bridge tests passed; the production client build passed. Browser checks covered widths of 320, 390, 768, 1280, and 1440 pixels, selected-choice styling, unchanged choice and typed-answer payloads, slash commands, the About dialog, and the emoji picker. Browser interaction checks used a simulated desktop transport. The native theme installer has not yet been run on the shared desktop.
