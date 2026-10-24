# pi-todo-lite

English | [简体中文](README.md)

![pi-todo-lite: the Todo table above the editor, next to a running tool call](assets/cover.png)

A todo extension for [Pi](https://pi.dev). The model keeps one ordered task table. The table shows above the editor. The table replays after compaction, a branch switch, or `--continue`. No runtime dependencies.

## Install

Install from npm:

```bash
pi install npm:pi-todo-lite
```

Install from the default GitHub branch:

```bash
pi install git:github.com/setwhite/pi-todo-lite   # writes ~/.pi/agent/settings.json
pi -e git:github.com/setwhite/pi-todo-lite        # one try, nothing saved
```

## Usage

The model gets one tool, `todo(tasks)`. One call submits the whole table. The new table replaces the old table. `tasks: []` clears the table.

The table shows above the editor. If the table needs more lines than `ui.widget.maxLines`, completed tasks drop first. Press `alt+t` to collapse the table. The task data does not change.

A finished table stays on screen. The table clears when you send the next message. Set `lifecycle.onFinish` to change this behavior.

Commands:

- `/todos` lists all tasks, without truncation.
- `/todos clear` clears the table.
- `/todos export` writes a markdown checklist.
- `/todos import <file>` reads a markdown checklist. The table must be empty; otherwise run `/todos clear` first.

## Configuration

The config file is `<agent dir>/pi-todo/config.json`. `<agent dir>` is `$PI_CODING_AGENT_DIR`. If unset, it is `~/.pi/agent`.

The extension only reads this file. It never writes it. Without the file, all values are defaults.

These cases throw an error. The message holds the absolute path and one `path: reason` line per fault: broken JSON, an unknown key, a wrong type or enum. Out-of-range numbers are clamped.

Zero config works. Write only the keys that you change:

```json
{ "ui": { "widget": { "maxLines": 5 } } }
```

All keys follow, with their default values. The `//` starts a comment. Remove comments in a real file.

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

An unknown key throws. Nothing is silently ignored.

## Development

```bash
pnpm install
pnpm lint                          # biome check: lint and format check (`--write` applies fixes)
pnpm check:imports                 # dependency gate: executable form of docs/ARCHITECTURE.md "Dependency direction"
pnpm typecheck                     # tsc --noEmit
pnpm test                          # vitest
pi -ne -e ./src/index.ts           # run from the working tree, no settings entry
```

Pre-commit gate (optional, per clone): `git config core.hooksPath .githooks`. After that, each commit runs the same four commands, about 3 seconds.

Release: change `version` in `package.json` and update `CHANGELOG.md`. Push to `main`. The workflow is `.github/workflows/npm-publish.yml`.

## Docs

| Doc | When to read it |
|---|---|
| [`docs/specs/0001-pi-todo-lite.md`](docs/specs/0001-pi-todo-lite.md) | Contract (Chinese): user stories, acceptance criteria, non-goals. Change one of these three here first |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Module duties, dependency direction, invariants (Chinese). Read it before you add a file or a dependency |
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md) | Terms (Chinese). Read it when a name or a message conflicts |
| [`CHANGELOG.md`](CHANGELOG.md) | User-visible changes for each release. Read it before you upgrade |

## License

MIT © setwhite
