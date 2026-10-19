import XCTest
@testable import FerniShared

// MARK: - EmotionalSoundEngine Lifecycle Tests

/// #2098: the render block held the engine strongly while it rendered, so
/// dropping the last other reference ran deinit on the audio IO thread.
/// deinit called stop(), which waits for that same IO thread, while another
/// thread was inside setupAudioEngine() for the next engine. That deadlocked
/// and hung `swift test`.
final class EmotionalSoundEngineLifecycleTests: XCTestCase {

    func testCreatingAndDroppingEnginesInALoopDoesNotDeadlock() {
        let finished = expectation(description: "50 engines created and dropped")

        // Off the main thread, so a deadlock fails this test on the timeout
        // instead of hanging the whole run.
        Thread.detachNewThread {
            for _ in 0..<50 {
                autoreleasepool {
                    var engine: EmotionalSoundEngine? = EmotionalSoundEngine()
                    engine?.playMicroExpression(.warmth)
                    // Let the IO thread render, so it is mid-callback when the
                    // last reference goes.
                    Thread.sleep(forTimeInterval: 0.02)
                    engine = nil
                }
            }
            finished.fulfill()
        }

        wait(for: [finished], timeout: 60)
    }

    func testDroppingAnEngineDoesNotKeepItAlive() {
        weak var dropped: EmotionalSoundEngine?
        autoreleasepool {
            let engine = EmotionalSoundEngine()
            engine.playMicroExpression(.recognition)
            dropped = engine
        }
        XCTAssertNil(dropped, "nothing, the render block included, should keep a dropped engine alive")
    }

}
