import Foundation

// MARK: - Team Unlock
/// Who's on the team. Philosophy: "Get to know Ferni first" - teammates join
/// naturally as the friendship deepens (the server's table is in
/// src/types/relationship-stages.ts), or with a plan once plans return.

public enum TeamUnlock {

    public static let allMembers: [TeamMemberConfig] = [
        TeamMemberConfig(
            id: "ferni",
            displayName: "Ferni",
            role: "Your Life Coach",
            description: "Asks the questions that unlock insight.",
            unlocksAt: .firstMeeting,
            introMessage: "Hey! I'm Ferni. I'm so glad you're here.",
            teaserMessage: ""
        ),
        TeamMemberConfig(
            id: "maya",
            displayName: "Maya",
            role: "Habits Coach",
            description: "Helps you build habits that stick.",
            unlocksAt: .gettingStarted,
            introMessage: "I want you to meet Maya. She's incredible at habits.",
            teaserMessage: "I have a friend who's amazing at habits... once we talk more, I'll introduce you."
        ),
        TeamMemberConfig(
            id: "peter",
            displayName: "Peter",
            role: "The Quant",
            description: "Spots patterns nobody else sees.",
            unlocksAt: .buildingTrust,
            introMessage: "You're ready for Peter. He sees patterns most people miss.",
            teaserMessage: "Peter can show you incredible patterns, but I need to know you better first."
        ),
        TeamMemberConfig(
            id: "alex",
            displayName: "Alex",
            role: "Chief of Staff",
            description: "Communication coach. Helps you say what you mean.",
            unlocksAt: .established,
            introMessage: "Alex is going to change how you communicate.",
            teaserMessage: "There's someone who can transform your communication... keep talking to me."
        ),
        TeamMemberConfig(
            id: "jordan",
            displayName: "Jordan",
            role: "Lifetime Planner",
            description: "Turns vague dreams into lived experiences.",
            unlocksAt: .established,
            introMessage: "Jordan helps people turn dreams into actual plans.",
            teaserMessage: "I know someone who can help you plan your whole life... soon."
        ),
        TeamMemberConfig(
            id: "nayan",
            displayName: "Nayan",
            role: "The Sage",
            description: "Small, consistent actions create extraordinary results.",
            unlocksAt: .deepPartnership,
            introMessage: "Nayan is the wisest person I know. You've earned this.",
            teaserMessage: "The sage only speaks to those who've proven their commitment.",
            isPremium: true
        ),
    ]
    
    /// The unlock config for a PersonaRegistry id.
    public static func config(for personaId: String) -> TeamMemberConfig? {
        allMembers.first { $0.id == personaId }
    }

    /// What tapping a teammate does: talk to someone on the team, or meet
    /// someone who isn't yet.
    public enum CardTap: Equatable, Sendable {
        case talk(String)
        case meet(String)
    }

    public static func cardTap(personaId: String, team: Set<String>) -> CardTap {
        team.contains(personaId) ? .talk(personaId) : .meet(personaId)
    }

    /// Who's on the team: everyone the relationship has reached, plus everyone
    /// the plan includes. Ids are PersonaRegistry ids ("maya", not "maya-santos").
    public static func evaluate(
        stage currentStage: RelationshipStage,
        stageProgress: Double,
        plan: SubscriptionTier
    ) -> (unlocked: Set<String>, statuses: [String: MemberUnlockStatus]) {
        var newUnlocked: Set<String> = []
        var newStatuses: [String: MemberUnlockStatus] = [:]

        for member in allMembers {
            let stageReached = currentStage.ordinal >= member.unlocksAt.ordinal
            let isUnlocked = stageReached || plan.availablePersonas.contains(member.id)

            if isUnlocked {
                newUnlocked.insert(member.id)
            }

            // Calculate progress toward unlock
            let progress: Double
            if isUnlocked {
                progress = 1.0
            } else if member.unlocksAt.ordinal == currentStage.ordinal + 1 {
                // Next to unlock - show actual progress
                progress = stageProgress
            } else {
                progress = 0.0
            }

            let lockReason = isUnlocked ? nil : getLockReason(member: member, currentStage: currentStage)
            let unlockHint = isUnlocked ? nil : getUnlockHint(member: member, currentStage: currentStage)

            newStatuses[member.id] = MemberUnlockStatus(
                unlocked: isUnlocked,
                progress: progress,
                lockReason: lockReason,
                unlockHint: unlockHint
            )
        }
        return (newUnlocked, newStatuses)
    }

    private static func getLockReason(member: TeamMemberConfig, currentStage: RelationshipStage) -> String {
        if PaidPlans.isOffered && member.isPremium && member.unlocksAt.ordinal > currentStage.ordinal {
            return "Partner tier or \(member.unlocksAt.title)"
        }
        return "Unlocks at \(member.unlocksAt.title)"
    }
    
    private static func getUnlockHint(member: TeamMemberConfig, currentStage: RelationshipStage) -> String {
        let stagesAway = member.unlocksAt.ordinal - currentStage.ordinal
        if stagesAway == 1 {
            return "Almost there! Keep talking to Ferni."
        } else if stagesAway == 2 {
            return "A few more conversations and you'll meet \(member.displayName)."
        } else {
            return member.teaserMessage
        }
    }
}

// MARK: - Supporting Types

public struct TeamMemberConfig: Identifiable, Sendable {
    public let id: String
    public let displayName: String
    public let role: String
    public let description: String
    public let unlocksAt: RelationshipStage
    public let introMessage: String
    public let teaserMessage: String
    public var isPremium: Bool = false
}

public struct MemberUnlockStatus: Equatable, Sendable {
    public let unlocked: Bool
    public let progress: Double
    public let lockReason: String?
    public let unlockHint: String?
}
