# Git Workflow

## MUST
- MUST check `git status` and `git branch --show-current` before any git write.
- MUST stage files by explicit path.
- MUST commit only when the user asks.
- MUST write commit messages as a short imperative summary (under 72 characters).
- MUST keep one logical change per commit.
- MUST stop and ask if the current branch is not the one the user expects.
- MUST leave uncommitted changes I did not make (for example `vite.config.ts`) untouched and unstaged.

## NEVER
- NEVER run `git add -A` or `git add .`.
- NEVER push unless the user explicitly asks.
- NEVER force push, `git reset --hard`, `git clean`, `git checkout -- <file>`, or `git branch -D`.
- NEVER amend or rebase commits that are already pushed.
- NEVER use `--no-verify`.
- NEVER change git config.
- NEVER commit `node_modules/`, `dist/`, secrets, or real data.
- NEVER commit directly to `main` without the user's say-so.
