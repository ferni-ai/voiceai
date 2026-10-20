import Foundation

/// What Ferni remembers, read like a journal and not a database (design audit
/// P2 #6): said to you ("You have a dog called Biscuit", not "Has a dog
/// called Biscuit"), and newest first by when he learned it, not grouped by
/// the server's type.
public enum MemoryJournal {
    /// When a note was learned, as the screen groups them.
    public enum Period: String, CaseIterable, Sendable {
        case thisWeek, thisMonth, earlier
    }

    /// The notes newest first, in the periods that have any. Notes with no date
    /// go last, under `earlier`.
    public static func sections(_ notes: [MemoryStore.Note], now: Date, calendar: Calendar = .current)
        -> [(period: Period, notes: [MemoryStore.Note])] {
        let weekAgo = calendar.date(byAdding: .day, value: -7, to: now) ?? now
        let monthAgo = calendar.date(byAdding: .month, value: -1, to: now) ?? now
        func period(_ note: MemoryStore.Note) -> Period {
            guard let at = note.learnedAt else { return .earlier }
            return at >= weekAgo ? .thisWeek : at >= monthAgo ? .thisMonth : .earlier
        }
        // Stable for undated notes: the server's order among them is kept.
        let ordered = notes.enumerated().sorted { a, b in
            switch (a.element.learnedAt, b.element.learnedAt) {
            case let (x?, y?) where x != y: return x > y
            case (nil, _?): return false
            case (_?, nil): return true
            default: return a.offset < b.offset
            }
        }.map(\.element)
        return Period.allCases.compactMap { p in
            let these = ordered.filter { period($0) == p }
            return these.isEmpty ? nil : (p, these)
        }
    }

    /// A note said to you. Only the shapes it's sure of change: a leading
    /// "User"/"The user", a leading third-person verb it knows, or a leading
    /// family word ("Sister Ana's birthday" → "Your sister Ana's birthday").
    /// Anything else is left exactly as Ferni wrote it.
    public static func toYou(_ note: String) -> String {
        let text = note.trimmingCharacters(in: .whitespaces)
        guard let first = text.split(separator: " ", maxSplits: 1).first.map(String.init) else { return note }
        let rest = String(text.dropFirst(first.count)).trimmingCharacters(in: .whitespaces)

        // "User …" / "The user …" / "User's …"
        for subject in ["The user", "User"] {
            guard text.lowercased().hasPrefix(subject.lowercased()) else { continue }
            let after = text.dropFirst(subject.count)
            if after.hasPrefix("'s ") || after.hasPrefix("’s ") { return "Your " + after.dropFirst(3) }
            guard after.hasPrefix(" ") else { continue }
            let tail = after.trimmingCharacters(in: .whitespaces)
            guard let verb = tail.split(separator: " ", maxSplits: 1).first.map(String.init) else { return note }
            if let said = said(verb) { return said + tail.dropFirst(verb.count) }
            return "You " + tail // "mentioned", "said", "started": the same with "you".
        }
        if let said = said(first), !rest.isEmpty { return said + " " + rest }
        let word = first.lowercased().replacingOccurrences(of: "’s", with: "").replacingOccurrences(of: "'s", with: "")
        if family.contains(word), !rest.isEmpty { return "Your " + first.lowercased() + " " + rest }
        return note
    }

    /// "You" and the verb for a third-person verb it knows.
    private static func said(_ verb: String) -> String? {
        switch verb.lowercased() {
        case "is": "You're"
        case "was": "You were"
        case "has": "You have"
        case "does": "You do"
        case "goes": "You go"
        default: verbs[verb.lowercased()].map { "You " + $0 }
        }
    }

    private static let verbs: [String: String] = Dictionary(uniqueKeysWithValues: [
        "likes", "loves", "prefers", "enjoys", "wants", "needs", "hates", "dislikes", "works", "lives",
        "feels", "plans", "tends", "finds", "struggles", "values", "runs", "walks", "reads", "plays",
        "takes", "drinks", "eats", "keeps", "makes", "thinks", "cares", "uses", "speaks", "knows",
        "gets", "hopes", "wishes", "misses", "worries", "tries", "loses", "starts", "visits", "calls",
    ].map { word in
        let base: String = switch word {
        case "wishes", "misses": String(word.dropLast(2))
        case "worries", "tries": String(word.dropLast(3)) + "y"
        default: String(word.dropLast())
        }
        return (word, base)
    })

    private static let family: Set<String> = [
        "mom", "mother", "dad", "father", "sister", "brother", "wife", "husband", "partner",
        "daughter", "son", "grandma", "grandmother", "grandpa", "grandfather", "aunt", "uncle",
        "cousin", "boss", "dog", "cat",
    ]
}
