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
        // LiveKit Swift SDK - using local patched fork to fix macOS 15 continuation crashes
        // Patches applied:
        // - Locks.swift: Skip Synchronization.Mutex on macOS 15.x (use OSAllocatedUnfairLock instead)
        // - Transport.swift: Eager init for _iceCandidatesQueue (avoid lazy var race on NSObject)
        // - LocalParticipant+RPC.swift: Add ResumeOnce to prevent double continuation resume
        .package(path: "../../vendor/client-sdk-swift"),
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
