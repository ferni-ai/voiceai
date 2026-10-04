import FerniShared
import XCTest
@testable import FerniVoice

/// Who's on the team: the relationship stage, or the plan.
final class TeamUnlockTests: XCTestCase {

    /// The picker asks TeamUnlockService about PersonaRegistry ids. Every one of
    /// them must have a config, or that teammate can never be unlocked.
    func testEveryPersonaInThePickerHasAnUnlockConfig() {
        for persona in PersonaRegistry.all {
            XCTAssertNotNil(
                TeamUnlockService.shared.getMemberConfig(persona.id),
                "no unlock config for \(persona.id)"
            )
        }
    }

    func testStageAloneUnlocksTeammatesAsTheRelationshipGrows() {
        let early = TeamUnlockService.evaluate(stage: .firstMeeting, stageProgress: 0.4, plan: .free)
        XCTAssertEqual(early.unlocked, ["ferni"])
        XCTAssertEqual(early.statuses["maya"]?.progress, 0.4, "Maya is next, so she shows real progress")

        let later = TeamUnlockService.evaluate(stage: .gettingStarted, stageProgress: 0, plan: .free)
        XCTAssertTrue(later.unlocked.contains(PersonaRegistry.maya.id))
        XCTAssertFalse(later.unlocked.contains(PersonaRegistry.peter.id))
    }

    func testTheFriendPlanBringsEveryoneButNayan() {
        let team = TeamUnlockService.evaluate(stage: .firstMeeting, stageProgress: 0, plan: .friend)
        XCTAssertEqual(team.unlocked, ["ferni", "maya", "peter", "alex", "jordan"])
        XCTAssertEqual(team.statuses["nayan"]?.unlocked, false)
    }

    func testThePartnerPlanBringsEveryone() {
        let team = TeamUnlockService.evaluate(stage: .firstMeeting, stageProgress: 0, plan: .partner)
        XCTAssertEqual(team.unlocked, Set(PersonaRegistry.all.map(\.id)))
    }
}
