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
        )
    ],
    dependencies: [],
    targets: [
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
