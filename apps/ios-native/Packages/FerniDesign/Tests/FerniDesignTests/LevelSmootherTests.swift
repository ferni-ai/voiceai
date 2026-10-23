import XCTest
@testable import FerniDesign

/// Voice-level smoothing looks the same at any frame rate (ios-motion-spec §7.1 #8).
final class LevelSmootherTests: XCTestCase {
    func testSmoothingIsTheSameAt60And120Hz() {
        var at60 = LevelSmoother(), at120 = LevelSmoother()
        for _ in 0..<30 { _ = at60.step(toward: 1, dt: 1.0 / 60) }
        for _ in 0..<60 { _ = at120.step(toward: 1, dt: 1.0 / 120) }
        XCTAssertEqual(at60.value, at120.value, accuracy: 0.02)

        for _ in 0..<30 { _ = at60.step(toward: 0, dt: 1.0 / 60) }
        for _ in 0..<60 { _ = at120.step(toward: 0, dt: 1.0 / 120) }
        XCTAssertEqual(at60.value, at120.value, accuracy: 0.02)
    }

    func testRisesFasterThanItFalls() {
        var up = LevelSmoother(), down = LevelSmoother()
        _ = down.step(toward: 1, dt: 10) // fully open
        let rise = up.step(toward: 1, dt: 1.0 / 60)
        let fall = 1 - down.step(toward: 0, dt: 1.0 / 60)
        XCTAssertEqual(rise, 0.25, accuracy: 0.001)
        XCTAssertEqual(fall, 0.08, accuracy: 0.001)
    }
}
