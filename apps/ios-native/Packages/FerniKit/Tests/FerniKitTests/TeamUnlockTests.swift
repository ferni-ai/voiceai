import XCTest
@testable import FerniKit

/// Who's on the team: the relationship stage, or the plan.
final class TeamUnlockTests: XCTestCase {

    /// The picker asks TeamUnlock about PersonaRegistry ids. Every one of
    /// them must have a config, or that teammate can never be unlocked.
    func testEveryPersonaInThePickerHasAnUnlockConfig() {
        for persona in PersonaRegistry.all {
            XCTAssertNotNil(
                TeamUnlock.config(for: persona.id),
                "no unlock config for \(persona.id)"
            )
        }
    }

    func testStageAloneUnlocksTeammatesAsTheRelationshipGrows() {
        let early = TeamUnlock.evaluate(stage: .firstMeeting, stageProgress: 0.4, plan: .free)
        XCTAssertEqual(early.unlocked, ["ferni"])
        XCTAssertEqual(early.statuses["maya"]?.progress, 0.4, "Maya is next, so she shows real progress")

        let later = TeamUnlock.evaluate(stage: .gettingStarted, stageProgress: 0, plan: .free)
        XCTAssertTrue(later.unlocked.contains(PersonaRegistry.maya.id))
        XCTAssertFalse(later.unlocked.contains(PersonaRegistry.peter.id))
    }

    func testTheFriendPlanBringsEveryoneButNayan() {
        let team = TeamUnlock.evaluate(stage: .firstMeeting, stageProgress: 0, plan: .friend)
        XCTAssertEqual(team.unlocked, ["ferni", "maya", "peter", "alex", "jordan"])
        XCTAssertEqual(team.statuses["nayan"]?.unlocked, false)
    }

    func testThePartnerPlanBringsEveryone() {
        let team = TeamUnlock.evaluate(stage: .firstMeeting, stageProgress: 0, plan: .partner)
        XCTAssertEqual(team.unlocked, Set(PersonaRegistry.all.map(\.id)))
    }

    /// While Ferni is free, a locked teammate's reason is the relationship, never a plan.
    func testNoPlanInTheLockReasonWhilePaidPlansAreHidden() throws {
        try XCTSkipIf(PaidPlans.isOffered, "paid plans are on")
        let team = TeamUnlock.evaluate(stage: .firstMeeting, stageProgress: 0, plan: .free)
        let reason = try XCTUnwrap(team.statuses["nayan"]?.lockReason)
        XCTAssertFalse(reason.contains("Partner tier"), reason)
        XCTAssertEqual(reason, "Unlocks at \(RelationshipStage.deepPartnership.title)")
    }

    /// Stage order is by position, never by the raw string ("established" < "first-meeting").
    func testStagesOrderByRelationshipNotAlphabet() {
        XCTAssertEqual(RelationshipStage.allCases.map(\.ordinal), [0, 1, 2, 3, 4])
        XCTAssertLessThan(RelationshipStage.firstMeeting.ordinal, RelationshipStage.established.ordinal)
    }
}
