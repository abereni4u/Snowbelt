# Working on Snowbelt with git

`main` is the shared copy of the app, and it must always run. Nobody pushes to `main` directly. Every change goes in through a branch and a pull request, so CI checks it first and a broken change can't take down everyone's copy.

The routine is the same every time: **update main → make a branch → commit → push → pull request → merge → update main again.**

## One-time setup

Accept the repo invite from your email or https://github.com/notifications first. Then:

```bash
git clone https://github.com/abereni4u/Snowbelt.git
cd Snowbelt
```

(If you have an SSH key on GitHub, `git@github.com:abereni4u/Snowbelt.git` works too.)

Then follow "Run it locally" in the README.

## Every time you start a task

```bash
git switch main
git pull
git switch -c role3/route-colors
```

Name the branch `role<your role number>/<a few words>`, for example `role1/past-storms-tool` or `role4/email-alerts`. One branch per task.

## While you work: save checkpoints

```bash
git status                  # what changed, and which branch you're on
git add -A
git commit -m "Color high-risk route stretches red"
```

Commit whenever something small works, every 30 to 60 minutes. The message says what the change does. `.env` files are ignored by git on purpose; keys never go in a commit.

## Share it: push and open a pull request

```bash
git push -u origin role3/route-colors
```

Then on GitHub:

1. Click **Compare & pull request** on the yellow banner (or go to Pull requests → New).
2. Check that **base** is `main`. Write one or two lines on what changed and how you tested it.
3. Click **Create pull request**. CI runs the backend tests and the frontend build; wait for the green check.
4. Post the link in the team chat. If the checks are green and it only touches your role's files, merge it yourself: **Merge pull request** → **Confirm merge** → **Delete branch**.

Red check? Click **Details** to see what failed, fix it on the same branch, commit, and `git push` again. The pull request updates on its own.

Keep pull requests small and merge them often. A branch that stays open for hours collects conflicts.

## After anyone's pull request merges: update

Tell the team in chat when you merge. Everyone then runs:

```bash
git switch main
git pull
```

Still in the middle of a task on your branch? Bring the new `main` into it so you're building on the latest code:

```bash
git switch main
git pull
git switch role3/route-colors
git merge main
```

## When git says CONFLICT

A conflict means you and someone else changed the same lines. Git marks them in the file:

```
<<<<<<< HEAD
your version
=======
their version
>>>>>>> main
```

1. Open each file `git status` lists under "both modified".
2. Keep the right lines (sometimes both), and delete the three marker lines.
3. Run the app to check it still works, then:

```bash
git add -A
git commit -m "Merge main into role3/route-colors"
```

Not sure which version is right? Stop and ask the owner of that file (see the table in `AGENTS.md`). To back out of the merge completely: `git merge --abort`.

## Fixing common mistakes

| What happened | What to run |
| --- | --- |
| "Your local changes would be overwritten" when you pull | `git stash`, then `git pull`, then `git stash pop` |
| You want to throw away uncommitted changes to one file | `git restore path/to/file` |
| You committed on `main` by accident (not pushed yet) | `git switch -c role3/my-task` (saves your commits on a branch), then `git switch main` and `git reset --hard origin/main` |
| You're lost | `git status` and `git log --oneline -5`, then ask in chat before running anything with `--force` or `reset` |

## Team rules

- One branch per task, named `role<N>/<task>`. Pull `main` before you start.
- Stay in your role's files (table in `AGENTS.md`). For a shared file (`api.ts`, `types.ts`, `main.py`, `settings.py`, `package.json`, `README.md`), say so in chat before you edit it.
- Never push to `main`, never force-push.
- After the 8 AM feature freeze: fixes only.

## Using an AI agent

`AGENTS.md` (read by Claude through `CLAUDE.md`, and by Gemini through `GEMINI.md`) gives coding agents the same rules: stay in your role's files, run the checks, small pull requests, no keys. Tell your agent which role you're working on at the start.
