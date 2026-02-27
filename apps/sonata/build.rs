#[cfg(feature = "napi")]
extern crate napi_build;

fn main() {
    #[cfg(feature = "napi")]
    napi_build::setup();

    // Tell cargo to link against the pocket-voice cdylibs.
    // These are built separately via `make` in the pocket-voice submodule.
    // The dylibs live in pocket-voice/src/stt/target/release/ and pocket-voice/src/tts/target/release/
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let pv_dir = format!("{}/pocket-voice", manifest_dir);

    // STT cdylib
    let stt_lib_dir = format!("{}/src/stt/target/release", pv_dir);
    println!("cargo:rustc-link-search=native={}", stt_lib_dir);
    println!("cargo:rustc-link-lib=dylib=pocket_stt");

    // TTS cdylib
    let tts_lib_dir = format!("{}/src/tts/target/release", pv_dir);
    println!("cargo:rustc-link-search=native={}", tts_lib_dir);
    println!("cargo:rustc-link-lib=dylib=pocket_tts_rs");

    // macOS: set rpath so dylibs are found at runtime
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-arg=-Wl,-rpath,{}", stt_lib_dir);
        println!("cargo:rustc-link-arg=-Wl,-rpath,{}", tts_lib_dir);
    }
}
