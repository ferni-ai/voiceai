import Foundation
import XCTest
@testable import FerniKit

@MainActor
final class MemoryLockTests: XCTestCase {
    final class Owner: DeviceOwnerCheck, @unchecked Sendable {
        var answer = true
        var asked: [String] = []
        func method() -> String? { "Face ID" }
        func confirm(reason: String) async -> Bool { asked.append(reason); return answer }
    }

    private let defaults = UserDefaults(suiteName: "memory-lock-\(UUID().uuidString)")!

    func testOffByDefault() {
        let lock = MemoryLock(defaults: defaults, check: Owner())
        XCTAssertFalse(lock.isEnabled)
        XCTAssertFalse(lock.isLocked)
    }

    func testTurningItOnNeedsTheOwnerAndLastsAcrossLaunches() async {
        let owner = Owner()
        owner.answer = false
        let lock = MemoryLock(defaults: defaults, check: owner)
        let refused = await lock.setEnabled(true)
        XCTAssertFalse(refused)
        XCTAssertFalse(lock.isEnabled, "not without the owner")

        owner.answer = true
        let accepted = await lock.setEnabled(true)
        XCTAssertTrue(accepted)
        XCTAssertFalse(lock.isLocked, "open right after you proved it's you")

        let relaunched = MemoryLock(defaults: defaults, check: owner)
        XCTAssertTrue(relaunched.isLocked, "locked on the next launch")
    }

    func testItLocksAgainWhenTheAppLeaves() async {
        let owner = Owner()
        let lock = MemoryLock(defaults: defaults, check: owner)
        await lock.setEnabled(true)
        lock.lock()
        XCTAssertTrue(lock.isLocked)
        owner.answer = false
        let failed = await lock.unlock()
        XCTAssertFalse(failed)
        XCTAssertTrue(lock.isLocked)
        owner.answer = true
        let opened = await lock.unlock()
        XCTAssertTrue(opened)
        XCTAssertFalse(lock.isLocked)
    }

    func testTurningItOffNeedsTheOwnerToo() async {
        let owner = Owner()
        let lock = MemoryLock(defaults: defaults, check: owner)
        await lock.setEnabled(true)
        owner.answer = false
        let refused = await lock.setEnabled(false)
        XCTAssertFalse(refused)
        XCTAssertTrue(lock.isEnabled, "someone holding the unlocked phone can't just switch it off")
        XCTAssertEqual(owner.asked.count, 2)
    }

    func testANewPersonStartsWithoutTheLock() async {
        let lock = MemoryLock(defaults: defaults, check: Owner())
        await lock.setEnabled(true)
        lock.reset()
        XCTAssertFalse(MemoryLock(defaults: defaults, check: Owner()).isEnabled)
    }
}
