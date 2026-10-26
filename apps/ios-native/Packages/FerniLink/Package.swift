// swift-tools-version: 6.0
// What the iPhone and the Apple Watch say to each other: the watch is a
// remote for the call on the phone (Talk, Mute, End), never its own call.
import PackageDescription

let package = Package(
    name: "FerniLink",
    platforms: [.iOS("26.0"), .watchOS("26.0")],
    products: [.library(name: "FerniLink", targets: ["FerniLink"])],
    targets: [
        .target(name: "FerniLink"),
        .testTarget(name: "FerniLinkTests", dependencies: ["FerniLink"]),
    ]
)
