import XCTest

/// Item 8: Apple's accessibility audit on every main screen, at the default
/// text size and at AX5, and the Reduce Motion and Reduce Transparency paths.
@MainActor
final class AccessibilityAuditTests: XCTestCase {
    override func setUp() { continueAfterFailure = true }

    private func audit(_ screen: Screen, size: TextSize, hour: Int? = nil, extra: [String] = []) throws {
        let app = XCUIApplication.ferni(screen, size: size, hour: hour, extra: extra)
        XCTAssertTrue(screen.ready(in: app).waitForExistence(timeout: 20), "\(screen) never appeared")
        // " ipad" last, so an allowance can name a finding seen only there.
        let name = "\(screen) \(size)" + (hour.map { " \($0)h" } ?? "") + (extra.isEmpty ? "" : " " + extra.joined(separator: " "))
            + (UIDevice.current.userInterfaceIdiom == .pad ? " ipad" : "")
        try XCTContext.runActivity(named: name) { _ in try auditTwice(app, name: name) }
        app.terminate()
    }

    /// The audit, with one allowance. A finding with no element is held back,
    /// not passed: a row sitting across the screen's bottom edge yields one
    /// whose type changes as the row moves (Settings, design audit P2 #9: a
    /// contrast finding with the Privacy link at 873 pt, Dynamic Type with it
    /// 35 pt higher, none in the old order). The screen is nudged once, 120 pt,
    /// and audited again: a no-element finding of the same type in both
    /// positions fails. Only one nudge, never a search for a passing position,
    /// and only on a screen the nudge actually scrolls (otherwise they fail).
    /// Every finding waved through is printed and kept as an attachment
    /// ("audit-waved-through …") for a reviewer; testTheGateStillFails proves a
    /// faint unlabelled line mid-screen still fails.
    private func auditTwice(_ app: XCUIApplication, name: String) throws {
        var held: [Unnamed] = [], cut: [Named] = []
        let floor = Self.floorTop(app)
        try app.performAccessibilityAudit(for: .all) { issue in
            if let element = issue.element {
                // Text running under the floor (the fade behind Talk) is read in
                // full once scrolled up; it's audited there (see underTheFloor).
                if issue.auditType == .contrast, element.frame.minY < floor, element.frame.maxY > floor, !element.label.isEmpty {
                    cut.append(Named(issue, label: element.label))
                    return true
                }
                return Self.handle(issue, on: name)
            }
            held.append(Unnamed(issue))
            return true
        }
        try underTheFloor(app, cut: cut, floor: floor, name: name)
        guard !held.isEmpty else { return }
        // Only a screen that scrolls has a second position (critic M2): if the
        // nudge moves nothing, every held finding fails where it stands.
        let texts = app.staticTexts.allElementsBoundByIndex.prefix(12)
        let before = texts.map(\.frame)
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6))
        start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -120)))
        sleep(1)
        let moved = zip(before, texts.map { $0.exists ? $0.frame : .zero }).contains { abs($0.minY - $1.minY) > 20 }
        guard moved else {
            for h in held { XCTFail("AUDIT [\(name)] no element, and the screen doesn't scroll: \(h.what)") }
            return
        }
        var again: [Unnamed] = []
        try app.performAccessibilityAudit(for: .all) { issue in
            guard issue.element == nil else { return true } // the first pass judged the named ones
            again.append(Unnamed(issue))
            return true
        }
        let verdict = Self.nudgeVerdict(held: held, again: again)
        for f in verdict.failing { XCTFail("AUDIT [\(name)] no element, in both positions: \(f.what)") }
        guard !verdict.waved.isEmpty else { return }
        let report = verdict.waved.map { "AUDIT-WAVED [\(name)] no element (frame unknown) \($0)" }.joined(separator: "\n")
        print(report)
        let attachment = XCTAttachment(string: report)
        attachment.name = "audit-waved-through \(name)"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    /// The top of the floor: the fade behind Talk starts a little above it.
    static func floorTop(_ app: XCUIApplication) -> CGFloat {
        let talk = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Talk'")).firstMatch
        return talk.exists ? talk.frame.minY - 24 : app.frame.maxY
    }

    /// Contrast findings on text cut off by the floor (award upgrade 2: a long
    /// note at AX5 runs from mid-screen into the fade behind Talk, and the audit
    /// reads the faded part). Each is scrolled up once, just enough to clear the
    /// floor, and audited there: the same finding on the same text, in full
    /// view, fails. Waved ones are printed and attached, like the nudge's.
    private func underTheFloor(_ app: XCUIApplication, cut: [Named], floor: CGFloat, name: String) throws {
        var waved: [String] = []
        for finding in cut {
            let text = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", finding.label)).firstMatch
            let lift = text.frame.maxY - floor + 24
            if lift > 0 {
                let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6))
                start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -lift)))
                sleep(1)
            }
            var again: [Named] = []
            try app.performAccessibilityAudit(for: [.contrast]) { issue in
                if let element = issue.element, !element.label.isEmpty { again.append(Named(issue, label: element.label)) }
                return true
            }
            let verdict = Self.floorVerdict(cut: [finding], again: again, clear: text.frame.maxY <= floor + 1)
            for f in verdict.failing { XCTFail("AUDIT [\(name)] \(f)") }
            waved += verdict.waved.map { "AUDIT-WAVED [\(name)] \($0)" }
        }
        guard !waved.isEmpty else { return }
        print(waved.joined(separator: "\n"))
        let attachment = XCTAttachment(string: waved.joined(separator: "\n"))
        attachment.name = "audit-waved-through floor \(name)"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    /// The floor rule: a finding cut off by the floor fails if the same text
    /// fails the same check in full view, or if it couldn't be brought into
    /// full view at all.
    nonisolated static func floorVerdict(cut: [Named], again: [Named], clear: Bool) -> (failing: [String], waved: [String]) {
        var failing: [String] = [], waved: [String] = []
        for f in cut {
            if !clear {
                failing.append("cut off by the floor and couldn't be scrolled clear: \(f.what)")
            } else if again.contains(where: { $0.type == f.type && $0.label == f.label }) {
                failing.append("in full view too: \(f.what)")
            } else {
                waved.append("under the floor only, passes in full view: \(f.what)")
            }
        }
        return (failing, waved)
    }

    /// The floor rule itself: in full view it's judged like any other text.
    func testTextCutOffByTheFloorIsJudgedInFullView() {
        let contrast = XCUIAccessibilityAuditType.contrast.rawValue
        let note = Named(type: contrast, label: "a long note", what: "a long note")
        XCTAssertEqual(Self.floorVerdict(cut: [note], again: [note], clear: true).failing.count, 1, "faint in full view fails")
        XCTAssertEqual(Self.floorVerdict(cut: [note], again: [], clear: false).failing.count, 1, "never brought clear fails")
        let fine = Self.floorVerdict(cut: [note], again: [Named(type: contrast, label: "other", what: "other")], clear: true)
        XCTAssertTrue(fine.failing.isEmpty, "passing in full view is the floor's fade, not the text")
        XCTAssertEqual(fine.waved.count, 1, "and it's listed")
    }

    /// A finding on a labelled element: its type, the label and what the audit said.
    struct Named {
        let type: UInt64, label: String, what: String
        init(type: UInt64, label: String, what: String) { self.type = type; self.label = label; self.what = what }
        init(_ issue: XCUIAccessibilityAuditIssue, label: String) {
            self.init(type: issue.auditType.rawValue, label: label,
                      what: "\(issue.compactDescription): '\(label)' | \(issue.detailedDescription)")
        }
    }

    /// A finding with no element: its type and what the audit said.
    struct Unnamed {
        let type: UInt64
        let what: String
        init(type: UInt64, what: String) { self.type = type; self.what = what }
        init(_ issue: XCUIAccessibilityAuditIssue) {
            self.init(type: issue.auditType.rawValue, what: "\(issue.compactDescription) | \(issue.detailedDescription)")
        }
    }

    /// The one allowance, as a rule: a no-element finding fails if its type is
    /// there both before and after the nudge; the rest are waved through, and
    /// listed so they can be read.
    nonisolated static func nudgeVerdict(held: [Unnamed], again: [Unnamed]) -> (failing: [Unnamed], waved: [String]) {
        let failing = again.filter { a in held.contains { $0.type == a.type } }
        let waved = held.filter { h in !again.contains { $0.type == h.type } }.map { "before the nudge, gone after: \($0.what)" }
            + again.filter { a in !held.contains { $0.type == a.type } }.map { "only after the nudge: \($0.what)" }
        return (failing, waved)
    }

    /// The rule itself: in both positions fails; in one is waved through and listed.
    func testANoElementFindingThatStaysFails() {
        let contrast = XCUIAccessibilityAuditType.contrast.rawValue, type = XCUIAccessibilityAuditType.dynamicType.rawValue
        let stays = Self.nudgeVerdict(held: [Unnamed(type: contrast, what: "a")], again: [Unnamed(type: contrast, what: "a")])
        XCTAssertEqual(stays.failing.count, 1, "the same type in both positions fails")
        XCTAssertTrue(stays.waved.isEmpty)
        let moves = Self.nudgeVerdict(held: [Unnamed(type: contrast, what: "edge row")], again: [Unnamed(type: type, what: "edge row")])
        XCTAssertTrue(moves.failing.isEmpty, "a type that changes with position is the edge, not the screen")
        XCTAssertEqual(moves.waved, ["before the nudge, gone after: edge row", "only after the nudge: edge row"], "and it's listed")
    }

    /// The gate can still go red: a faint (near-white on paper), unlabelled line
    /// mid-screen, which a nudge can't carry off an edge, fails the audit.
    func testTheGateStillFails() throws {
        var seen: [String] = []
        let options = XCTExpectedFailure.Options()
        options.issueMatcher = { issue in seen.append(issue.compactDescription); return true }
        XCTExpectFailure("the audit must fail on the faint fixture", options: options) {
            try? audit(.home, size: .standard, extra: ["-FerniAuditFixture", "YES"])
        }
        XCTAssertTrue(seen.contains { $0.contains("Contrast") }, "a contrast failure on the faint line: \(seen)")
        XCTAssertTrue(seen.contains { $0.contains("no description") || $0.contains("Element has no description") },
                      "and on the nameless one: \(seen)")
    }

    /// Audit findings checked by hand and found not to be problems, each for one
    /// element on one screen, so anything else on that element still fails.
    nonisolated static let accepted: [(screen: String, type: XCUIAccessibilityAuditType, label: String, why: String)] = [
        ("consent", .textClipped, "When we talk",
         "Two paragraphs in one Text; the screenshot at the default size shows every line in full (2026-10-19)."),
        ("settings", .dynamicType, "Done",
         "A system toolbar button: bar buttons stop growing by design and show the Large Content Viewer instead."),
        ("signIn", .dynamicType, "Cancel",
         "The sign-in sheet's system toolbar button, like Settings' Done: the Large Content Viewer instead."),
        ("settings", .dynamicType, "Privacy",
         "Same SettingsHeader as Account, which the AX5 screenshot shows at full size."),
        ("settings", .dynamicType, "Lock what Ferni remembers",
         "A system Toggle row, like Call sounds, which the AX5 screenshot shows at full size."),
        ("settings", .dynamicType, "You haven't agreed",
         "A plain Text row, like the account message the AX5 screenshot shows at full size."),
        ("settings", .dynamicType, "Ferni can't reach your account",
         "The account message, a plain Text row: the same audit at AX5 doesn't flag it, and the AX5 screenshot shows the section's message at full size. Flagged on the SE at the default size only, once Help joined the first section (2026-10-20)."),
        // iPad (2026-10-19), measured from the screenshot pixels with WCAG luminance. The sidebar
        // rows' contrast findings (and the unnamed ones, two to four a launch) went away when the
        // sidebar got an opaque background (2026-10-20); none are accepted any more.
        ("call", .contrast, "Ferni · ", "Name chip: #5c544a on #f7f5ee, 6.8:1 (caption text needs 4.5)."),
        ("onHold standard ipad", .contrast, "On hold",
         "The call's state line in medium secondary ink: #5c544a on #f2ebdf, 6.3:1 measured from the iPad screenshot (2026-10-20); flagged on iPad only (this entry matches only there), where \"Reconnecting…\" in the same place passes."),
        ("home|call|team|connecting|reconnecting|onHold|failed", .textClipped, "#sidebar.talk", "iPad sidebar row (that row only, by identifier): the AX5 screenshot shows the full word."),
        ("home|call|team|connecting|reconnecting|onHold|failed", .textClipped, "#sidebar.remembers", "iPad sidebar row (that row only, by identifier): wraps to three full lines at AX5 (screenshot)."),
        // Home once you've talked, on iPad only (these entries match only there), 2026-10-20: the
        // audit fails the follow-up line and the team's names, though the screenshot's pixels
        // measure #5c544a on #faf8f5, 7.0:1, and the chosen name #2c2520, 14.2:1 (WCAG luminance;
        // voiceai-evidence/ios-design-audit-2026-10-20/fixes/award-upgrade-2-team-row). The same lines pass on every iPhone,
        // and the same line without the follow-up passes on iPad.
        ("home standard 14h -FerniStoreData YES ipad", .contrast, "#home.detail", "Follow-up line: 7.0:1 measured on the iPad screenshot."),
        ("home standard 14h -FerniStoreData YES ipad", .contrast, "#team.name.ferni", "Chosen name: 14.2:1 measured on the iPad screenshot."),
        ("home standard 14h -FerniStoreData YES ipad", .contrast, "#team.name.maya", "Name: 7.0:1 measured on the iPad screenshot."),
        ("home standard 14h -FerniStoreData YES ipad", .contrast, "#team.name.alex", "Name: 7.0:1 measured on the iPad screenshot."),
        ("home standard 14h -FerniStoreData YES ipad", .contrast, "#team.name.jordan", "Name: 7.0:1 measured on the iPad screenshot."),
        ("home standard 14h -FerniStoreData YES ipad", .contrast, "#team.name.peter", "Name: 7.0:1 measured on the iPad screenshot."),
        ("settings", .dynamicType, "Try again", "A system List button row; it scales at AX5 like the other rows."),
        ("settings", .dynamicType, "Get help with your account",
         "Account footer link; HelpLinksUITests.testAccountHelpGrowsWithTextSize proves it grows at AX5 (pinned, it stays 34 pt and fails)."),
    ]

    /// Every issue fails the test, named with its element so the log says what
    /// to fix. The 1-pt probe exists only in UI-test launches and is skipped.
    nonisolated static func handle(_ issue: XCUIAccessibilityAuditIssue, on screen: String) -> Bool {
        let element = issue.element
        if element?.identifier.hasPrefix("uitest.") == true { return true }
        // An entry is a label prefix, or "#identifier" for exactly one element.
        if let element, accepted.contains(where: {
            $0.screen.split(separator: "|").contains { screen.hasPrefix($0) } && issue.auditType == $0.type
                && ($0.label.hasPrefix("#") ? element.identifier == String($0.label.dropFirst()) : element.label.hasPrefix($0.label))
        }) { return true }
        print("AUDIT [\(screen)] \(issue.compactDescription): \(element.map { "\($0.elementType.rawValue) '\($0.label)' id='\($0.identifier)' \($0.frame)" } ?? "no element") | \(issue.detailedDescription)")
        return false
    }

    /// Home's room is lit by the hour (RoomLight), so it's audited in every
    /// band, at a fixed hour each, instead of whenever the gate happens to run.
    static let roomLightBands = [("morning", 8), ("day", 14), ("evening", 20), ("night", 2)]

    func testHome() throws {
        for (_, hour) in Self.roomLightBands {
            try audit(.home, size: .standard, hour: hour)
            try audit(.home, size: .ax5, hour: hour)
        }
    }
    /// Home as it is once you've talked (award upgrade 2): a thread card, a
    /// note and your team under Ferni.
    func testHomeWithStoreData() throws {
        try audit(.home, size: .standard, hour: 14, extra: ["-FerniStoreData", "YES"])
        try audit(.home, size: .ax5, hour: 14, extra: ["-FerniStoreData", "YES"])
    }
    func testConsent() throws { try audit(.consent, size: .standard); try audit(.consent, size: .ax5) }
    func testSettings() throws { try audit(.settings, size: .standard); try audit(.settings, size: .ax5) }
    func testCall() throws { try audit(.call, size: .standard); try audit(.call, size: .ax5) }
    func testWaitlist() throws { try audit(.waitlist, size: .standard); try audit(.waitlist, size: .ax5) }
    /// Calling, reconnecting, on hold and failed (design audit P2 #20).
    func testCallStates() throws {
        for screen in [Screen.connecting, .reconnecting, .onHold, .failed] {
            try audit(screen, size: .standard)
            try audit(screen, size: .ax5)
        }
    }

    /// The overrides reach the views (so the snapshots below show those paths),
    /// and an ordinary launch doesn't have them.
    /// The team (design audit P1-15): teammates you haven't met yet are read as
    /// information in the secondary text colour, not a greyed-out button.
    func testTeam() throws {
        for size in [TextSize.standard, .ax5] {
            let pad = UIDevice.current.userInterfaceIdiom == .pad
            let app = XCUIApplication.ferni(pad ? .home : .settings, size: size)
            let way = pad ? app.staticTexts["Team"].firstMatch : app.buttons["Your team"].firstMatch
            XCTAssertTrue(way.waitForExistence(timeout: 20), "no way to the team")
            way.tap()
            let notYet = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'team.notYet.'")).firstMatch
            XCTAssertTrue(notYet.waitForExistence(timeout: 5), "a teammate not met yet")
            XCTAssertEqual(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'team.notYet.'")).count, 0, "not a button")
            let name = "team \(size)"
            try XCTContext.runActivity(named: name) { _ in
                try app.performAccessibilityAudit(for: .all) { Self.handle($0, on: name) }
            }
            app.terminate()
        }
    }

    /// The sign-in sheet (design audit P1-6), opened from Home's offer.
    func testSignIn() throws {
        for size in [TextSize.standard, .ax5] {
            let app = XCUIApplication.ferni(.home, size: size, account: "anonymous")
            let offer = app.buttons["home.signIn"]
            XCTAssertTrue(offer.waitForExistence(timeout: 20), "Home's sign-in offer never appeared")
            offer.tap()
            XCTAssertTrue(app.textFields["Phone number"].waitForExistence(timeout: 5), "the sign-in sheet never appeared")
            let name = "signIn \(size)"
            try XCTContext.runActivity(named: name) { _ in
                try app.performAccessibilityAudit(for: .all) { Self.handle($0, on: name) }
            }
            app.terminate()
        }
    }

    func testReduceMotionAndTransparency() throws {
        let plain = XCUIApplication.ferni(.call)
        XCTAssertTrue(Screen.call.ready(in: plain).waitForExistence(timeout: 20))
        XCTAssertEqual(plain.receivedSettings, "reduceMotion=false reduceTransparency=false")
        plain.terminate()

        for (motion, transparency) in [(true, false), (false, true)] {
            for screen in [Screen.call, .home] {
                let app = XCUIApplication.ferni(screen, reduceMotion: motion, reduceTransparency: transparency, hour: 14)
                XCTAssertTrue(screen.ready(in: app).waitForExistence(timeout: 20), "\(screen)")
                XCTAssertEqual(app.receivedSettings, "reduceMotion=\(motion) reduceTransparency=\(transparency)")
                attachScreenshot("\(screen)-\(motion ? "reduce-motion" : "reduce-transparency")")
                try app.performAccessibilityAudit(for: .all) { Self.handle($0, on: "\(screen) motion=\(motion) transparency=\(transparency)") }
                app.terminate()
            }
        }
    }
}
