import FerniKit
import XCTest
@testable import Ferni

/// The app's own doors: every way to start talking passes consent, and a new
/// person on the phone starts clean.
@MainActor
final class AppModelTests: XCTestCase {
    private func model() -> AppModel {
        let model = AppModel(config: .production, firebaseReady: false)
        model.consent.use(uid: nil)
        return model
    }

    func testSiriOrControlCenterAsksForConsentFirst() {
        let model = model()
        model.talk(to: "ferni")
        XCTAssertTrue(model.isAskingConsent, "no call before consent")
        XCTAssertFalse(model.call.isActive)
    }

    func testATeammateNotOnTheTeamMeansFerniAnswers() {
        let model = model()
        model.talk(to: "nayan")
        XCTAssertEqual(model.team.chosen, "ferni")
    }

    func testAnotherPersonSigningInClearsTheLastOne() {
        let model = model()
        model.accountChanged(from: nil, to: "a")
        model.team.choose("ferni")
        model.accountChanged(from: "a", to: "b")
        XCTAssertTrue(model.memory.notes.isEmpty)
        XCTAssertEqual(model.team.unlocked, ["ferni"])
        XCTAssertNil(model.call.startedAt)
        XCTAssertEqual(model.consent.uid, "b")
    }
}
