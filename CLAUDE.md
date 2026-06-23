# Substitute — project instructions

This file is specific to the `substitute` repo and supplements (never
replaces) the global `~/CLAUDE.md`, which always applies regardless of
working directory. Where the two overlap (git workflow, TypeScript
standards), the global file is authoritative — this file only adds
project-specific process on top.

## Planning workflow — no code without a refined task

Nothing gets implemented ad hoc. Every change follows this sequence:

1. **Master task list lives in `plans/TASKS.md`** — a table of tasks with a
   dependencies column. It is the single source of truth for what's left to
   build and what blocks what. Update it (status, new tasks discovered
   mid-build, dependency changes) as work progresses — don't let it go
   stale.
2. **Before writing any code for a task, refine it into its own spec** under
   `plans/tasks/NN-slug.md`. The refinement depth matches the task: code
   tasks get file structure, function/class breakdown, and key behavior
   decisions; non-code tasks (e.g. manual verification steps) get a precise
   procedure and a decision matrix for what each outcome implies.
3. **Post the refinement as a rough draft and get explicit sign-off before
   implementing.** Don't treat a draft as approved just because it wasn't
   immediately objected to — wait for confirmation, then implement only
   what was agreed.
4. If implementation reveals the design plan (`plans/PLAN_substitute.md`)
   was wrong, incomplete, or simplified along the way (e.g. an empirical
   finding from a verification task), **update the plan file itself** so it
   stays authoritative — don't let it silently diverge from what's actually
   built.

## Git workflow for tasks

- **One dedicated branch per task**, branched from `main`, never committed
  to directly. Name branches `<type>/<task-number>-<short-kebab-slug>`,
  using conventional-commit types (`feat`, `fix`, `chore`, `refactor`,
  `docs`, `test`) — e.g. `feat/01-scaffolding`, `feat/05-arr-match-swap`,
  `docs/06-readme-env-example`. The task number ties the branch back to its
  row in `plans/TASKS.md` and its spec in `plans/tasks/`.
- Commit atomically within a task branch, using conventional-commit message
  formatting (per the global CLAUDE.md).
- Merge to `main` only once the task's own verification (tests, manual
  check, or the live-instance verification described in its spec) has
  passed.

## Where things live

- `plans/PLAN_substitute.md` — authoritative design plan (behavior spec,
  env var contract, file list, setup/verification steps).
- `plans/TASKS.md` — master task breakdown with dependencies.
- `plans/tasks/` — one refined spec per task, written before that task's
  code is touched.
- `plans/` as a whole is gitignored — planning docs are local-only, never
  shipped in the image or pushed if this repo ever gets a remote.
