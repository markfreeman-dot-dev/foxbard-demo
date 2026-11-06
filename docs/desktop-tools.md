# Desktop tools and Hermes chat

The shared desktop runs in the persistent `neko-kde-feasibility` Vercel Sandbox. It includes Konsole, Python 3.13, Node.js 20, TypeScript 7, Go 1.24, GCC/G++, Git, Docker Engine, Docker Compose, and Hermes Agent. Hermes uses its own Python 3.14 runtime.

Docker Desktop cannot run in this Sandbox because `/dev/kvm` is unavailable. Docker Engine runs locally inside the Sandbox and passed `docker run --rm hello-world` as the desktop user. Its socket is available only inside the Sandbox. [Docker Desktop's Linux requirements](https://docs.docker.com/desktop/setup/install/linux/) explain the KVM dependency.

## Use Hermes

Type a request directly in Neko's chat. Messages go to Hermes by default; `@hermes` remains supported. When Hermes asks a question, click an option or type your own answer directly. Question buttons are tied to that question and become inactive after an answer. All visitors share the desktop and agent conversation, and can see chat requests and replies.

| Command | Action |
| --- | --- |
| `/status` | Show whether Hermes is busy and whether an OpenRouter key is saved |
| `/stop` | Interrupt the active request through the Hermes gateway |
| `/approve` or `/deny` | Respond to the pending desktop-action approval |
| `/answer your answer` | Answer a question from Hermes |
| `/new` | Start a new conversation without deleting desktop files |
| `/help` | Show chat commands |

Only one request runs at a time. A second request receives a busy message. Requests time out after about four minutes. The bridge cancels the gateway request if the chat connection drops; it does not replay interrupted tasks.

The user configured OpenRouter in the desktop. The key stays in `/home/neko/.hermes/.env` with mode `0600`. Run `foxbard-openrouter` in Konsole, or open **Set up OpenRouter** on the desktop, to replace the key or choose a model. No key belongs in Neko chat or this repository.

The selected `nvidia/nemotron-3-ultra-550b-a55b:free` model accepts text rather than images. It can use terminal tools and accessibility information; screenshot-based reasoning needs a vision-capable model. [OpenRouter model details](https://openrouter.ai/nvidia/nemotron-3-ultra-550b-a55b:free).

## Services and persistence

Supervisor starts Docker and the chat bridge with KDE. The bridge discovers KDE's current session bus and targets display `:99.0`. It connects to Neko on loopback using normal member credentials, not the administrator password. Hermes uses its local gateway for model requests, desktop tools, approvals, and interruption.

The latest filesystem snapshot is retained without automatic expiration; only one snapshot is kept. Files, installed tools, Hermes configuration, and conversation records persist. Running processes and open windows do not. The current test lifecycle still needs an explicit resume after a timeout. It does not implement visitor-based idle shutdown or the production entry page from the original plan.

```sh
npm run probe:desktop -- start
npm run probe:desktop -- stop
```

Reinstall the chat integration after changing its source or updating Hermes:

```sh
node --env-file=.env.local --env-file=.env.probe scripts/install-chat.mjs
```

This restarts the chat bridge. Apply updates when no agent request is running. The integration uses the gateway interfaces in the installed Hermes release; a future Hermes update may require corresponding changes.

Logs inside the desktop:

- `/var/log/neko/hermes-chat.log`: connection and service failures.
- `~/.local/state/foxbard/agent.log`: diagnostics for the latest agent request.
- `/var/log/neko/docker.log`: Docker service startup.

## Validation

The external chat probe received replies to status, help, and stop commands through the exposed HTTPS/WebSocket endpoint. A real OpenRouter request invoked Hermes's terminal and desktop tools. The desktop driver passed screen-capture and accessibility checks; an action approval sent through Neko reached the driver. A subsequent chat task launched a Konsole window on the shared desktop. These checks do not establish reliable task completion for every model or application.

Eleven bridge regression tests cover default message routing, empty messages, missing credentials, busy handling, cancellation, approval responses, typed answers, option selection, stale questions, question ordering, and Neko's message-length limit. Five frontend tests cover question parsing, answer metadata, stale controls, and message length. The frontend passed its TypeScript and production-build checks. Run them in an environment with `httpx`, `websockets`, and `python-dotenv`:

```sh
python3 tests/test_chat_bridge.py
node --env-file=.env.probe scripts/chat-probe.mjs
```

The live clarification probe used the actual OpenRouter model: it answered one question with the same message format as the choice buttons, then answered a second question with plain text. Hermes resumed both times and confirmed the answers. The button UI was compiled and its protocol tested; an automated browser click was not available in this environment. Refresh the Neko page to load the new frontend.

The Sandbox reached its session limit and was resumed during setup. The patched Neko binary, Docker Engine, Hermes installation, selected model, and saved key remained available; Docker ran its test container again after resume.
