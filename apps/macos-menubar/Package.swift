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
        // LiveKit Swift SDK for native voice streaming
        .package(url: "https://github.com/livekit/client-sdk-swift", from: "2.0.0"),
    ],
    targets: [
        .executableTarget(
            name: "FerniVoice",
            dependencies: [
                .product(name: "LiveKit", package: "client-sdk-swift"),
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
