//! Pure scrub logic, ported 1:1 from `src/scrub/numberScanner.ts`.
//!
//! This crate has no GPUI dependency so its tests run in seconds, independent of the
//! (heavy) GPUI build. The test module below is a direct translation of
//! `src/scrub/numberScanner.test.ts` and acts as the port's correctness oracle.
//!
//! Known intentional divergence from the TS original: offsets here are UTF-8 **byte**
//! offsets, whereas Monaco/JS uses UTF-16 code-unit offsets. They coincide for ASCII
//! (all the test cases), and byte offsets are what a Rust rope editor wants anyway.

use regex::Regex;
use std::sync::OnceLock;

#[derive(Debug, Clone, PartialEq)]
pub struct NumberToken {
    /// Byte offset of the first character (inclusive).
    pub start: usize,
    /// Byte offset one past the last character (exclusive).
    pub end: usize,
    /// The literal exactly as written, e.g. "1.50".
    pub text: String,
    pub value: f64,
    /// Count of fractional digits, preserved as written (trailing zeros kept).
    pub decimals: usize,
}

fn pattern() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    // Mirrors the JS `/(-)?\d+(\.\d+)?/g`.
    RE.get_or_init(|| Regex::new(r"(-)?\d+(\.\d+)?").unwrap())
}

/// Port of `scanNumbers`. Finds numeric literals, applying the "char before" boundary
/// rules that make `a-5` yield `5` (minus is subtraction) and `var123` yield nothing.
pub fn scan_numbers(source: &str) -> Vec<NumberToken> {
    let bytes = source.as_bytes();
    let mut tokens = Vec::new();

    for caps in pattern().captures_iter(source) {
        let whole = caps.get(0).unwrap();
        let mut start = whole.start();
        let end = whole.end();
        let has_minus = caps.get(1).is_some();

        if has_minus {
            // A minus glued to an identifier/dot is subtraction, not a sign: drop it.
            if start > 0 && is_ident_or_dot(bytes[start - 1]) {
                start += 1;
            }
        } else if start > 0 && is_ident_or_dot(bytes[start - 1]) {
            // Digits glued to an identifier/dot (e.g. `var123`, the `.6` in `1.5.6`).
            continue;
        }

        let text = &source[start..end];
        let value: f64 = match text.parse() {
            Ok(v) if f64::is_finite(v) => v,
            _ => continue,
        };
        let decimals = match text.find('.') {
            Some(dot) => text.len() - dot - 1,
            None => 0,
        };

        tokens.push(NumberToken {
            start,
            end,
            text: text.to_string(),
            value,
            decimals,
        });
    }

    tokens
}

/// Port of `formatNumber` (JS `Number.prototype.toFixed`).
///
/// Rust's `format!("{:.N}", x)` rounds half-to-even, but JS `toFixed` rounds half away
/// from zero (`1.25.toFixed(1) === "1.3"`). `f64::round` is half-away-from-zero, so we
/// pre-round the scaled value to match JS exactly.
pub fn format_number(value: f64, decimals: usize) -> String {
    let factor = 10f64.powi(decimals as i32);
    let rounded = (value * factor).round() / factor;
    format!("{:.*}", decimals, rounded)
}

/// Port of `computeStep`: base increment `10^-decimals`, scaled up by `floor(|v|/100)`
/// for large magnitudes so big numbers scrub faster. Never smaller than the base.
pub fn compute_step(value: f64, decimals: usize) -> f64 {
    let mag = value.abs().max(1.0);
    let base = 10f64.powi(-(decimals as i32));
    base * (mag / 100.0).floor().max(1.0)
}

/// Port of `isIdentOrDot` (operates on a UTF-8 byte; treats any `>= 0x80` byte as part
/// of an identifier, matching the JS `ch >= 0x80` branch).
fn is_ident_or_dot(ch: u8) -> bool {
    matches!(ch, b'.' | b'_')
        || ch.is_ascii_digit()
        || ch.is_ascii_alphabetic()
        || ch >= 0x80
}

#[cfg(test)]
mod tests {
    use super::*;

    fn texts(src: &str) -> Vec<String> {
        scan_numbers(src).into_iter().map(|t| t.text).collect()
    }

    #[test]
    fn finds_a_single_integer() {
        let t = scan_numbers("local x = 42");
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].text, "42");
        assert_eq!(t[0].value, 42.0);
        assert_eq!(t[0].decimals, 0);
    }

    #[test]
    fn finds_a_decimal() {
        let t = scan_numbers("y = 1.5");
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].text, "1.5");
        assert_eq!(t[0].value, 1.5);
        assert_eq!(t[0].decimals, 1);
    }

    #[test]
    fn preserves_trailing_zero_decimals() {
        let t = scan_numbers("a = 1.50");
        assert_eq!(t[0].decimals, 2);
        assert_eq!(t[0].text, "1.50");
    }

    #[test]
    fn captures_a_leading_minus() {
        let t = scan_numbers("dx = -5");
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].text, "-5");
        assert_eq!(t[0].value, -5.0);
    }

    #[test]
    fn does_not_eat_a_minus_following_an_identifier() {
        let t = scan_numbers("a-5");
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].text, "5");
        assert_eq!(t[0].value, 5.0);
    }

    #[test]
    fn does_not_eat_a_minus_following_a_dot() {
        let t = scan_numbers(".-5");
        assert_eq!(t[0].text, "5");
    }

    #[test]
    fn skips_numbers_preceded_by_an_identifier_char() {
        assert_eq!(scan_numbers("var123").len(), 0);
    }

    #[test]
    fn skips_numbers_preceded_by_a_dot() {
        assert_eq!(texts("1.5.6"), vec!["1.5"]);
    }

    #[test]
    fn finds_many_numbers() {
        assert_eq!(
            texts("a = 1, b = 2.5, c = -3, d = 100"),
            vec!["1", "2.5", "-3", "100"]
        );
    }

    #[test]
    fn returns_absolute_character_offsets() {
        let t = scan_numbers("x = 1\ny = 2");
        assert_eq!((t[0].start, t[0].end), (4, 5));
        assert_eq!((t[1].start, t[1].end), (10, 11));
    }

    #[test]
    fn ignores_numbers_that_are_an_identifier_suffix() {
        assert_eq!(scan_numbers("foo42 bar").len(), 0);
    }

    #[test]
    fn format_number_preserves_precision() {
        assert_eq!(format_number(1.5, 1), "1.5");
        assert_eq!(format_number(1.5, 3), "1.500");
        assert_eq!(format_number(2.0, 0), "2");
        assert_eq!(format_number(-3.14, 2), "-3.14");
    }

    #[test]
    fn format_number_rounds_to_requested_decimals() {
        assert_eq!(format_number(1.234, 1), "1.2");
        assert_eq!(format_number(1.25, 1), "1.3");
    }

    #[test]
    fn compute_step_small_integers() {
        assert_eq!(compute_step(5.0, 0), 1.0);
        assert_eq!(compute_step(99.0, 0), 1.0);
    }

    #[test]
    fn compute_step_scales_by_magnitude() {
        assert_eq!(compute_step(100.0, 0), 1.0);
        assert_eq!(compute_step(1000.0, 0), 10.0);
        assert_eq!(compute_step(15000.0, 0), 150.0);
    }

    #[test]
    fn compute_step_uses_base_for_fractionals() {
        assert!((compute_step(1.0, 1) - 0.1).abs() < 1e-9);
        assert!((compute_step(1.0, 2) - 0.01).abs() < 1e-9);
        assert!((compute_step(0.5, 3) - 0.001).abs() < 1e-9);
    }

    #[test]
    fn compute_step_negative_same_as_positive() {
        assert_eq!(compute_step(-1500.0, 0), compute_step(1500.0, 0));
    }

    #[test]
    fn compute_step_never_below_base() {
        assert_eq!(compute_step(0.0, 0), 1.0);
        assert!((compute_step(0.0, 2) - 0.01).abs() < 1e-9);
    }
}
