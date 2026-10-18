# pi-todo-lite

English | [简体中文](README.md)

A todo extension for [Pi](https://pi.dev): the model keeps one ordered task table, shown above the editor and replayed after compaction, branch switches and `--continue`. ~400 lines, zero runtime dependencies.

## Install

From GitHub (works today, tracks the default branch):

```bash
pi install git:github.com/setwhite/pi-todo-lite   # writes to ~/.pi/agent/settings.json
pi -e git:github.com/setwhite/pi-todo-lite        # try it once, nothing persisted
```

From npm — **not available yet**, the package is unpublished (T15 in [`docs/TODO.md`](docs/TODO.md)):

```bash
pi install npm:pi-todo-lite
```

Remove `@ssk_dev/rpiv-todo-lean` first if you have it installed — both register `todo`, so the model would see two tools with the same name.

## Usage

- One tool, `todo(tasks)`: submit the whole table in one call, replacing the previous one; `tasks: []` clears it.
- The table sits above the editor, 9 lines by default (overflow drops completed tasks first); `alt+t` collapses it without touching the table.
- `/todos` lists every task; `/todos clear` empties the table; `/todos export` writes a markdown checklist; `/todos import <file>` reads it back (only when the table is empty).

## Configuration

`~/.pi/agent/pi-todo/config.json` (`$PI_CODING_AGENT_DIR` changes the prefix). The extension only reads it: missing file means all defaults. All 21 keys, their ranges and trade-offs are in [`docs/CONFIG.md`](docs/CONFIG.md) (Chinese), with a fully written sample in section 4.

## Development

```bash
pnpm install
pnpm lint                          # biome check: lint + format check (`--write` applies)
pnpm typecheck                     # tsc --noEmit
pnpm test                          # vitest
pi -ne -e ./src/index.ts           # run from the working tree, no settings entry
```

Source lives in `src/` (`src/index.ts` is the entry), tests in `test/`, the repo root only holds config and docs.

## License

MIT © setwhite
