// swift-tools-version: 6.0
// What the app knows without a call: configuration, the account, the server
// API, the team and plans. No SwiftUI views live here.
import PackageDescription

let package = Package(
    name: "FerniKit",
    platforms: [.iOS("26.0")],
    products: [.library(name: "FerniKit", targets: ["FerniKit"])],
    dependencies: [
        .package(url: "https://github.com/firebase/firebase-ios-sdk", from: "12.0.0"),
    ],
    targets: [
        .target(
            name: "FerniKit",
            dependencies: [
                .product(name: "FirebaseAuth", package: "firebase-ios-sdk"),
                .product(name: "FirebaseCore", package: "firebase-ios-sdk"),
            ]
        ),
        .testTarget(name: "FerniKitTests", dependencies: ["FerniKit"]),
    ]
)
