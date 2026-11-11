# Desktop tools and Hermes chat

The shared desktop runs in the persistent `neko-kde-feasibility` Vercel Sandbox. It includes Konsole, Python 3.13, Node.js 20, TypeScript 7, Go 1.24, GCC/G++, Git, Docker Engine, Docker Compose, and Hermes Agent. Hermes uses its own Python 3.14 runtime.

Docker Desktop cannot run in this Sandbox because `/dev/kvm` is unavailable. Docker Engine runs locally inside the Sandbox and passed `docker run --rm hello-world` as the desktop user. Its socket is available only inside the Sandbox. [Docker Desktop's Linux requirements](https://docs.docker.com/desktop/setup/install/linux/) explain the KVM dependency.

## Use Foxbard

Type a request directly in Foxbard chat. Messages go to the Hermes agent by default; `@hermes` remains supported. When Hermes asks a question, click an option or type your own answer directly. Question buttons are tied to that question and become inactive after an answer. All visitors share the desktop and agent conversation, and can see chat requests and replies.

| Command | Action |
| --- | --- |
| `/status` | Show whether Hermes is busy and whether OpenAI subscription credentials are saved |
| `/stop` | Interrupt the active request through the Hermes gateway |
| `/approve` or `/deny` | Respond to the pending desktop-action approval |
| `/answer your answer` | Answer a question from Hermes |
| `/new` | Start a new conversation without deleting desktop files |
| `/help` | Show chat commands |

Only one request runs at a time. A second request receives a busy message. Requests time out after about four minutes. The bridge cancels the gateway request if the chat connection drops; it does not replay interrupted tasks.

Foxbard uses Hermes's `openai-codex` provider with a ChatGPT subscription. Credentials stay in `/home/neko/.hermes/auth.json`; Hermes handles token refresh. Open **Foxbard subscription** on the desktop, or run `hermes model` in Konsole, and choose **ChatGPT / Codex Subscription** to sign in or change the subscription model. The profile default is `gpt-6-sol`. The **Model** and **Effort** selectors above chat apply to your next request. Your browser remembers the choices; other visitors can use their own choices in the same shared conversation. Changing models preserves conversation context.

The bridge requires subscription credentials and starts sessions with `openai-codex`. It does not use the saved OpenRouter key. On this switch, the bridge starts a new conversation; existing desktop files and Hermes conversation records remain available. Never put tokens in chat or this repository.

The selector catalog comes from the signed-in account. Effort choices are limited to levels supported by both OpenAI's catalog and the installed Hermes transport. The catalog contains model names and effort levels only. The installer refreshes it; to refresh it manually, run `hermes --run-module foxbard_catalog` as the desktop user, then copy `~/.config/foxbard/models.json` to `/var/www/foxbard-models.json` as root. Reload the browser afterward.

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

The subscription check received a live reply from `gpt-6-sol` at low effort, then switched to `gpt-6-luna` at medium effort and recalled the previous turn's verification code. The authenticated production status check passed. Run the live check only when no visitor request is running; it adds two messages to the shared conversation:

```sh
node --env-file=.env.local --env-file=.env.probe scripts/subscription-probe.mjs
```


Before the subscription switch, the external chat probe received replies to status, help, and stop commands through the exposed HTTPS/WebSocket endpoint. A real OpenRouter request invoked Hermes's terminal and desktop tools. The desktop driver passed screen-capture and accessibility checks; an action approval sent through Neko reached the driver. A subsequent chat task launched a Konsole window on the shared desktop. These checks do not establish reliable task completion for every model or application.

Fifteen bridge regression tests cover default message routing, empty messages, missing or malformed subscription credentials, provider-session migration, model selection, invalid selections, busy handling, cancellation, approval responses, typed answers, option selection, stale questions, question ordering, and Neko's message-length limit. Five frontend tests cover question parsing, answer metadata, stale controls, and message length. The frontend passed its TypeScript and production-build checks. Run them in an environment with `httpx`, `websockets`, and `python-dotenv`:

```sh
python3 tests/test_chat_bridge.py
node --env-file=.env.probe scripts/chat-probe.mjs
```

The earlier live clarification probe used the OpenRouter model: it answered one question with the same message format as the choice buttons, then answered a second question with plain text. Hermes resumed both times and confirmed the answers. The button UI was compiled and its protocol tested; an automated browser click was not available in this environment. Refresh the Neko page to load the new frontend.

The Sandbox reached its session limit and was resumed during setup. The patched Neko binary, Docker Engine, Hermes installation, selected model, and saved key remained available; Docker ran its test container again after resume.
