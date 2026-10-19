import FerniKit
import FerniVoice
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

    /// Critic L1: the next person is greeted as new without a relaunch.
    func testTheNextPersonIsGreetedAsNew() {
        UserDefaults.standard.set(true, forKey: "ferni.call.hasTalked")
        let model = model()
        XCTAssertTrue(model.call.hasTalked)
        model.accountChanged(from: "a", to: "b")
        XCTAssertFalse(model.call.hasTalked)
        XCTAssertEqual(RestingWords.words(home: nil, ended: false, hour: 20, hasTalked: model.call.hasTalked).headline, "Hi, I'm Ferni.")
    }

    /// Critic L2: a report goes to the session the line was heard in.
    func testAReportGoesToTheLinesOwnSession() {
        let model = model()
        var line = Caption(id: "ferni-1", speaker: .ferni, text: "Hello", isFinal: true)
        line.room = "ios-first"
        XCTAssertEqual(model.reportSession(for: line), "ios-first")
        line.room = nil
        XCTAssertEqual(model.reportSession(for: line), "unknown", "no room known and no call")
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

    /// Critic C3: notes from Ferni stay out of the binary until the server can
    /// deliver them; no ask, no device registration, no APNs entitlement.
    func testNotesFromFerniWaitForTheServerRoute() {
        XCTAssertFalse(FerniBuild.pushNotes, "the entitlement is checked on the signed build (codesign)")
    }

    /// The watch is a remote: its Talk goes through consent like the phone's,
    /// and Mute or End with no call do nothing.
    func testTheWatchsTalkGoesThroughConsent() {
        let model = model()
        WatchRemote.handle(.mute, model: model)
        WatchRemote.handle(.end, model: model)
        XCTAssertFalse(model.call.isActive)
        WatchRemote.handle(.talk, model: model)
        XCTAssertTrue(model.isAskingConsent, "no call before consent")
        XCTAssertFalse(model.call.isActive)
    }

    // MARK: - Critic M2: leaving ends the call

    /// Signing out, withdrawing consent or deleting the account mid-call ends
    /// the call first: no audio keeps flowing for someone who just left.
    func testSigningOutEndsALiveCall() async {
        let model = model()
        model.call.start()
        XCTAssertTrue(model.call.isActive)
        await model.signOut()
        XCTAssertFalse(model.call.isActive, "ended, then cleared for the next person")
    }

    func testWithdrawingConsentEndsALiveCall() async {
        let model = model()
        model.call.start()
        await model.withdrawConsent()
        XCTAssertEqual(model.call.phase, .ended)
        XCTAssertFalse(model.consent.hasAgreed)
    }

    func testDeletingTheAccountEndsALiveCallEvenIfTheServerSaysNo() async {
        let model = model()
        model.call.start()
        try? await model.deleteAccount()
        XCTAssertEqual(model.call.phase, .ended)
    }
}

