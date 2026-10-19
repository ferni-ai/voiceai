// swift-tools-version: 6.0
// What the app knows without a call: configuration, the team, plans and (next)
// the account and the server API. No SwiftUI views live here.
import PackageDescription

let package = Package(
    name: "FerniKit",
    platforms: [.iOS(.v18)],
    products: [.library(name: "FerniKit", targets: ["FerniKit"])],
    targets: [
        .target(name: "FerniKit"),
        .testTarget(name: "FerniKitTests", dependencies: ["FerniKit"]),
    ]
)
