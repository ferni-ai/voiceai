// swift-tools-version: 6.0
// A call with Ferni: the session (join, wait for the agent, retry, captions,
// mute, reconnect), what the agent signals, and (next) the LiveKit room behind
// it. The call screen lives in the app and reads CallSession.
import PackageDescription

let package = Package(
    name: "FerniVoice",
    platforms: [.iOS("26.0")],
    products: [.library(name: "FerniVoice", targets: ["FerniVoice"])],
    dependencies: [
        .package(path: "../FerniKit"),
        .package(path: "../FerniDesign"),
    ],
    targets: [
        .target(name: "FerniVoice", dependencies: ["FerniKit", "FerniDesign"]),
        .testTarget(name: "FerniVoiceTests", dependencies: ["FerniVoice"]),
    ]
)
