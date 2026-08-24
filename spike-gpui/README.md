# scrubb → Rust + GPUI research spike

A throwaway proof-of-concept that reimplements scrubb's signature feature —
**drag-to-scrub numeric literals** — in Rust on [GPUI](https://www.gpui.rs/) (Zed's UI
framework), on top of [`longbridge/gpui-component`](https://github.com/longbridge/gpui-component)
for the code-editor primitive.

**The deliverable is the findings below**, not a polished app. Each of the risks the spike
set out to answer is marked ✅ works / ⚠️ works with caveats / ❌ blocked / ⏳ pending.

**Verification status.** `scrub-core`'s 18 oracle tests pass. The `app` compiles cleanly on
Rust 1.97.1 and **launches without panic** (window opens; editor renders with tree-sitter
highlighting; decorations, file tree, and status bar all initialize). The findings about the
editor/decoration/mouse APIs are read from gpui-component's source (cited by file:line in
the exploration). The **live drag interaction itself was not confirmed end-to-end in an
automated way** — GPUI opens a native window and this environment can't drive real mouse
drags or screenshot the display — so run it by hand to confirm the feel:
`cargo run -p scrubb-spike -- .`, then drag a highlighted number.

## Layout

- `scrub-core/` — pure scrub logic ported 1:1 from `src/scrub/numberScanner.ts`. No GPUI
  dependency, so `cargo test` here runs in <1s. Its tests are a direct translation of
  `src/scrub/numberScanner.test.ts` and act as the port's correctness oracle.
- `app/` — the GPUI binary: window, editor, decorations, scrub interaction, file
  tree/tabs. `src/fs.rs` lifts the Rust backend commands from `src-tauri/src/lib.rs`.

## How to run

```sh
cd spike-gpui
cargo test -p scrub-core         # fast: the pure-logic oracle
cargo run -p scrubb-spike -- .   # opens the window on a folder (arg or $SCRUBB_INITIAL_FOLDER)
```

> First build is heavy: it fetches the pinned `zed` (gpui) tree and compiles the whole
> stack. Revisions are pinned in the workspace `Cargo.toml` for reproducibility
> (gpui-component `4377be3`, zed/gpui `8b1497d`).

---

## Findings

### Toolchain & dependency stack — ✅ builds & launches, with sharp edges

- GPUI ships **no reusable text editor**; Zed's is an in-tree crate. Confirmed the only
  quick path is `gpui-component`, which provides a rope-backed, tree-sitter code `Editor`.
- gpui-component tracks zed `main` **unpinned**, so a reproducible build requires pinning
  `gpui`/`gpui_platform` to the exact zed rev in gpui-component's `Cargo.lock`
  (`8b1497d…`). Cargo resolved the graph with these pins with **no version conflict**.
- **Sharp edge — exact Rust version.** GPUI at this rev uses stabilized `hint::cold_path`;
  it fails to compile on Rust < 1.97 (`error[E0658]: use of unstable library feature`).
  You must match the Rust version zed pins (`rust-toolchain.toml` → `1.97.1`). This is a
  standing tax of tracking an unpinned, fast-moving upstream: gpui + gpui-component + the
  Rust toolchain all move together and must be kept in lockstep.
- App entry differs from vanilla GPUI: `gpui_platform::application().run(...)` +
  `gpui_component::init(cx)` + wrap the root view in `gpui_component::Root`.

### Risk 0 — Pure scrub logic ports cleanly — ✅

`scanNumbers` / `computeStep` / `formatNumber` port 1:1 to Rust; **all 18 translated
oracle tests pass**. Only subtlety: JS `toFixed` rounds half-away-from-zero
(`1.25 → "1.3"`) while Rust's `{:.N}` formatter rounds half-to-even — handled by
pre-rounding with `f64::round` (which is half-away-from-zero). One intentional divergence:
offsets are UTF-8 byte offsets, not JS UTF-16 units (identical for ASCII; byte offsets are
what a Rust rope wants anyway).

### Risk 1 — Mouse pixel → text offset (hit testing) — ✅ (via the public reverse API)

The dedicated forward routine `index_for_mouse_position(Point<Pixels>) -> usize` is
`pub(crate)`, but we don't need it: the **inverse** `range_to_bounds(&Range<usize>) ->
Option<Bounds<Pixels>>` (offset→pixels) **is public**. Since we already know every number's
byte range from the scanner, hit-testing a pixel is just "find the token whose
`range_to_bounds` rect `contains(pos)`" — O(visible numbers), done in `token_at_point`. This
drives both click-to-grab and the hover cursor, entirely through the public API. (An earlier
version used the caret `cursor()` as a proxy; the bounds approach is strictly better — it
also works for hover, where there's no click to move the caret.)

### Risk 2 — Intercepting drag on the editor surface — ✅ (with a selection caveat)

The editor's mouse-down handler does **not** `stop_propagation`, so wrapping the editor in
a `div().on_mouse_down/.on_mouse_move/.on_mouse_up` observes the same events — no patch
needed. Caveat: the editor *also* starts its own drag-selection, which visually fights the
scrub. The spike overwrites the selection each move (`set_selected_range` before `insert`),
so edits still land, but a polished port needs `stop_propagation` on the number-hit case —
which requires either capture-phase handling or a small upstream change.

### Risk 3 — In-place range replacement + undo grouping — ⚠️ replace ✅, undo-grouping ❌

Range replacement is clean: `set_selected_range(byte_range, cx)` + `insert(text, window, cx)`
(byte offsets, matching our scanner). Each `insert` is one **atomic** undo step, but there
is **no public transaction API** to fold a whole drag into a single undo (Monaco does this
via `pushStackElement`). So a drag currently produces one undo entry per mouse-move. Options
for a real port: commit only on mouse-up (loses live feedback), or upstream a
`begin/commit_transaction` pair (the internal `UndoManager` already has the machinery,
just `pub(crate)`).

### Risk 4 — Decoration styling + non-growing stickiness — ✅

`create_decorations_collection(Vec<TextDecoration>, cx)` → keep the returned
`TextDecorationCollection` alive; `.set(...)` to refresh. `TextDecoration::new(byte_range,
HighlightStyle { color, background_color, underline, font_weight, font_style, .. })`. Ranges
**auto-track edits and are hard-coded to never grow at edges** — i.e. Monaco's
`NeverGrowsWhenTypingAtEdges` is the built-in (and only) behavior, exactly what scrub wants.

Caveat found in practice: a decoration's **text `color` competes with tree-sitter's syntax
color**. The library composes decorations to win (`combine_highlights(syntax, decorations)`),
but the override landed inconsistently across tokens (numbers showed half syntax-red, half
decoration-blue) — decorations compose against incrementally-produced syntax runs. The
robust fix is to style the affordance with `underline` + a faint `background_color` and
**leave `color` to the syntax layer**, so every number stays uniform. (scrubb's Monaco
version overrides the color outright via CSS; reproducing that here would need the color
override to compose deterministically.)

### Risk 5 — String/comment exclusion via tree-sitter — ❌ no public query API

The editor highlights via tree-sitter internally, but exposes **no public API to query the
syntax tree** (node kind at an offset). So the Monaco trick of skipping numbers inside
strings/comments can't be reproduced through the public surface. The spike scrubs *all*
numbers (including those in the sample's comment/string). A real port would need to either
run its own lightweight lexer (as scrubb already conceptually does) or upstream a tree
accessor. The related color-literal exclusion (`colorScanner`) has the same shape.

### Syntax highlighting — ✅ (once you enable the feature)

Two non-obvious gotchas, both cleared:
- **It's opt-in.** gpui-component has **no default features**, so with a bare dependency
  there is *zero* highlighting. You must enable `gpui-component/tree-sitter-languages`
  (compiles in the tree-sitter grammars: rust, python, js/ts, go, c/cpp, json, yaml, toml,
  markdown, html, css, ruby, java, kotlin, php, sql, swift, scala, zig, bash, …).
- **Runtime language switching works.** `EditorState::set_highlighter(language, cx)` swaps
  the grammar and re-highlights the live buffer — so a single editor entity handles every
  file. (An earlier note here wrongly said language was fixed at creation; it is not.) We
  map file extension → grammar name in `fs::language_for` and call `set_highlighter` on open.

### Shell breadth (file tree + tabs) — ⚠️ tree ✅, tabs partial

A `v_flex` file tree over the lifted `read_dir` (dirs-first, dotfiles skipped, `..` bounded
to the start folder) opens files into the editor via `set_value` + `set_highlighter`.
Multi-tab model lifecycle was **not** built; `set_value` **clears undo history**, so real
tabs would keep one `EditorState` per open file — straightforward but not done here.

Editing works (the editor isn't read-only) and the buffer **live-saves on every change** —
typing *and* scrubbing — via `EditorState::value()` → `write_file`, matching scrubb's whole
premise (a program watching the file reloads as you drag a number). `Cmd+S / Ctrl+S` (a gpui
`actions!` action bound with `cx.bind_keys`) also forces a save. The spike writes
synchronously per change; scrubb debounces, which a real port should too.

**No app icon.** A bare `cargo run` binary has no dock/window icon — macOS reads that from an
`.app` bundle (Info.plist + `.icns`), and this GPUI build exposes no programmatic
set-app-icon API (only `set_dock_menu`). Shipping an icon means packaging the app
(cargo-bundle / a `.app`), which is out of spike scope.

A top toolbar adds a **light/dark toggle** via `Theme::change(ThemeMode, Some(window), cx)`
(read current with `cx.theme().is_dark()`); the whole UI is themed through `cx.theme()`
tokens (`title_bar`, `sidebar`, `accent`, …), and the active file is highlighted in the
tree. Theming is a strong point of gpui-component — switching is one global call and every
view re-renders automatically.

---

## Overall verdict

**A full port is feasible, but not "free," and it hinges on `gpui-component`, not GPUI
itself.** GPUI gives you the window/layout/GPU-rendering foundation but no editor;
gpui-component supplies a genuinely capable code editor (rope + tree-sitter + decorations
with exactly the stickiness scrub needs). The pure scrub logic ports 1:1.

The friction is concentrated in two places, both *upstream API-surface* gaps rather than
fundamental impossibilities:

1. **Undo transaction grouping** is not public, so a drag can't be one undo step without an
   upstream `begin/commit_transaction`.
2. **No tree-sitter query API**, so string/comment (and color) exclusion must be done with
   an independent lexer or an upstream tree accessor.

(Hit-testing was initially thought to be a gap — the forward pixel→offset call is
`pub(crate)` — but the public inverse `range_to_bounds` covers it cleanly, so it is *not* a
blocker.)

Plus the standing tax of tracking a fast-moving, **unpinned** upstream: gpui + gpui-component
+ the exact Rust toolchain must move in lockstep (this spike already hit a Rust-version wall
and a duplicate-gpui wall).

**Recommendation for a real port:** either (a) vendor/fork gpui-component and upstream the
three small `pub`/transaction additions (highest-fidelity path, matches Monaco behavior
exactly), or (b) accept the caveats above as product compromises. Everything scrubb layers
on top of the editor (scanning, stepping, decoration highlighting, file/watcher backend)
carries over with little risk. The editor layer is the whole game, and it is ~80% there out
of the box.
