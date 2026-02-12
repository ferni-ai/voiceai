use std::path::PathBuf;

use crate::io::IoArgs;

/// Get output path for a batch item
pub fn get_output_path(
    io_args: &IoArgs,
    index: usize,
    item_output: Option<&str>,
    is_batch_mode: bool,
) -> PathBuf {
    // If item specifies its own output, use that
    if let Some(output) = item_output {
        if let Some(ref dir) = io_args.output_dir {
            return dir.join(output);
        }
        return PathBuf::from(output);
    }

    // In batch mode, generate numbered outputs
    if is_batch_mode {
        let dir = io_args
            .output_dir
            .as_deref()
            .unwrap_or_else(|| std::path::Path::new("."));
        return dir.join(format!("output_{}.wav", index));
    }

    // Single mode uses the --output argument
    io_args.output.clone()
}
