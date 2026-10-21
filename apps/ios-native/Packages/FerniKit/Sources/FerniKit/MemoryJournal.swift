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
    /// And only when the rest of the note agrees: "Has a dog; his name is
    /// Biscuit" can't become "You have a dog; his name…" without guessing
    /// whose "his" it is (critic L7). Anything else is left exactly as Ferni
    /// wrote it.
    public static func toYou(_ note: String) -> String {
        guard let (said, subject) = rewrite(note), agrees(note, subject: subject) else { return note }
        return said
    }

    /// Whose the sentence is after a rewrite: yours, or a relative's.
    private enum Subject { case you, relative(String) }

    private static func rewrite(_ note: String) -> (String, Subject)? {
        let text = note.trimmingCharacters(in: .whitespaces)
        guard let first = text.split(separator: " ", maxSplits: 1).first.map(String.init) else { return nil }
        let rest = String(text.dropFirst(first.count)).trimmingCharacters(in: .whitespaces)

        // "User …" / "The user …" / "User's …"
        for subject in ["The user", "User"] {
            guard text.lowercased().hasPrefix(subject.lowercased()) else { continue }
            let after = text.dropFirst(subject.count)
            if after.hasPrefix("'s ") || after.hasPrefix("’s ") {
                let owned = String(after.dropFirst(3))
                return ("Your " + owned, .relative(owned.split(separator: " ").first.map { $0.lowercased() } ?? ""))
            }
            guard after.hasPrefix(" ") else { continue }
            let tail = after.trimmingCharacters(in: .whitespaces)
            guard let verb = tail.split(separator: " ", maxSplits: 1).first.map(String.init) else { return nil }
            if let said = said(verb) { return (said + tail.dropFirst(verb.count), .you) }
            return ("You " + tail, .you) // "mentioned", "said", "started": the same with "you".
        }
        if let said = said(first), !rest.isEmpty { return (said + " " + rest, .you) }
        let word = first.lowercased().replacingOccurrences(of: "’s", with: "").replacingOccurrences(of: "'s", with: "")
        if family.contains(word), !rest.isEmpty { return ("Your " + first.lowercased() + " " + rest, .relative(word)) }
        return nil
    }

    /// Every he/she/they in the note can only be the relative it's about:
    /// one that could be you (or anyone else) leaves the note alone.
    private static func agrees(_ note: String, subject: Subject) -> Bool {
        let words = Set(note.lowercased().split { !$0.isLetter }.map(String.init))
        let allowed: Set<String> = switch subject {
        case .you: []
        case .relative(let who): female.contains(who) ? she : male.contains(who) ? he : []
        }
        return words.intersection(he.union(she).union(they)).isSubset(of: allowed)
    }

    private static let he: Set<String> = ["he", "him", "his", "himself"]
    private static let she: Set<String> = ["she", "her", "hers", "herself"]
    private static let they: Set<String> = ["they", "them", "their", "theirs", "themselves", "themself"]
    private static let female: Set<String> = ["mom", "mother", "sister", "wife", "daughter", "grandma", "grandmother", "aunt"]
    private static let male: Set<String> = ["dad", "father", "brother", "husband", "son", "grandpa", "grandfather", "uncle"]

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
