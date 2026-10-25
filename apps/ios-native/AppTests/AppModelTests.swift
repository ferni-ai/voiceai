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

    /// Critic H5: "I agree, let's talk" answers at once ("Calling…"), and if
    /// the account can't be set up the call says so instead of doing nothing.
    /// Consent is never recorded without an account.
    func testAgreeingWithoutAnAccountSaysSoInsteadOfDoingNothing() async {
        let model = model()
        await model.agreeAndTalk()
        XCTAssertTrue(model.call.isActive, "the tap shows the call starting")
        let deadline = ContinuousClock.now + .seconds(10)
        while model.call.phase != .failed(.notSignedIn), ContinuousClock.now < deadline {
            try? await Task.sleep(for: .milliseconds(20))
        }
        XCTAssertEqual(model.call.phase, .failed(.notSignedIn))
        XCTAssertFalse(model.consent.hasAgreed)
    }

    /// Critic H6: Siri, Control Center or a notification can launch the app
    /// cold and run before any view appears. The handlers are wired when the
    /// model is made, so the very first request is heard (and passes consent).
    func testAColdLaunchTalkRequestIsHeard() async throws {
        TalkIntent.handler = nil
        FerniAppDelegate.onTalk = nil
        let model = model()
        _ = try await TalkIntent(teammate: .ferni).perform()
        XCTAssertTrue(model.isAskingConsent, "the intent reached the model")

        model.isAskingConsent = false
        FerniAppDelegate.onTalk?()
        XCTAssertTrue(model.isAskingConsent, "the notification's Talk now reached the model")
    }
}

