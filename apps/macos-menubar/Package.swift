// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "FerniVoice",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "FerniVoice", targets: ["FerniVoice"])
    ],
    dependencies: [
        // LiveKit Swift SDK - pinned to 2.1.0 for macOS 15 continuation crash fixes
        // This version includes fixes for:
        // - Synchronization.Mutex usage on macOS 15.x
        // - _iceCandidatesQueue initialization race conditions
        // - Continuation resume safety on macOS
        .package(url: "https://github.com/livekit/client-sdk-swift", exact: "2.1.0"),

        // Shared code between macOS and iOS apps
        .package(path: "../shared"),
    ],
    targets: [
        .executableTarget(
            name: "FerniVoice",
            dependencies: [
                .product(name: "LiveKit", package: "client-sdk-swift"),
                .product(name: "FerniShared", package: "shared"),
            ],
            path: "Sources"
        ),
        .testTarget(
            name: "FerniVoiceTests",
            dependencies: ["FerniVoice"],
            path: "Tests"
        )
    ]
)
