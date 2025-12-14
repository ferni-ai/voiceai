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
    dependencies: [],
    targets: [
        .executableTarget(
            name: "FerniVoice",
            dependencies: [],
            path: "Sources"
        )
    ]
)
