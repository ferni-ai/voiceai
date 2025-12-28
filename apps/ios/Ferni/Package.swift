// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Ferni",
    platforms: [
        .iOS(.v17),
        .watchOS(.v10)
    ],
    products: [
        .library(
            name: "FerniCore",
            targets: ["FerniDomain", "FerniInfrastructure", "FerniApplication"]
        ),
    ],
    dependencies: [
        // LiveKit for voice
        .package(url: "https://github.com/livekit/client-sdk-swift.git", from: "2.0.0"),
        // Async algorithms
        .package(url: "https://github.com/apple/swift-async-algorithms", from: "1.0.0"),
        // KeychainAccess for secure storage
        .package(url: "https://github.com/kishikawakatsumi/KeychainAccess.git", from: "4.2.2"),
    ],
    targets: [
        // MARK: - Domain Layer (Pure Swift, no dependencies)
        .target(
            name: "FerniDomain",
            dependencies: [],
            path: "Sources/Domain"
        ),
        
        // MARK: - Infrastructure Layer (External dependencies)
        .target(
            name: "FerniInfrastructure",
            dependencies: [
                "FerniDomain",
                .product(name: "LiveKit", package: "client-sdk-swift"),
                .product(name: "AsyncAlgorithms", package: "swift-async-algorithms"),
                .product(name: "KeychainAccess", package: "KeychainAccess"),
            ],
            path: "Sources/Infrastructure"
        ),
        
        // MARK: - Application Layer (Use Cases, ViewModels)
        .target(
            name: "FerniApplication",
            dependencies: [
                "FerniDomain",
                "FerniInfrastructure",
            ],
            path: "Sources/Application"
        ),
        
        // MARK: - Tests
        .testTarget(
            name: "FerniDomainTests",
            dependencies: ["FerniDomain"],
            path: "../FerniTests/Domain"
        ),
        .testTarget(
            name: "FerniInfrastructureTests",
            dependencies: ["FerniInfrastructure"],
            path: "../FerniTests/Infrastructure"
        ),
        .testTarget(
            name: "FerniApplicationTests",
            dependencies: ["FerniApplication"],
            path: "../FerniTests/Application"
        ),
    ]
)
