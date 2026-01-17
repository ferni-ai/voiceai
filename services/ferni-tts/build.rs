fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Compile protobuf definitions
    #[cfg(feature = "grpc")]
    {
        tonic_build::configure()
            .build_server(true)
            .build_client(true)
            .out_dir("src/synthesis")
            .compile(&["proto/synthesis.proto"], &["proto"])?;
    }

    // Rebuild if proto files change
    println!("cargo:rerun-if-changed=proto/");

    Ok(())
}
