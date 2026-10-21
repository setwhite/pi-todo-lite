# pi-todo-lite

English | [简体中文](README.md)

![pi-todo-lite: the Todo table above the editor alongside a running tool call](assets/cover.png)

A todo extension for [Pi](https://pi.dev): the model keeps one ordered task table, shown above the editor and replayed after compaction, branch switches and `--continue`. Four source files, zero runtime dependencies.

## Install

```bash
pi install npm:pi-todo-lite
```

From GitHub (tracks the default branch):

```bash
pi install git:github.com/setwhite/pi-todo-lite   # writes to ~/.pi/agent/settings.json
pi -e git:github.com/setwhite/pi-todo-lite        # try it once, nothing persisted
```

## Usage

- One tool, `todo(tasks)`: submit the whole table in one call, replacing the previous one; `tasks: []` clears it.
- The table sits above the editor, 9 lines by default (overflow drops completed tasks first); `alt+t` collapses it without touching the table.
- A finished table stays on screen until your next message (`lifecycle.onFinish` changes that).
- `/todos` lists every task; `/todos clear` empties the table; `/todos export` writes a markdown checklist; `/todos import <file>` reads it back (only when the table is empty).

## Configuration

`<agent dir>/pi-todo/config.json`, where `<agent dir>` is `$PI_CODING_AGENT_DIR` or `~/.pi/agent`. The extension only reads it: no file means all defaults. Broken JSON, an unknown key, or a wrong type/enum throws (the message carries the absolute path and per-field `path: reason`); out-of-range numbers are clamped.

Zero config works. Write only the keys you want to change:

```json
{ "ui": { "widget": { "maxLines": 5 } } }
```

Every key, with its default value (`//` starts a comment; drop them in a real file):

```jsonc
{
  "tools": { "todo": { "name": "todo" } },           // tool name
  "plan": {
    "maxTasks": 20,                                  // max tasks per table; more fails the call
    "maxSubjectChars": 120,                          // max characters per task
    "requireSingleInProgress": false                 // true = only one in_progress task
  },
  "ui": {
    "widget": {
      "enabled": true,                               // show the widget
      "maxLines": 9,                                 // max lines (3–10)
      "placement": "aboveEditor",                    // aboveEditor / belowEditor
      "showCompleted": true,                         // list completed tasks individually
      "header": "Todo {done}/{total} · {doing} doing", // header template: {done} {total} {doing}
      "glyphs": { "pending": "[ ]", "inProgress": "[-]", "completed": "[x]" }, // per-status glyphs
      "completedStyle": "strikethrough"              // strikethrough / dim / plain
    },
    "shortcut": { "toggle": "alt+t" }                // collapse key; off = don't register
  },
  "lifecycle": { "onFinish": "clear" },              // model / keep / clear
  "commands": {
    "todos": { "enabled": true },                    // /todos
    "export": {
      "enabled": true,                               // /todos export
      "dir": "",                                     // output dir, empty = project root
      "fileNamePattern": "todo-{timestamp}.md"       // file name template; never overwrites
    },
    "import": { "enabled": true }                    // /todos import <file>
  },
  "guidance": {                                      // what the model sees, replaced as a group
    "description": "…",                              // tool description
    "promptSnippet": "",                             // the tool-list line; empty = omitted
    "promptGuidelines": ["…"]                        // guidelines
  }
}
```

Unknown keys throw (see above), never silently ignored. `pnpm test` reconciles this sample against the defaults in code.

## Development

```bash
pnpm install
pnpm lint                          # biome check: lint + format check (`--write` applies)
pnpm typecheck                     # tsc --noEmit
pnpm test                          # vitest
pi -ne -e ./src/index.ts           # run from the working tree, no settings entry
```

Source lives in `src/` (`src/index.ts` is the entry), tests in `test/`, the repo root only holds config and docs.

Release: bump `version` in `package.json` and update `CHANGELOG.md`; pushing to `main` publishes via `.github/workflows/npm-publish.yml` (skips versions already on the registry).

## Docs

| Doc | When to read it |
|---|---|
| [`docs/SPEC.md`](docs/SPEC.md) | The contract (Chinese): problem, stories, tool protocol, UI, acceptance criteria, non-goals, glossary |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Before overturning a design (whole-table protocol, state carrier, nudge, config reading, auto-clear) — why it was chosen (Chinese) |
| [`CHANGELOG.md`](CHANGELOG.md) | User-visible changes for each released version |

## License

MIT © setwhite
