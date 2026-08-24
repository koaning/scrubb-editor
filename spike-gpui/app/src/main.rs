//! scrubb → GPUI research spike.
//!
//! Reimplements scrubb's drag-to-scrub-numbers feature on gpui-component's code `Editor`,
//! plus a minimal file tree. See ../README.md for the findings this proves out.

use gpui::prelude::FluentBuilder as _;
use gpui::*;
use gpui_component::{
    button::{Button, ButtonVariants as _},
    h_flex, input::*, v_flex, ActiveTheme, Root, Theme, ThemeMode,
};
// Explicit import shadows both globs: `gpui::*` brings a *trait* named `InputEvent`, while
// the editor's event type is this enum from gpui-component.
use gpui_component::input::InputEvent;
use scrub_core::{compute_step, format_number, scan_numbers, NumberToken};
use std::path::PathBuf;

mod fs;

// Save action, bound to Cmd+S (macOS) / Ctrl+S (elsewhere) in `main`.
actions!(scrubb, [Save]);

const SAMPLE: &str = "\
// Drag any number sideways to scrub it. Hold Shift for fine (0.1x) steps.
let width = 320;
let height = 240;
let scale = 1.50;
let ratio = width / height;
let offset = -12;
let big = 15000;
// numbers in strings/comments are NOT excluded in this spike: \"count = 99\"
";

struct ScrubDrag {
    start_x: Pixels,
    start_value: f64,
    decimals: usize,
    start_offset: usize,
    current_len: usize,
}

struct ScrubbApp {
    editor: Entity<EditorState>,
    decorations: Option<TextDecorationCollection>,
    tokens: Vec<NumberToken>,
    drag: Option<ScrubDrag>,
    hover_number: bool,
    /// Unsaved changes since the last load/save. Scrubbing and typing set this; nothing is
    /// written to disk until Cmd/Ctrl+S.
    dirty: bool,
    /// The folder the app started in; navigation can't go above it.
    root: Option<PathBuf>,
    folder: Option<PathBuf>,
    entries: Vec<fs::DirEntry>,
    current_file: Option<PathBuf>,
    status: String,
    _subs: Vec<Subscription>,
}

impl ScrubbApp {
    fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let editor = cx.new(|cx| {
            EditorState::new(window, cx)
                .language("rust")
                .line_number(true)
                .default_value(SAMPLE)
        });

        // Rescan + refresh decorations whenever the buffer changes (typing or a scrub edit).
        let sub = cx.subscribe(&editor, |this, _editor, ev: &InputEvent, cx| {
            if matches!(ev, InputEvent::Change) {
                this.rescan(cx);
                // Live-save on every change (typing AND scrubbing) — this is the point of
                // scrubb: a program watching the file reloads as you drag a number.
                this.autosave(cx);
            }
        });

        let folder = fs::get_initial_folder();
        let entries = folder
            .as_ref()
            .and_then(|f| fs::read_dir(f).ok())
            .unwrap_or_default();

        let mut app = Self {
            editor,
            decorations: None,
            tokens: Vec::new(),
            drag: None,
            hover_number: false,
            dirty: false,
            root: folder.clone(),
            folder,
            entries,
            current_file: None,
            status: "drag a number to scrub".into(),
            _subs: vec![sub],
        };
        app.rescan(cx);
        app
    }

    /// Port of `ScrubDecorations.rescan`: find numbers, apply the "scrubbable" style.
    /// (This spike does NOT exclude numbers inside strings/comments — see README risk 5.)
    fn rescan(&mut self, cx: &mut Context<Self>) {
        let text = self.editor.read(cx).value().to_string();
        self.tokens = scan_numbers(&text);

        // Mark scrubbable numbers with an underline + faint background only. We deliberately
        // do NOT override the text `color`: that competes with tree-sitter's own number
        // color and (because decorations compose against incrementally-produced syntax runs)
        // lands inconsistently, so numbers looked half red / half blue. Leaving color to the
        // syntax layer keeps every number uniform; the underline is the scrubbable cue.
        let accent = cx.theme().info;
        let style = HighlightStyle {
            background_color: Some(accent.opacity(0.12)),
            underline: Some(gpui::UnderlineStyle {
                color: Some(accent),
                thickness: px(1.),
                wavy: false,
            }),
            ..Default::default()
        };
        let decos: Vec<TextDecoration> = self
            .tokens
            .iter()
            .map(|t| TextDecoration::new(t.start..t.end, style))
            .collect();

        match &self.decorations {
            Some(collection) => collection.set(decos, cx),
            None => {
                let collection = self
                    .editor
                    .update(cx, |state, cx| state.create_decorations_collection(decos, cx));
                self.decorations = Some(collection);
            }
        }
        self.status = format!("{} scrubbable numbers", self.tokens.len());
        cx.notify();
    }

    fn open_path(&mut self, path: PathBuf, window: &mut Window, cx: &mut Context<Self>) {
        if path.is_dir() {
            // Never navigate above the folder the app started in.
            if let Some(root) = self.root.as_ref() {
                if !path.starts_with(root) {
                    return;
                }
            }
            if let Ok(entries) = fs::read_dir(&path) {
                self.entries = entries;
                self.folder = Some(path);
                cx.notify();
            }
            return;
        }
        match fs::read_file(&path) {
            Ok(content) => {
                let lang = fs::language_for(&path);
                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                self.editor.update(cx, |state, cx| {
                    state.set_value(content, window, cx);
                    // Switch the tree-sitter grammar to match the file (runtime language
                    // switch — re-parses and re-highlights the new buffer).
                    state.set_highlighter(lang, cx);
                });
                self.current_file = Some(path);
                self.dirty = false;
                self.rescan(cx); // set_value suppresses the Change event, so rescan manually.
                self.status = format!("{name} · {} numbers · {lang}", self.tokens.len());
                cx.notify();
            }
            Err(e) => {
                self.status = format!("read error: {e}");
                cx.notify();
            }
        }
    }

    // --- scrub interaction -------------------------------------------------------------

    /// Which number literal (if any) sits under a window-space pixel. Uses the *public*
    /// `range_to_bounds` (offset->pixels) to hit-test each token's rect — no need for the
    /// `pub(crate)` pixel->offset routine.
    fn token_at_point(&self, pos: gpui::Point<Pixels>, cx: &App) -> Option<NumberToken> {
        let editor = self.editor.read(cx);
        self.tokens
            .iter()
            .find(|t| {
                editor
                    .range_to_bounds(&(t.start..t.end))
                    .is_some_and(|b| b.contains(&pos))
            })
            .cloned()
    }

    fn on_mouse_down(&mut self, ev: &MouseDownEvent, _window: &mut Window, cx: &mut Context<Self>) {
        let Some(tok) = self.token_at_point(ev.position, cx) else {
            return;
        };
        self.drag = Some(ScrubDrag {
            start_x: ev.position.x,
            start_value: tok.value,
            decimals: tok.decimals,
            start_offset: tok.start,
            current_len: tok.end - tok.start,
        });
        self.status = format!("scrubbing {}", tok.text);
        cx.notify();
    }

    fn on_mouse_move(&mut self, ev: &MouseMoveEvent, window: &mut Window, cx: &mut Context<Self>) {
        // Not dragging: just track whether we're hovering a number, to drive the cursor.
        let Some(drag) = self.drag.as_ref() else {
            let hovering = self.token_at_point(ev.position, cx).is_some();
            if hovering != self.hover_number {
                self.hover_number = hovering;
                cx.notify();
            }
            return;
        };
        if ev.pressed_button != Some(MouseButton::Left) {
            return;
        }

        // Port of `onDocMouseMove`: 1px == 1 step, Shift = 0.1x fine mode.
        let dx = f32::from(ev.position.x - drag.start_x) as f64;
        let step = compute_step(drag.start_value, drag.decimals);
        let scale = if ev.modifiers.shift { 0.1 } else { 1.0 };
        let new_value = drag.start_value + dx * step * scale;
        let new_text = format_number(new_value, drag.decimals);
        let range = drag.start_offset..drag.start_offset + drag.current_len;

        // Select the number's range, then `replace` (which replaces the selection). Using
        // `insert` here would insert at the caret without deleting the old digits — the
        // "stream of numbers" bug.
        self.editor.update(cx, |state, cx| {
            state.set_selected_range(range, cx);
            state.replace(&new_text, window, cx);
        });
        if let Some(d) = self.drag.as_mut() {
            d.current_len = new_text.len();
        }
        // The resulting Change event drives rescan()/decoration refresh.
    }

    fn on_mouse_up(&mut self, _ev: &MouseUpEvent, _window: &mut Window, cx: &mut Context<Self>) {
        if self.drag.take().is_some() {
            self.status = format!("{} scrubbable numbers", self.tokens.len());
            cx.notify();
        }
    }

    /// Write the buffer to disk on every change (typing and scrubbing). This mirrors
    /// scrubb's live-save behavior — the reason to scrub at all is that an external process
    /// watching the file reacts as the number changes. (scrubb debounces this; the spike
    /// writes synchronously, which is fine for small files.)
    fn autosave(&mut self, cx: &mut Context<Self>) {
        let Some(path) = self.current_file.clone() else {
            return;
        };
        let contents = self.editor.read(cx).value().to_string();
        match fs::write_file(&path, &contents) {
            Ok(()) => self.dirty = false,
            Err(e) => self.status = format!("save error: {e}"),
        }
    }

    /// Explicit Cmd/Ctrl+S save (redundant with autosave, but expected muscle memory).
    fn save(&mut self, _: &Save, _window: &mut Window, cx: &mut Context<Self>) {
        let Some(path) = self.current_file.clone() else {
            self.status = "nothing to save (no file open)".into();
            cx.notify();
            return;
        };
        let contents = self.editor.read(cx).value().to_string();
        match fs::write_file(&path, &contents) {
            Ok(()) => {
                self.dirty = false;
                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                self.status = format!("saved {name}");
            }
            Err(e) => self.status = format!("save error: {e}"),
        }
        cx.notify();
    }

    fn toggle_theme(&mut self, _ev: &ClickEvent, window: &mut Window, cx: &mut Context<Self>) {
        let next = if cx.theme().is_dark() {
            ThemeMode::Light
        } else {
            ThemeMode::Dark
        };
        // Global theme change; gpui refreshes all windows, so no manual re-render needed.
        Theme::change(next, Some(window), cx);
    }

    // --- rendering ---------------------------------------------------------------------

    fn render_sidebar(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let title = self
            .folder
            .as_ref()
            .and_then(|f| f.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "no folder (pass a path or set $SCRUBB_INITIAL_FOLDER)".into());

        let mut list = v_flex().gap_1().p_2().child(
            div()
                .text_xs()
                .text_color(cx.theme().muted_foreground)
                .child(title),
        );

        // Only offer ".." while below the start folder — never navigate above the root.
        let at_root = self.folder.as_deref() == self.root.as_deref();
        if !at_root {
            if let Some(parent) = self.folder.as_ref().and_then(|f| f.parent()).map(PathBuf::from) {
                list = list.child(self.entry_row("..", parent, true, cx));
            }
        }
        for entry in &self.entries {
            list = list.child(self.entry_row(
                &entry.name,
                entry.path.clone(),
                entry.is_dir,
                cx,
            ));
        }
        div()
            .w(px(240.))
            .h_full()
            .bg(cx.theme().sidebar)
            .border_r_1()
            .border_color(cx.theme().border)
            .overflow_hidden()
            .child(list)
    }

    fn entry_row(
        &self,
        name: &str,
        path: PathBuf,
        is_dir: bool,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let label = if is_dir {
            format!("{name}/")
        } else {
            name.to_string()
        };
        let is_active = !is_dir && self.current_file.as_deref() == Some(path.as_path());
        div()
            .id(SharedString::from(path.to_string_lossy().to_string()))
            .px_2()
            .py_0p5()
            .rounded_sm()
            .text_sm()
            .cursor_pointer()
            .when(is_dir, |d| d.text_color(cx.theme().muted_foreground))
            .when(is_active, |d| {
                d.bg(cx.theme().accent).text_color(cx.theme().accent_foreground)
            })
            .hover(|s| s.bg(cx.theme().accent))
            .child(label)
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(move |this, _ev, window, cx| {
                    this.open_path(path.clone(), window, cx)
                }),
            )
    }
}

impl Render for ScrubbApp {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let is_dark = cx.theme().is_dark();
        let name = self
            .current_file
            .as_ref()
            .and_then(|f| f.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "no file open".into());
        // Trailing dot marks unsaved changes (Cmd/Ctrl+S to save).
        let file_label = if self.dirty {
            format!("{name} ●")
        } else {
            name
        };

        v_flex()
            .size_full()
            .bg(cx.theme().background)
            .text_color(cx.theme().foreground)
            .on_action(cx.listener(Self::save))
            // Top toolbar: app name, active file, and the light/dark toggle.
            .child(
                h_flex()
                    .h(px(40.))
                    .px_3()
                    .items_center()
                    .justify_between()
                    .bg(cx.theme().title_bar)
                    .border_b_1()
                    .border_color(cx.theme().border)
                    .child(
                        h_flex()
                            .gap_2()
                            .items_baseline()
                            .child(div().font_weight(FontWeight::BOLD).child("scrubb"))
                            .child(
                                div()
                                    .text_xs()
                                    .text_color(cx.theme().muted_foreground)
                                    .child(file_label),
                            ),
                    )
                    .child(
                        Button::new("theme-toggle")
                            .ghost()
                            .label(if is_dark { "☀ Light" } else { "☾ Dark" })
                            .on_click(cx.listener(Self::toggle_theme)),
                    ),
            )
            .child(
                h_flex()
                    .flex_1()
                    .min_h_0()
                    .child(self.render_sidebar(cx))
                    .child(
                        div()
                            .relative()
                            .flex_1()
                            .min_w_0()
                            .h_full()
                            // Wrap the editor so we observe drag events. The editor doesn't
                            // stop_propagation on mouse-down, so these fire too.
                            .on_mouse_down(MouseButton::Left, cx.listener(Self::on_mouse_down))
                            .on_mouse_move(cx.listener(Self::on_mouse_move))
                            .on_mouse_up(MouseButton::Left, cx.listener(Self::on_mouse_up))
                            .child(Editor::new(&self.editor).size_full())
                            // Cursor override: the editor paints its I-beam over its own
                            // area, beating a `.cursor()` on the parent. So when hovering (or
                            // scrubbing) a number, lay a transparent, non-occluding overlay
                            // *on top* whose hitbox carries the horizontal-resize cursor.
                            .when(self.hover_number || self.drag.is_some(), |this| {
                                this.child(
                                    div()
                                        .absolute()
                                        .inset_0()
                                        .cursor(CursorStyle::ResizeLeftRight),
                                )
                            }),
                    ),
            )
            .child(
                h_flex()
                    .h(px(24.))
                    .px_2()
                    .items_center()
                    .bg(cx.theme().secondary)
                    .border_t_1()
                    .border_color(cx.theme().border)
                    .text_xs()
                    .text_color(cx.theme().muted_foreground)
                    .child(self.status.clone()),
            )
    }
}

fn main() {
    // `.with_assets(Assets)` supplies the fonts/icons gpui-component needs; without it the
    // window can come up blank or fail to render.
    gpui_platform::application()
        .with_assets(gpui_component_assets::Assets)
        .run(move |cx| {
            gpui_component::init(cx);
            // Save on Cmd+S (macOS) and Ctrl+S (Windows/Linux).
            cx.bind_keys([
                KeyBinding::new("cmd-s", Save, None),
                KeyBinding::new("ctrl-s", Save, None),
            ]);

            let window_options = WindowOptions {
                window_bounds: Some(WindowBounds::centered(size(px(1200.), px(760.)), cx)),
                ..Default::default()
            };

            cx.spawn(async move |cx| {
                cx.open_window(window_options, |window, cx| {
                    let view = cx.new(|cx| ScrubbApp::new(window, cx));
                    cx.new(|cx| Root::new(view, window, cx))
                })
                .expect("failed to open window");
            })
            .detach();

            // Bring the app to the foreground — a terminal-launched GPUI binary otherwise
            // opens its window behind everything (or not visibly focused) on macOS.
            cx.activate(true);
        });
}
