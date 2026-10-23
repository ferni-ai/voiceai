import XCTest
@testable import FerniDesign

/// Expression audit P1 #12: crying's tears started below and outside the
/// eye, specks on the cheek. A tear now wells at the eye's own lower lid.
@MainActor
final class TearTests: XCTestCase {
    func testATearWellsAtTheEye() throws {
        guard let renderer = AliveRenderer.shared else { throw XCTSkip("no Metal device") }
        let dry = try LidCapTests.render("crying", tears: false)
        var wet = dry.u
        wet.tear = SIMD4(0, 0, 1, 1)                      // both tears just welling, fully there
        let bytes = try XCTUnwrap(renderer.image(wet, width: dry.w, height: dry.h))
        let tear = (0..<(dry.w * dry.h)).filter { i in
            (0..<3).map { abs(Int(bytes[i * 4 + $0]) - Int(dry.bytes[i * 4 + $0])) }.reduce(0, +) > 30
        }
        XCTAssertGreaterThan(tear.count, 20, "the tears are drawn")
        let nearEye = LidCapTests.whites(dry, reach: 4, bare: try LidCapTests.render("crying", tears: false, caps: false))
        let touching = tear.filter { nearEye[$0] }.count
        XCTAssertGreaterThan(Double(touching), Double(tear.count) * 0.3, "\(touching) of \(tear.count) tear pixels touch an eye")
    }
}
