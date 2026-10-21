// swift-tools-version: 6.0
// Ferni's look: color, type and spacing tokens from design-system/tokens, and
// the window avatar. No networking and no app state live here.
import PackageDescription

let package = Package(
    name: "FerniDesign",
    platforms: [.iOS("26.0")],
    products: [.library(name: "FerniDesign", targets: ["FerniDesign"])],
    targets: [
        .target(name: "FerniDesign", resources: [.process("Resources")]),
        .testTarget(name: "FerniDesignTests", dependencies: ["FerniDesign"]),
    ]
)
