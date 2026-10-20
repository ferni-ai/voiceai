import XCTest
@testable import FerniDesign

/// Expression audit P1 #11: blush multiplied Ferni's green by a warm tint and
/// read as a brown smudge. Now the cheeks warm toward pink.
@MainActor
final class BlushTests: XCTestCase {
    func testBlushIsPinkNotBrown() throws {
        guard let renderer = AliveRenderer.shared else { throw XCTSkip("no Metal device") }
        let r = try LidCapTests.render("embarrassed")
        var plainU = r.u
        plainU.glowCol.w = 0
        let plain = try XCTUnwrap(renderer.image(plainU, width: r.w, height: r.h))
        // The most changed pixel is the middle of a cheek.
        var best = (d: 0, i: 0)
        for i in stride(from: 0, to: r.bytes.count, by: 4) where r.bytes[i + 3] == 255 {
            let d = (0..<3).map { abs(Int(r.bytes[i + $0]) - Int(plain[i + $0])) }.reduce(0, +)
            if d > best.d { best = (d, i) }
        }
        let i = best.i
        let (b, g, red) = (Double(r.bytes[i]), Double(r.bytes[i + 1]), Double(r.bytes[i + 2]))
        let plainLuma = 0.0722 * Double(plain[i]) + 0.7152 * Double(plain[i + 1]) + 0.2126 * Double(plain[i + 2])
        let luma = 0.0722 * b + 0.7152 * g + 0.2126 * red
        XCTAssertGreaterThan(best.d, 40, "there is a blush")
        XCTAssertGreaterThan(red, g, "rosy: red over green (\(Int(red)), \(Int(g)), \(Int(b)))")
        XCTAssertGreaterThan(b, red * 0.45, "pink, not orange or brown (\(Int(red)), \(Int(g)), \(Int(b)))")
        XCTAssertGreaterThan(luma, plainLuma * 0.8, "a warm cheek, not a smudge darker than the face")
    }
}
