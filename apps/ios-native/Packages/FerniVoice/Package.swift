// swift-tools-version: 6.0
// A call with Ferni: the session (join, wait for the agent, retry, captions,
// mute, reconnect), the LiveKit room and audio session behind it, and what the
// agent signals. The call screen lives in the app and reads CallSession.
import PackageDescription

let package = Package(
    name: "FerniVoice",
    platforms: [.iOS("26.0")],
    products: [.library(name: "FerniVoice", targets: ["FerniVoice"])],
    dependencies: [
        .package(path: "../FerniKit"),
        .package(path: "../FerniDesign"),
        // Exact: the version the agent stack was verified against (#1764).
        .package(url: "https://github.com/livekit/client-sdk-swift", exact: "2.12.1"),
    ],
    targets: [
        .target(
            name: "FerniVoice",
            dependencies: [
                "FerniKit", "FerniDesign",
                .product(name: "LiveKit", package: "client-sdk-swift"),
            ]
        ),
        .testTarget(name: "FerniVoiceTests", dependencies: ["FerniVoice"]),
    ]
)
