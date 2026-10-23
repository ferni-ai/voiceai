import XCTest

/// Trust panel R11 and R14: what Ferni remembers stays behind the lock on
/// every surface, and Forget clears it from every surface.
@MainActor
final class MemoryLockUITests: XCTestCase {
    private func launch(_ screen: Screen, locked: Bool) -> XCUIApplication {
        let lock = locked ? ["-ferni.memories.locked", "YES", "-FerniOwnerCheck", "pass"] : []
        return XCUIApplication.ferni(screen, extra: ["-FerniStoreData", "YES"] + lock)
    }

    private func text(_ app: XCUIApplication, containing words: String) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", words)).firstMatch
    }

    private static let followUp = "How's the garden going?"
    private static let note = "Sunday evenings"

    /// Locked: Home says only that Ferni left something. Unlocked, the words are back.
    func testLockedHomeShowsNoWordsOfYours() {
        let app = launch(.home, locked: true)
        XCTAssertTrue(Screen.home.ready(in: app).waitForExistence(timeout: 20))
        let locked = app.descendants(matching: .any)["memory.locked"].firstMatch
        XCTAssertTrue(locked.waitForExistence(timeout: 10), "the locked card")
        XCTAssertTrue(app.staticTexts["Ferni left you a note."].exists)
        XCTAssertFalse(app.staticTexts[Self.followUp].exists, "no follow-up in your words")
        XCTAssertFalse(text(app, containing: Self.note).exists, "no note")
        attachScreenshot("home-locked")
        app.buttons["Unlock with Face ID"].tap()
        XCTAssertTrue(app.staticTexts[Self.followUp].waitForExistence(timeout: 5), "unlocked, the follow-up")
        XCTAssertTrue(text(app, containing: Self.note).exists, "and the note")
        XCTAssertFalse(locked.exists)
    }

    /// Locked: the card after a call says only that Ferni kept something.
    func testLockedRememberCardShowsNothingKept() {
        let app = launch(.remember, locked: true)
        let locked = app.descendants(matching: .any)["memory.locked"].firstMatch
        XCTAssertTrue(locked.waitForExistence(timeout: 30), "the locked card")
        XCTAssertTrue(app.staticTexts["Ferni kept a few things from this call."].exists)
        XCTAssertFalse(app.staticTexts["I'll remember"].exists)
        XCTAssertFalse(app.buttons["remember.change"].exists)
        XCTAssertFalse(text(app, containing: "Ana").exists)
        attachScreenshot("remember-locked")
        app.buttons["Unlock with Face ID"].tap()
        XCTAssertTrue(app.staticTexts["I'll remember"].waitForExistence(timeout: 5), "unlocked, the card")
    }

    private func openMemories(_ app: XCUIApplication) {
        let open = app.buttons["home.memory"]
        XCTAssertTrue(open.waitForExistence(timeout: 10))
        open.tap()
        XCTAssertTrue(app.navigationBars["What Ferni remembers"].waitForExistence(timeout: 10))
    }

    private func forgetNote(containing words: String, in app: XCUIApplication) {
        let forget = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Forget:' AND label CONTAINS[c] %@", words)).firstMatch
        // The list builds only the rows on screen: the oldest notes are below the fold.
        _ = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Biscuit'")).firstMatch.waitForExistence(timeout: 10)
        for _ in 0..<8 where !(forget.exists && forget.isHittable) { app.collectionViews.firstMatch.swipeUp(velocity: .slow) }
        XCTAssertTrue(forget.exists, "Forget for \(words)")
        forget.tap()
        let confirm = app.sheets.buttons["Forget"].exists ? app.sheets.buttons["Forget"] : app.buttons["Forget"].firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        confirm.tap()
        XCTAssertTrue(forget.waitForNonExistence(timeout: 5), "\(words) left What Ferni remembers")
    }

    /// Forget in What Ferni remembers, and Home's follow-up and note made
    /// from those notes go too, without leaving the app.
    func testForgetClearsHome() {
        let app = launch(.home, locked: false)
        XCTAssertTrue(app.staticTexts[Self.followUp].waitForExistence(timeout: 20))
        XCTAssertTrue(text(app, containing: Self.note).exists)
        openMemories(app)
        forgetNote(containing: Self.note, in: app)
        forgetNote(containing: "garden", in: app)
        app.buttons["Done"].tap()
        XCTAssertTrue(text(app, containing: Self.note).waitForNonExistence(timeout: 10), "the note left Home")
        XCTAssertFalse(app.staticTexts[Self.followUp].exists, "the follow-up left Home")
        XCTAssertEqual(refreshes(app), "2", "Home's line asked for again after each forget")
    }

    private func refreshes(_ app: XCUIApplication) -> String {
        app.descendants(matching: .any)["uitest.forgetRefreshes"].firstMatch.value as? String ?? "missing"
    }

    /// Forget on the "I'll remember" card, and it's gone from the card and
    /// from What Ferni remembers.
    func testForgetOnTheCardClearsTheJournal() {
        let app = launch(.remember, locked: false)
        XCTAssertTrue(app.staticTexts["I'll remember"].waitForExistence(timeout: 30))
        let ana = app.buttons.matching(NSPredicate(format: "identifier == 'remember.change' AND label CONTAINS 'Ana'")).firstMatch
        XCTAssertTrue(ana.waitForExistence(timeout: 5))
        ana.tap()
        app.buttons["Forget"].tap()
        XCTAssertTrue(text(app, containing: "Ana").waitForNonExistence(timeout: 5), "gone from the card")
        XCTAssertEqual(refreshes(app), "1", "a forget on the card asks Home's line again too")
        openMemories(app)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Biscuit'")).firstMatch.waitForExistence(timeout: 10),
                      "the journal loaded")
        XCTAssertFalse(text(app, containing: "Ana").exists, "gone from What Ferni remembers")
    }
}
