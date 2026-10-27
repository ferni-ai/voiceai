import Foundation
import os

/// When to ask whether Ferni may check in (UX spec §12): only after a good
/// call (at least 2 minutes, ended by the person). "Not now" waits at least
/// three more good calls before asking once more, then never again.
public struct CheckInAsk {
    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    struct Record: Codable, Equatable { var good = 0, declines = 0, declinedAt = 0 }

    static func key(_ uid: String) -> String { "ferni.checkin.\(uid)" }

    /// Set by CrisisMarker, cleared by the next good call (one without a crisis).
    /// In memory only: it says something about how the person was doing, so it
    /// never touches the disk and goes with the app (or the account) it came from.
    static let afterCrisis = OSAllocatedUnfairLock(initialState: false)

    func record(_ uid: String) -> Record {
        defaults.data(forKey: Self.key(uid)).flatMap { try? JSONDecoder().decode(Record.self, from: $0) } ?? Record()
    }

    private func save(_ record: Record, _ uid: String) {
        defaults.set(try? JSONEncoder().encode(record), forKey: Self.key(uid))
    }

    public func recordGoodCall(uid: String) {
        var record = record(uid)
        record.good += 1
        save(record, uid)
        Self.afterCrisis.withLock { $0 = false }
    }

    public func shouldAsk(uid: String) -> Bool {
        // Never right after a crisis call (#2868 item 38).
        if Self.afterCrisis.withLock({ $0 }) { return false }
        let record = record(uid)
        switch record.declines {
        case 0: return record.good >= 1
        case 1: return record.good >= record.declinedAt + 3
        default: return false
        }
    }

    public func declined(uid: String) {
        var record = record(uid)
        record.declines += 1
        record.declinedAt = record.good
        save(record, uid)
    }

    /// The account was deleted: its record goes too (critic L3).
    public func forget(uid: String) { defaults.removeObject(forKey: Self.key(uid)) }
}
