// swift-tools-version: 6.0
// A call with Ferni: reading what the agent signals, and (next) the LiveKit
// session itself. The call screen lives in the app and reads this.
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
