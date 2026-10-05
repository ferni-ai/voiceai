import Foundation

/// What the "Meet <Name>" sheet says about a teammate, in the team's own words.
/// `about` is the persona bundle's description and `ferniSays` one of Ferni's
/// handoff introductions (src/personas/bundles/<id>/persona.manifest.json);
/// `helpsWith` is drawn from the bundle's role domains.
struct TeammateIntroduction: Equatable {
    let ferniSays: String
    let about: String
    let helpsWith: [String]

    static func forPersona(_ personaId: String) -> TeammateIntroduction? {
        all[personaId.lowercased()]
    }

    private static let all: [String: TeammateIntroduction] = [
        "maya": TeammateIntroduction(
            ferniSays: "She's our habit coach. Covers everything from sleep to spending. Zero judgment.",
            about: "Warm, encouraging life habits coach who helps build sustainable habits across all "
                + "life domains, from finances to fitness, relationships to routines. Zero judgment, "
                + "maximum support.",
            helpsWith: [
                "Habits that stick, from sleep to spending",
                "Morning and evening routines",
                "Getting back on track after a slip",
            ]
        ),
        "peter": TeammateIntroduction(
            ferniSays: "He loves digging into data and finding what's really going on.",
            about: "The Quant of the team: your brilliant uncle from Boston who finds patterns across "
                + "all of your life. From habits to calendars, spending to sleep, Peter connects dots "
                + "nobody else sees and gets genuinely excited about it.",
            helpsWith: [
                "Patterns across your habits, calendar and spending",
                "How your sleep and energy connect",
                "Telling signal from noise",
            ]
        ),
        "alex": TeammateIntroduction(
            ferniSays: "Whether it's a tough conversation or a busy calendar, Alex is your person.",
            about: "Your communication coach and chief of staff. Handles calendars, emails, texts and "
                + "calls while coaching you through difficult conversations, speaking up for yourself, "
                + "and the people in your life.",
            helpsWith: [
                "Hard conversations, and saying what you mean",
                "Your calendar, emails and follow-ups",
                "Setting boundaries",
            ]
        ),
        "jordan": TeammateIntroduction(
            ferniSays: "Vacations, big purchases, life's firsts? Jordan lives for this stuff.",
            about: "Your lifetime planning partner. From daily moments to decade milestones, Jordan "
                + "helps you envision, plan, and celebrate every chapter of your life.",
            helpsWith: [
                "Trips, milestones and big moments",
                "Turning a goal into a plan",
                "Celebrating the firsts",
            ]
        ),
        "nayan": TeammateIntroduction(
            ferniSays: "Nayan is the wisest person I know.",
            about: "Your lifetime coach. The patience of Bogle, the simplicity of Gandhi, the wit of "
                + "Buffett. A mystic who rides motorcycles and understands compound interest, both "
                + "financial and spiritual.",
            helpsWith: [
                "Life's bigger questions",
                "Meditation and a calmer mind",
                "Long-term thinking about money and meaning",
            ]
        ),
    ]
}
