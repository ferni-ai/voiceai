import Foundation
import XCTest
@testable import FerniKit

/// Security review: an answer requested for A that lands after B signed in
/// must never fill B's screen.
@MainActor
final class StaleAnswerTests: XCTestCase {
    /// Holds each request until the test releases it.
    private final class Gate: @unchecked Sendable {
        private var waiting: [CheckedContinuation<Void, Never>] = []
        private let lock = NSLock()
        var count: Int { lock.withLock { waiting.count } }
        func wait() async {
            await withCheckedContinuation { c in lock.withLock { waiting.append(c) } }
        }
        func releaseAll() {
            let all = lock.withLock { defer { waiting = [] }; return waiting }
            all.forEach { $0.resume() }
        }
    }

    private let memories = Data(#"{"memories":[{"id":"a1","type":"fact","content":"A's secret","learnedAt":"2026-10-18T15:00:00Z","sourceType":"persona_memory"}]}"#.utf8)
    private let team = Data(#"{"unlockedMembers":["ferni","maya-santos"],"members":[]}"#.utf8)

    private func until(_ condition: @autoclosure () -> Bool) async {
        let deadline = ContinuousClock.now + .seconds(2)
        while !condition(), ContinuousClock.now < deadline { try? await Task.sleep(for: .milliseconds(5)) }
    }

    func testAsNotesThatArriveAfterBSignsInAreDropped() async {
        let gate = Gate()
        let body = memories
        let store = MemoryStore(api: FerniAPI(baseURL: URL(string: "https://x.test")!, idToken: { _ in "t" }) { request in
            await gate.wait()
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        let asA = Task { await store.refresh() }
        await until(gate.count == 1)
        store.reset() // B signs in
        gate.releaseAll()
        await asA.value
        XCTAssertTrue(store.notes.isEmpty, "B never sees A's notes")
        XCTAssertEqual(store.load, .idle)
    }

    func testAsTeamThatArrivesAfterBSignsInIsDropped() async {
        let gate = Gate()
        let body = team
        let store = TeamStore(fetch: { await gate.wait(); return body })
        let asA = Task { await store.refresh() }
        await until(gate.count == 1)
        store.reset()
        gate.releaseAll()
        await asA.value
        XCTAssertEqual(store.unlocked, ["ferni"])
    }
}
