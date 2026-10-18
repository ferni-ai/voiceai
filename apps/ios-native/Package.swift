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
        // LiveKit Swift SDK - exact pin; bump together with project.yml and the pbxproj
        .package(url: "https://github.com/livekit/client-sdk-swift", exact: "2.12.1"),

        // Shared code between macOS and iOS apps
        .package(path: "../shared"),

        // Firebase Auth for Sign In with Apple
        .package(url: "https://github.com/firebase/firebase-ios-sdk", from: "11.0.0"),
    ],
    targets: [
        .target(
            name: "FerniVoiceiOS",
            dependencies: [
                .product(name: "LiveKit", package: "client-sdk-swift"),
                .product(name: "FerniShared", package: "shared"),
                .product(name: "FirebaseAuth", package: "firebase-ios-sdk"),
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
