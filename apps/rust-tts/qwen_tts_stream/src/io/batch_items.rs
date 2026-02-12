use anyhow::{Context, Result, bail};
use serde::Deserialize;
use std::fs;
use std::io::{BufRead, BufReader};

use crate::io::{IoArgs, VoiceArgs};

/// Single item in a batch input file
#[derive(Debug, Clone, Deserialize)]
pub struct BatchItem {
    /// Text to synthesize
    pub text: String,
    /// Language (optional, defaults to --language)
    #[serde(default)]
    pub language: Option<String>,
    /// Output filename (optional, auto-generated if not specified)
    #[serde(default)]
    pub output: Option<String>,
}

/// Batch input file format
#[derive(Debug, Clone, Deserialize)]
pub struct BatchInput {
    /// List of items to process
    pub items: Vec<BatchItem>,
}

/// Load batch items from various sources
pub fn load_batch_items(io_args: &IoArgs, voice_args: &VoiceArgs) -> Result<Vec<BatchItem>> {
    // Option 1: Input file (format detected from extension)
    if let Some(ref input_file) = io_args.file {
        let is_json = input_file
            .extension()
            .map(|ext| ext.eq_ignore_ascii_case("json"))
            .unwrap_or(false);

        if is_json {
            // JSON batch file
            let content = fs::read_to_string(input_file)
                .with_context(|| format!("Failed to read file: {:?}", input_file))?;
            let batch: BatchInput = serde_json::from_str(&content)
                .with_context(|| format!("Failed to parse JSON file: {:?}", input_file))?;
            if batch.items.is_empty() {
                bail!("JSON file contains no items");
            }
            return Ok(batch.items);
        } else {
            // Text file (one text per line)
            let file = fs::File::open(input_file)
                .with_context(|| format!("Failed to open file: {:?}", input_file))?;
            let reader = BufReader::new(file);
            let items: Vec<BatchItem> = reader
                .lines()
                .map_while(Result::ok)
                .filter(|line| !line.trim().is_empty())
                .map(|text| BatchItem {
                    text,
                    language: None,
                    output: None,
                })
                .collect();
            if items.is_empty() {
                bail!("Text file contains no lines");
            }
            return Ok(items);
        }
    }

    // Option 2: Single text
    if let Some(ref text) = voice_args.text {
        return Ok(vec![BatchItem {
            text: text.clone(),
            language: None,
            output: None,
        }]);
    }

    bail!("No text input specified. Use --text or --file")
}
