import Foundation
import SwiftUI
import FerniShared

// MARK: - Team Unlock Service
/// Manages team member unlock state based on relationship with Ferni.
/// Philosophy: "Get to know Ferni first" - Team unlocks naturally as your friendship deepens.

public class TeamUnlockService: ObservableObject {
    
    // MARK: - Singleton
    
    public static let shared = TeamUnlockService()
    
    // MARK: - Published State
    
    @Published public private(set) var unlockedMembers: Set<String> = ["ferni"]
    @Published public private(set) var memberStatuses: [String: MemberUnlockStatus] = [:]
    
    // MARK: - Dependencies
    
    private let relationshipService = RelationshipArcService.shared
    
    // MARK: - Team Member Definitions
    
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
            id: "maya-santos",
            displayName: "Maya",
            role: "Habits Coach",
            description: "Helps you build habits that stick.",
            unlocksAt: .gettingStarted,
            introMessage: "I want you to meet Maya. She's incredible at habits.",
            teaserMessage: "I have a friend who's amazing at habits... once we talk more, I'll introduce you."
        ),
        TeamMemberConfig(
            id: "peter-john",
            displayName: "Peter",
            role: "The Quant",
            description: "Spots patterns nobody else sees.",
            unlocksAt: .buildingTrust,
            introMessage: "You're ready for Peter. He sees patterns most people miss.",
            teaserMessage: "Peter can show you incredible patterns, but I need to know you better first."
        ),
        TeamMemberConfig(
            id: "alex-chen",
            displayName: "Alex",
            role: "Chief of Staff",
            description: "Communication coach. Helps you say what you mean.",
            unlocksAt: .established,
            introMessage: "Alex is going to change how you communicate.",
            teaserMessage: "There's someone who can transform your communication... keep talking to me."
        ),
        TeamMemberConfig(
            id: "jordan-taylor",
            displayName: "Jordan",
            role: "Lifetime Planner",
            description: "Turns vague dreams into lived experiences.",
            unlocksAt: .established,
            introMessage: "Jordan helps people turn dreams into actual plans.",
            teaserMessage: "I know someone who can help you plan your whole life... soon."
        ),
        TeamMemberConfig(
            id: "nayan-patel",
            displayName: "Nayan",
            role: "The Sage",
            description: "Small, consistent actions create extraordinary results.",
            unlocksAt: .deepPartnership,
            introMessage: "Nayan is the wisest person I know. You've earned this.",
            teaserMessage: "The sage only speaks to those who've proven their commitment.",
            isPremium: true
        ),
    ]
    
    // MARK: - Initialization
    
    private init() {
        evaluateUnlocks()
        
        // Listen for relationship changes
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(relationshipStageChanged),
            name: NSNotification.Name("RelationshipStageChanged"),
            object: nil
        )
    }
    
    // MARK: - Public API
    
    /// Check if a specific team member is unlocked
    public func isUnlocked(_ personaId: String) -> Bool {
        return unlockedMembers.contains(personaId)
    }
    
    /// Get the config for a team member
    public func getMemberConfig(_ personaId: String) -> TeamMemberConfig? {
        return Self.allMembers.first { $0.id == personaId }
    }
    
    /// Get unlock status for a member
    public func getStatus(_ personaId: String) -> MemberUnlockStatus {
        return memberStatuses[personaId] ?? MemberUnlockStatus(unlocked: false, progress: 0, lockReason: "Unknown", unlockHint: nil)
    }
    
    /// Get the next member to be unlocked
    public func getNextUnlock() -> TeamMemberConfig? {
        let currentStage = relationshipService.currentStage
        return Self.allMembers.first { member in
            !unlockedMembers.contains(member.id) &&
            member.unlocksAt.ordinal == currentStage.ordinal + 1
        }
    }
    
    /// Force refresh unlock state (call after subscription changes)
    public func refreshUnlocks() {
        evaluateUnlocks()
    }
    
    // MARK: - Private
    
    @objc private func relationshipStageChanged() {
        evaluateUnlocks()
    }
    
    private func evaluateUnlocks() {
        let currentStage = relationshipService.currentStage
        var newUnlocked: Set<String> = []
        var newStatuses: [String: MemberUnlockStatus] = [:]
        
        for member in Self.allMembers {
            let stageReached = currentStage.ordinal >= member.unlocksAt.ordinal
            let isUnlocked = stageReached
            
            if isUnlocked {
                newUnlocked.insert(member.id)
            }
            
            // Calculate progress toward unlock
            let progress: Double
            if isUnlocked {
                progress = 1.0
            } else if member.unlocksAt.ordinal == currentStage.ordinal + 1 {
                // Next to unlock - show actual progress
                progress = relationshipService.stageProgress
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
        
        DispatchQueue.main.async {
            self.unlockedMembers = newUnlocked
            self.memberStatuses = newStatuses
        }
    }
    
    private func getLockReason(member: TeamMemberConfig, currentStage: RelationshipStage) -> String {
        if member.isPremium && member.unlocksAt.ordinal > currentStage.ordinal {
            return "Partner tier or \(member.unlocksAt.title)"
        }
        return "Unlocks at \(member.unlocksAt.title)"
    }
    
    private func getUnlockHint(member: TeamMemberConfig, currentStage: RelationshipStage) -> String {
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

public struct TeamMemberConfig: Identifiable {
    public let id: String
    public let displayName: String
    public let role: String
    public let description: String
    public let unlocksAt: RelationshipStage
    public let introMessage: String
    public let teaserMessage: String
    public var isPremium: Bool = false
}

public struct MemberUnlockStatus {
    public let unlocked: Bool
    public let progress: Double
    public let lockReason: String?
    public let unlockHint: String?
}
