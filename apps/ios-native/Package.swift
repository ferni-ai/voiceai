// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "FerniVoiceiOS",
    platforms: [
        .iOS(.v16),
        .macOS(.v13)  // For development/testing
    ],
    products: [
        .library(name: "FerniVoiceiOS", targets: ["FerniVoiceiOS"])
    ],
    dependencies: [
        // LiveKit Swift SDK - using local patched fork to fix continuation crashes
        .package(path: "../../vendor/client-sdk-swift"),

        // Shared code between macOS and iOS apps
        .package(path: "../shared"),
    ],
    targets: [
        .target(
            name: "FerniVoiceiOS",
            dependencies: [
                .product(name: "LiveKit", package: "client-sdk-swift"),
                .product(name: "FerniShared", package: "shared"),
            ],
            path: "Sources"
        ),
        .testTarget(
            name: "FerniVoiceiOSTests",
            dependencies: ["FerniVoiceiOS"],
            path: "Tests"
        )
    ]
)
