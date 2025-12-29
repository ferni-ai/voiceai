//! SIMD-Accelerated JSON Parser for Tool Call Detection
//!
//! This module provides fast JSON function call detection and parsing
//! for the TTS stream hot path.
//!
//! Key optimizations:
//! - simd-json for 2-5x faster parsing than standard JSON
//! - memchr for fast byte pattern searching
//! - Pre-compiled tool name patterns
//! - Zero-copy where possible
//!
//! Expected performance: 2-5x faster than JavaScript JSON.parse

use memchr::memmem;
use regex::Regex;
use serde::{Deserialize, Serialize};
use simd_json::prelude::{ValueAsScalar, ValueObjectAccess};
use std::collections::HashSet;
use std::sync::Mutex;

lazy_static::lazy_static! {
    /// Known tool names for fast pattern matching
    static ref KNOWN_TOOLS: Mutex<HashSet<String>> = Mutex::new(HashSet::new());

    /// Pre-compiled regex for JSON function call detection
    static ref JSON_FUNCTION_REGEX: Regex = Regex::new(
        r#"\{\s*"fn"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*\{[^}]*\}\s*\}"#
    ).unwrap();

    /// Finder for opening brace
    static ref BRACE_FINDER: memmem::Finder<'static> = memmem::Finder::new(b"{");

    /// Finder for "fn" pattern
    static ref FN_FINDER: memmem::Finder<'static> = memmem::Finder::new(b"\"fn\"");
}

/// Parsed function call from TTS stream
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedFunctionCall {
    /// Tool name
    pub fn_name: String,
    /// Arguments as JSON string (to be parsed by specific tool handler)
    pub args_json: String,
    /// Start position in original text
    pub start_pos: usize,
    /// End position in original text
    pub end_pos: usize,
}

/// Result of scanning text for function calls
#[derive(Debug)]
pub struct ScanResult {
    /// All detected function calls
    pub calls: Vec<ParsedFunctionCall>,
    /// Text with function calls removed
    pub clean_text: String,
    /// Whether any function calls were found
    pub has_calls: bool,
}

/// Register a known tool name for faster detection
pub fn register_tool_name(name: &str) {
    KNOWN_TOOLS.lock().unwrap().insert(name.to_lowercase());
}

/// Register multiple tool names at once
pub fn register_tool_names(names: &[String]) {
    let mut tools = KNOWN_TOOLS.lock().unwrap();
    for name in names {
        tools.insert(name.to_lowercase());
    }
}

/// Clear all registered tool names
pub fn clear_tool_names() {
    KNOWN_TOOLS.lock().unwrap().clear();
}

/// Fast check if text likely contains a function call (no full parse)
///
/// Uses memchr for fast byte searching before attempting regex
#[inline]
pub fn likely_contains_function_call(text: &str) -> bool {
    let bytes = text.as_bytes();

    // Fast path: check for opening brace and "fn" pattern
    if BRACE_FINDER.find(bytes).is_none() {
        return false;
    }

    FN_FINDER.find(bytes).is_some()
}

/// Extract function calls from text using SIMD-accelerated parsing
///
/// Returns all function calls and the cleaned text
pub fn extract_function_calls(text: &str) -> ScanResult {
    // Fast path: quick check before expensive regex
    if !likely_contains_function_call(text) {
        return ScanResult {
            calls: vec![],
            clean_text: text.to_string(),
            has_calls: false,
        };
    }

    let mut calls = Vec::new();
    let mut clean_text = text.to_string();
    let mut offset = 0i64;

    // Find all matches
    for cap in JSON_FUNCTION_REGEX.find_iter(text) {
        let matched_text = cap.as_str();
        let start = cap.start();
        let end = cap.end();

        // Try to parse with simd-json - use owned value to avoid lifetime issues
        let mut json_bytes = matched_text.as_bytes().to_vec();
        if let Ok(value) = simd_json::to_owned_value(&mut json_bytes) {
            if let Some(fn_name) = value.get("fn").and_then(|v| v.as_str()) {
                if let Some(args) = value.get("args") {
                    // Convert args back to string
                    let args_json = serde_json::to_string(&args).unwrap_or_default();

                    calls.push(ParsedFunctionCall {
                        fn_name: fn_name.to_string(),
                        args_json,
                        start_pos: start,
                        end_pos: end,
                    });

                    // Remove from clean text (adjust for previous removals)
                    let adjusted_start = (start as i64 + offset) as usize;
                    let adjusted_end = (end as i64 + offset) as usize;

                    if adjusted_start < clean_text.len() && adjusted_end <= clean_text.len() {
                        clean_text.replace_range(adjusted_start..adjusted_end, "");
                        offset -= (end - start) as i64;
                    }
                }
            }
        }
    }

    ScanResult {
        has_calls: !calls.is_empty(),
        calls,
        clean_text: clean_text.trim().to_string(),
    }
}

/// Parse a single JSON function call string
///
/// Expected format: {"fn":"toolName","args":{...}}
pub fn parse_function_call(json_str: &str) -> Option<ParsedFunctionCall> {
    // Fast path check
    if !likely_contains_function_call(json_str) {
        return None;
    }

    // Try simd-json parsing - use owned value to avoid lifetime issues
    let mut bytes = json_str.as_bytes().to_vec();
    let value = simd_json::to_owned_value(&mut bytes).ok()?;

    let fn_name = value.get("fn")?.as_str()?.to_string();
    let args = value.get("args")?;
    let args_json = serde_json::to_string(&args).ok()?;

    Some(ParsedFunctionCall {
        fn_name,
        args_json,
        start_pos: 0,
        end_pos: json_str.len(),
    })
}

/// Check if a tool name is registered
pub fn is_known_tool(name: &str) -> bool {
    KNOWN_TOOLS.lock().unwrap().contains(&name.to_lowercase())
}

/// Get count of registered tools
pub fn get_tool_count() -> usize {
    KNOWN_TOOLS.lock().unwrap().len()
}

/// Validate JSON string quickly
///
/// Uses simd-json for fast validation without full parse
pub fn is_valid_json(json_str: &str) -> bool {
    let mut bytes = json_str.as_bytes().to_vec();
    simd_json::to_owned_value(&mut bytes).is_ok()
}

/// Parse JSON to a generic value (for when type is unknown)
pub fn parse_json_value(json_str: &str) -> Option<serde_json::Value> {
    // Use simd-json for initial parse, then convert to serde_json::Value
    let mut bytes = json_str.as_bytes().to_vec();
    let owned = simd_json::to_owned_value(&mut bytes).ok()?;

    // Convert simd_json::OwnedValue to serde_json::Value
    // We serialize to JSON string first using serde_json (not Display trait!)
    // then parse back with serde_json. This is necessary because
    // simd_json::OwnedValue::to_string() uses Display which doesn't produce valid JSON.
    // Note: simd_json internally uses serde, so we can serialize directly
    let json_string = simd_json::serde::to_string(&owned).ok()?;
    serde_json::from_str(&json_string).ok()
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_likely_contains_function_call() {
        assert!(likely_contains_function_call(r#"{"fn":"test","args":{}}"#));
        assert!(likely_contains_function_call(r#"Some text {"fn":"test","args":{}} more text"#));
        assert!(!likely_contains_function_call("No function call here"));
        assert!(!likely_contains_function_call(r#"{"name":"test"}"#)); // No "fn" key
    }

    #[test]
    fn test_parse_function_call() {
        let json = r#"{"fn":"playMusic","args":{"query":"jazz"}}"#;
        let result = parse_function_call(json).unwrap();

        assert_eq!(result.fn_name, "playMusic");
        assert!(result.args_json.contains("jazz"));
    }

    #[test]
    fn test_extract_function_calls() {
        let text = r#"Let me play that for you {"fn":"playMusic","args":{"query":"jazz"}} right away"#;
        let result = extract_function_calls(text);

        assert!(result.has_calls);
        assert_eq!(result.calls.len(), 1);
        assert_eq!(result.calls[0].fn_name, "playMusic");
        assert_eq!(result.clean_text, "Let me play that for you right away");
    }

    #[test]
    fn test_extract_multiple_calls() {
        let text = r#"{"fn":"setVolume","args":{"level":50}} and {"fn":"playMusic","args":{"query":"rock"}}"#;
        let result = extract_function_calls(text);

        assert!(result.has_calls);
        assert_eq!(result.calls.len(), 2);
        assert_eq!(result.calls[0].fn_name, "setVolume");
        assert_eq!(result.calls[1].fn_name, "playMusic");
    }

    #[test]
    fn test_register_tool_names() {
        clear_tool_names();
        register_tool_name("playMusic");
        register_tool_name("setReminder");

        assert!(is_known_tool("playMusic"));
        assert!(is_known_tool("PLAYMUSIC")); // Case insensitive
        assert!(!is_known_tool("unknownTool"));
        assert_eq!(get_tool_count(), 2);
    }

    #[test]
    fn test_is_valid_json() {
        assert!(is_valid_json(r#"{"key":"value"}"#));
        assert!(is_valid_json(r#"[1,2,3]"#));
        assert!(!is_valid_json(r#"{"broken json"#));
        assert!(!is_valid_json("not json at all"));
    }

    #[test]
    fn test_no_function_calls() {
        let text = "This is just regular text without any function calls.";
        let result = extract_function_calls(text);

        assert!(!result.has_calls);
        assert!(result.calls.is_empty());
        assert_eq!(result.clean_text, text);
    }
}
