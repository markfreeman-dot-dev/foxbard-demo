# Changing the Foxbard demo

Repository: https://github.com/markfreeman-dot-dev/foxbard-demo

Live demo: https://foxbard-demo-mark-5769s-projects.vercel.app

## Make a change

1. Clone the repository and create a branch: `git switch -c your-change`.
2. Edit the files, run the checks below, and push your branch.
3. Open a pull request against `main`. GitHub Actions runs **Demo checks**, and Vercel creates a preview deployment.
4. Review the change and wait for the checks to pass. Merge the pull request when it is ready.
5. Vercel automatically builds `main` and updates the production site. Check the deployment result on the commit and open the live demo afterward.

Vercel is already connected to this repository, with `main` as its production branch. GitHub Actions runs the tests; Vercel's Git integration deploys the website. The CI workflow does not need a Vercel token or access to the desktop password.

Required checks are not enforced yet. Until the owner enables the rule below, a direct push or merge to `main` can deploy even if GitHub Actions fails.

## Run checks locally

Use Node.js 24 and Python 3.12 or later.

```sh
npm ci --ignore-scripts
npm test
python3 -m venv .venv
.venv/bin/python -m pip install -r tests/requirements.txt
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
```

The tests use a local fake desktop server. They do not need production secrets or start a Vercel Sandbox. `--ignore-scripts` skips installation of the native WebRTC probe dependency; use `npm ci` when you need the live media probes documented in the README.

## Where to edit

| Change | Files | Release path |
| --- | --- | --- |
| Login page, copy, layout, buttons | `public/` | Merge to `main` |
| Password authentication and desktop lifecycle API | `api/`, `lib/` | Merge to `main` |
| Hermes chat behavior and clarification replies | `desktop/hermes-chat.py`, `desktop/foxbard_runner.py` | Test, merge, then install into the persistent Sandbox |
| Desktop gateway or service startup | `desktop/gateway.mjs`, `desktop/start.py`, `desktop/*.conf` | Test, merge, then install into the persistent Sandbox |
| Neko frontend choices or cursor behavior | `patches/` | Apply the patch, rebuild Neko or its frontend, and install the result |

A website deployment does not replace files inside the persistent desktop. The owner uses `scripts/install-chat.mjs`, `scripts/install-gate.mjs`, or `scripts/install-chat-ui.mjs` for those changes, following their configuration requirements. These operations can restart services and disconnect visitors, so coordinate them before running the live probes.

## Preview access

Preview URLs require Vercel Authentication. A collaborator may need access or a share link from the owner to view one. Pull requests from forks may also require the owner to authorize the Vercel preview.

The preview environment has no demo password or session-signing secret configured. It can show the entry page, but cannot sign in to the production desktop. Use local tests for API and chat changes. Full desktop validation currently uses the production environment during a coordinated test window; a separate preview desktop is not provisioned.

## Owner setup

The connection used to publish this code has repository write access, not admin access. The owner must make these settings changes:

1. In **Settings → Collaborators**, give the cofounders write access. They can then push branches and open pull requests. The repository is already public, so its code can be shared by URL without adding collaborators.
2. In **Settings → Rules → Rulesets**, add an active branch ruleset for `main`. Require a pull request, one approving review, and the **Demo checks** status check. Require branches to be up to date before merging. Block force pushes and branch deletion.
3. Confirm GitHub Actions is enabled. The first push containing `.github/workflows/ci.yml` should create a run under **Actions → CI**.

After the first successful run, the owner can also select **Demo checks** in Vercel's **Settings → Build and Deployment → Deployment Checks** to hold production promotion until that commit's check passes. This additional deployment gate is not configured by the repository alone.

See [Vercel's Git integration](https://vercel.com/docs/git) and [Deployment Checks](https://vercel.com/docs/deployment-checks) for the platform behavior.

## Secrets

Keep `.env*`, `.vercel/`, API keys, session cookies, and gateway configuration out of Git. Production environment variables remain in Vercel. Do not copy them into GitHub Actions or preview deployments just to make a test pass. Enter or update the OpenRouter key privately inside the desktop.
