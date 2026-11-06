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
