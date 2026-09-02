# cursor-to-kiro

Deterministic, fail-closed migration analysis for moving supported filesystem artifacts from Cursor to Kiro. It never uses an LLM to transform configuration and never modifies Cursor source artifacts.

The current contract was verified against official Cursor and Kiro documentation on 2026-09-02. See [the compatibility matrix](docs/compatibility-matrix.md) and [the underlying research](docs/official-research.md).

## Supported V1 behavior

- Scans Rules, Skills, Custom Subagents, Hooks, and `AGENTS.md` at documented workspace/user locations.
- Migrates only direct root/global standard Skills whose semantics are proven compatible.
- Reports root `AGENTS.md` as native and leaves it untouched.
- Fails closed for nested `AGENTS.md`, scoped/nested Skills, Rules, Subagents, Hooks, unknown fields, symlinks, collisions, and existing different destinations.
- Builds a complete, case-insensitive destination manifest before writing.
- Stages outputs, commits without overwrite, validates outputs and source integrity, and rolls back only files created by the current transaction.
- Produces deterministic UTF-8/LF output and POSIX-style artifact identities on macOS and Windows.

## Development

```text
npm install
npm run check
npm run build
node dist/index.js --help
```

Enable the tracked pre-commit hook once per clone. It formats staged TypeScript
and JSON files, re-stages those fixes, then runs lint and type checks:

```text
git config core.hooksPath .githooks
```

After `npm link`:

```text
cursor-to-kiro
cursor-to-kiro --root <path>
cursor-to-kiro --dry-run
cursor-to-kiro --version
cursor-to-kiro --help
```

For automated non-interactive writes, pass `--yes`. Expected `CONFLICT` items are reported but do not cause a non-zero exit.

Exit codes: `0` success (including expected conflicts), `1` unexpected runtime error, `2` safety/validation failure with no committed partial migration, and `130` cancellation.
