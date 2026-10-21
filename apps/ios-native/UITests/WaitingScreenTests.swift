import XCTest

/// Talk for an account still on the waitlist (#1988, in the new app): the
/// scripted server refuses /token as the gate does and /api/waitlist/me says
/// where they stand. They see their place in line, never an error.
@MainActor
final class WaitingScreenTests: XCTestCase {
    func testTalkOnTheWaitlistShowsYourPlaceNotAnError() {
        let app = XCUIApplication.ferni(.waitlist)
        XCTAssertTrue(Screen.waitlist.ready(in: app).waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["You’re #432, about 4 waves away"].exists, "the place /me gave")
        XCTAssertTrue(app.descendants(matching: .any)["Your invite link, ready to share"].exists)
        XCTAssertTrue(app.buttons["Copy link"].exists)
        XCTAssertTrue(app.staticTexts["Each friend who joins moves you up a few days."].exists)
        XCTAssertFalse(app.buttons["Try again"].exists, "not an error")
        attachScreenshot("waitlist")
        app.buttons["Not now"].tap()
        XCTAssertTrue(Screen.home.ready(in: app).waitForExistence(timeout: 5), "Not now goes back to the room")
        XCTAssertFalse(Screen.waitlist.ready(in: app).exists)
    }

    /// Critic H1: someone not on the list (the server answers not_joined, as it
    /// does for every anonymous account) was told "I'll email you" with no email,
    /// no place and no way in. They're asked to sign in, which joins.
    func testNotOnTheListIsAskedToSignInNotPromisedAnEmail() {
        assertAskedToJoin(XCUIApplication.ferni(.waitlist, extra: ["-FerniWaitlistMe", "notJoined"]))
    }

    /// Critic round 2, H1: signed in but not on the list, one tap joins it
    /// (POST /api/waitlist/join), and their place shows.
    func testSignedInButNotOnTheListJoinsWithOneTap() {
        let app = XCUIApplication.ferni(.waitlist, account: "signedIn", extra: ["-FerniWaitlistMe", "notJoined"])
        XCTAssertTrue(app.staticTexts["Join the list"].firstMatch.waitForExistence(timeout: 20))
        XCTAssertFalse(app.staticTexts["Sign in to join the list"].exists, "already signed in")
        XCTAssertFalse(app.staticTexts["I’ll email you the moment your spot opens."].exists, "no promise before joining")
        app.buttons["Join the list"].tap()
        XCTAssertTrue(app.staticTexts["You’re #433, about 4 waves away"].waitForExistence(timeout: 10), "in line, with a place")
        XCTAssertTrue(app.buttons["Copy link"].exists, "and an invite link")
        attachScreenshot("waitlist-joined")
    }

    /// The same for an anonymous account whose place can't be read at all.
    func testAnAnonymousAccountIsAskedToSignIn() {
        assertAskedToJoin(XCUIApplication.ferni(.waitlist, account: "anonymous", extra: ["-FerniWaitlistMe", "none"]))
    }

    private func assertAskedToJoin(_ app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(app.staticTexts["Sign in to join the list"].waitForExistence(timeout: 20), file: file, line: line)
        XCTAssertFalse(app.staticTexts["You’re on the list"].exists, file: file, line: line)
        XCTAssertFalse(app.staticTexts["I’ll email you the moment your spot opens."].exists, "no email promise", file: file, line: line)
        XCTAssertFalse(app.buttons["Copy link"].exists, "no invite link to share", file: file, line: line)
        attachScreenshot("waitlist-join")
        app.buttons["Sign in"].firstMatch.tap()
        let apple = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Apple'")).firstMatch
        XCTAssertTrue(apple.waitForExistence(timeout: 5), "Sign in opens the sign-in sheet", file: file, line: line)
    }

    /// An admitted account's Talk goes straight into the call.
    func testAnAdmittedAccountNeverSeesIt() {
        let app = XCUIApplication.ferni(.call)
        XCTAssertTrue(Screen.call.ready(in: app).waitForExistence(timeout: 20))
        XCTAssertFalse(Screen.waitlist.ready(in: app).exists)
    }
}
