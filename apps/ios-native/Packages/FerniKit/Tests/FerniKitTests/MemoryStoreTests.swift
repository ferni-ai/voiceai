import Foundation
import XCTest
@testable import FerniKit

/// What Ferni remembers (src/api/routes/memories.ts), seen and forgotten.
@MainActor
final class MemoryStoreTests: XCTestCase {
    private let body = #"""
    {"memories":[
      {"id":"m1","type":"goal","content":"Three morning walks a week","learnedAt":"2026-10-18T15:00:00.000Z","sourceType":"persona_memory"},
      {"id":"m2","type":"preference","content":" Prefers mornings ","learnedAt":"2026-10-18T14:00:00Z","sourceType":"persona_memory"},
      {"id":"p1","type":"fact","content":"Talks most on weekdays","learnedAt":null,"sourceType":"profile"},
      {"id":"","type":"fact","content":"no id"},
      {"id":"m3","type":"fact","content":"   "}
    ],"patterns":[],"totalInteractions":4}
    """#

    private final class Server: @unchecked Sendable {
        var deleteStatus = 200
        var requests: [URLRequest] = []
    }

    private func store(_ server: Server) -> MemoryStore {
        let body = Data(body.utf8)
        return MemoryStore(api: FerniAPI(
            baseURL: URL(string: "https://app.example.test")!,
            idToken: { _ in "t" },
            send: { request in
                server.requests.append(request)
                let status = request.httpMethod == "DELETE" ? server.deleteStatus : 200
                return (request.httpMethod == "DELETE" ? Data("{}".utf8) : body,
                        HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
            }
        ))
    }

    func testOnlyRealNotesAreShownTrimmed() async {
        let memory = store(Server())
        await memory.refresh()
        XCTAssertEqual(memory.load, .loaded)
        XCTAssertEqual(memory.notes.map(\.content), ["Three morning walks a week", "Prefers mornings", "Talks most on weekdays"])
        XCTAssertEqual(memory.notes.map(\.canForget), [true, true, false])
    }

    func testTheCardShowsWhatThisCallTaught() async {
        let memory = store(Server())
        await memory.refresh()
        let callStart = ISO8601DateFormatter().date(from: "2026-10-18T14:30:00Z")!
        XCTAssertEqual(memory.learned(since: callStart).map(\.id), ["m1"])
    }

    func testForgettingRemovesItAndTellsTheServer() async throws {
        let server = Server()
        let memory = store(server)
        await memory.refresh()
        let note = try XCTUnwrap(memory.notes.first)
        let forgotten = await memory.forget(note)
        XCTAssertTrue(forgotten)
        XCTAssertFalse(memory.notes.contains(note))
        XCTAssertEqual(server.requests.last?.httpMethod, "DELETE")
        XCTAssertEqual(server.requests.last?.url?.path, "/api/cognitive/memories/m1")
    }

    func testIfTheServerRefusesTheNoteComesBack() async throws {
        let server = Server()
        server.deleteStatus = 404
        let memory = store(server)
        await memory.refresh()
        let note = try XCTUnwrap(memory.notes.first)
        let forgotten = await memory.forget(note)
        XCTAssertFalse(forgotten)
        XCTAssertEqual(memory.notes.first, note)
    }

    func testAProfileNoteCantBeForgotten() async throws {
        let server = Server()
        let memory = store(server)
        await memory.refresh()
        let profileNote = try XCTUnwrap(memory.notes.last)
        let forgotten = await memory.forget(profileNote)
        XCTAssertFalse(forgotten)
        XCTAssertFalse(server.requests.contains { $0.httpMethod == "DELETE" })
    }
}
