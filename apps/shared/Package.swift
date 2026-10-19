// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "FerniShared",
    platforms: [
        .iOS(.v16),
        .macOS(.v13)
    ],
    products: [
        .library(
            name: "FerniShared",
            targets: ["FerniShared"]
        ),
        .library(
            name: "FerniAuth",
            targets: ["FerniAuth"]
        )
    ],
    dependencies: [],
    targets: [
        // Firebase sign-in, Keychain storage and the authed /token request (no UI)
        .target(
            name: "FerniAuth",
            dependencies: [],
            path: "Sources/FerniAuth"
        ),
        .target(
            name: "FerniShared",
            dependencies: [],
            path: "Sources/FerniShared"
        ),
        .testTarget(
            name: "FerniSharedTests",
            dependencies: ["FerniShared"],
            path: "Tests/FerniSharedTests"
        )
    ]
)
