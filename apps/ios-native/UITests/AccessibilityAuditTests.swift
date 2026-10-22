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
    /// With `asking`, the default size's "at larger sizes" findings are kept
    /// (and returned) instead of failing: the AX5 launch answers them (see proveAtAX5).
    @discardableResult
    private func auditTwice(_ app: XCUIApplication, name: String, nudges: Bool = true, asking: Bool = false) throws -> [Named] {
        var held: [Unnamed] = [], cut: [Named] = [], asked: [Named] = []
        let (floor, pinned) = Self.floor(app)
        try app.performAccessibilityAudit(for: .all) { issue in
            if let element = issue.element {
                // Text running under the floor (the fade behind Talk), or for
                // clipping, across the screen's bottom edge, is read in full once
                // scrolled up; it's audited there (see underTheFloor). The pinned
                // button's own label is the floor, not text under it.
                if Self.cutByTheFloor(issue.auditType, element.frame, floor: floor), !element.label.isEmpty,
                   !pinned.insetBy(dx: -2, dy: -2).contains(element.frame), !Self.isAccepted(issue, on: name) {
                    cut.append(Named(issue, label: element.label))
                    return true
                }
                if asking, Self.askedAtLargerSizes.contains(issue.auditType), !element.label.isEmpty,
                   !Self.isAccepted(issue, on: name) {
                    asked.append(Named(issue, label: element.label, height: element.frame.height))
                    return true
                }
                return Self.handle(issue, on: name)
            }
            held.append(Unnamed(issue))
            return true
        }
        // The nudge first, from where the first pass was: the floor pass scrolls,
        // and before, the nudge's "second position" was the floor's (critic M-A).
        try nudge(app, held: held, name: name, allowed: nudges)
        try underTheFloor(app, cut: cut, floor: Self.floor(app).top, name: name)
        return asked
    }

    /// The bottom inset under the home indicator: clipped text this close to
    /// the screen's edge is the edge's, and is judged scrolled up.
    nonisolated static let edge: CGFloat = 34

    /// The home indicator's inset where it's measured against: 20 pt on iPad
    /// (a footer there sat 13 pt past an iPhone's 34), 34 on an iPhone that
    /// has one, none on a home-button iPhone (an SE: a sheet's last footer
    /// ends at the screen's edge, 667 pt, and the 34 kept it out of view).
    private func bottomInset(_ app: XCUIApplication) -> CGFloat {
        if pad { return 20 }
        let screen = app.windows.firstMatch.frame.size
        return screen.height / max(screen.width, 1) < 1.9 ? 0 : Self.edge
    }

    /// Contrast under the floor, and clipping across it or the screen's edge.
    nonisolated static func cutByTheFloor(_ type: XCUIAccessibilityAuditType, _ frame: CGRect, floor: CGFloat) -> Bool {
        switch type {
        case .contrast: frame.maxY > floor
        case .textClipped: frame.maxY > floor - edge
        default: false
        }
    }

    /// What the audit asks at the default size about larger sizes: "will not
    /// be able to change the font size" and "may be clipped at larger sizes".
    nonisolated static let askedAtLargerSizes: [XCUIAccessibilityAuditType] = [.dynamicType, .textClipped]

    /// The AX5 launch's answer to the default size's questions (critic H-C: a
    /// List section's footer flagged at the default size, never at AX5). Each
    /// text is scrolled into full view at AX5 and measured there. "Will not be
    /// able to change the font size" is answered by the size itself: it fails
    /// unless the text grew to 1.8 times its default height (a fixed or capped
    /// font doesn't). "May be clipped" fails if the audit flags it again in full
    /// view. Never in full view fails. Waved ones are printed and attached.
    ///
    /// Each proof starts on a fresh launch, before the AX5 audit's launch: the
    /// audit's nudges leave a list scrolled, and a list drops the rows it
    /// scrolled past (on an SE, Help's top rows were gone, and dragging back
    /// to the top didn't bring them back). A text not there after a scroll
    /// gets a fresh launch of its own.
    private func proveAtAX5(launch: () -> XCUIApplication, asked: [Named], name: String) throws {
        var waved: [String] = []
        var app = launch()
        var scrolled = false
        for q in asked {
            func find() -> XCUIElement {
                app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", q.label)).firstMatch
            }
            var text = find()
            // Not there after a scroll: it may be above, dropped. Start over.
            if !text.exists, scrolled {
                app.terminate()
                app = launch()
                scrolled = false
                text = find()
            }
            let bottom = Self.floor(app).top - bottomInset(app), top = app.frame.minY + 100
            func inView() -> Bool { text.exists && text.frame.minY >= top && text.frame.maxY <= bottom + 2 }
            var above = false
            for _ in 0..<12 where !inView() {
                // Up until it clears the bottom; down if a scroll carried it past
                // the top, also once the list has dropped it there (an SE's
                // Report footer went past and was gone, 2026-10-22).
                if text.exists { above = text.frame.minY < top }
                let lift = !text.exists ? (above ? -240 : 240) : above
                    ? -min(top - text.frame.minY + 24, 240) : min(max(text.frame.maxY - bottom + 24, 60), 240)
                let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
                start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -lift)),
                            withVelocity: 300, thenHoldForDuration: 0.3)
                scrolled = true
                sleep(1)
            }
            // Measured before the audit, which can scroll the list itself (an
            // SE's Report footer was in full view, then gone after it).
            let shown = inView(), height = text.exists ? text.frame.height : 0
            let at = text.exists ? "\(text.frame)" : "not on screen"
            let shot = XCTAttachment(screenshot: app.screenshot())
            var again: [Named] = []
            try app.performAccessibilityAudit(for: [.dynamicType, .textClipped]) { issue in
                if let element = issue.element, !element.label.isEmpty { again.append(Named(issue, label: element.label)) }
                return true
            }
            let verdict = Self.ax5Verdict(asked: q, again: again, inView: shown, height: height)
            if let failing = verdict.failing {
                XCTFail("AUDIT [\(name)] \(failing) (at \(at), full view \(top)–\(bottom))")
                shot.name = "ax5 \(name): \(q.label.prefix(40))"
                shot.lifetime = .keepAlways
                add(shot)
            }
            if let ok = verdict.waved { waved.append("AUDIT-WAVED [\(name)] \(ok)") }
        }
        app.terminate()
        guard !waved.isEmpty else { return }
        print(waved.joined(separator: "\n"))
        let attachment = XCTAttachment(string: waved.joined(separator: "\n"))
        attachment.name = "audit-waved-through ax5 \(name)"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    /// Asked at the default size, answered at AX5: never in full view fails;
    /// a font-size question fails unless it grew 1.8 times; a clipping question
    /// fails if it's flagged again in full view.
    nonisolated static func ax5Verdict(asked: Named, again: [Named], inView: Bool, height: CGFloat) -> (failing: String?, waved: String?) {
        if !inView { return ("asked at the default size, and couldn't be brought into full view at AX5: \(asked.what)", nil) }
        let grew = "\(Int(asked.height)) to \(Int(height)) pt"
        if asked.type == XCUIAccessibilityAuditType.dynamicType.rawValue {
            if height < asked.height * 1.8 { return ("asked at the default size, and at AX5 it didn't grow (\(grew)): \(asked.what)", nil) }
            return (nil, "grows at AX5 (\(grew)): \(asked.what)")
        }
        if again.contains(where: { $0.type == asked.type && $0.label == asked.label }) {
            return ("asked at the default size, and flagged at AX5 in full view too: \(asked.what)", nil)
        }
        return (nil, "not flagged at AX5 in full view (\(grew)): \(asked.what)")
    }

    /// The AX5 answer's rule: each way it can fail, and the one way it passes.
    func testADefaultSizeQuestionIsAnsweredAtAX5() {
        let type = XCUIAccessibilityAuditType.dynamicType.rawValue, clipped = XCUIAccessibilityAuditType.textClipped.rawValue
        let footer = Named(type: type, label: "a footer", what: "a footer", height: 36)
        XCTAssertNotNil(Self.ax5Verdict(asked: footer, again: [], inView: false, height: 120).failing, "never in full view fails")
        XCTAssertNotNil(Self.ax5Verdict(asked: footer, again: [], inView: true, height: 40).failing, "a fixed size fails")
        XCTAssertNotNil(Self.ax5Verdict(asked: footer, again: [], inView: true, height: 54).failing, "capped at xxxLarge fails (1.5x)")
        let grows = Self.ax5Verdict(asked: footer, again: [footer], inView: true, height: 120)
        XCTAssertNil(grows.failing, "a font size question is answered by the size")
        XCTAssertNotNil(grows.waved, "and it's listed")
        let row = Named(type: clipped, label: "a row", what: "a row", height: 20)
        XCTAssertNotNil(Self.ax5Verdict(asked: row, again: [row], inView: true, height: 63).failing, "clipped again in full view fails")
        XCTAssertNil(Self.ax5Verdict(asked: row, again: [footer], inView: true, height: 63).failing, "not clipped in full view passes")
        XCTAssertTrue(Self.cutByTheFloor(.textClipped, CGRect(x: 0, y: 887, width: 300, height: 63), floor: 956), "clipped at the edge")
        XCTAssertFalse(Self.cutByTheFloor(.textClipped, CGRect(x: 0, y: 400, width: 300, height: 63), floor: 956), "mid-screen isn't")
        XCTAssertFalse(Self.cutByTheFloor(.dynamicType, CGRect(x: 0, y: 900, width: 300, height: 63), floor: 956), "only contrast and clipping")
    }

    /// The one allowance for findings with no element: the screen is nudged
    /// exactly 120 pt, and the same type in both positions fails.
    private func nudge(_ app: XCUIApplication, held: [Unnamed], name: String, allowed: Bool) throws {
        guard !held.isEmpty else { return }
        guard allowed else {
            for h in held { XCTFail("AUDIT [\(name)] no element: \(h.what)") }
            return
        }
        // Only a screen that scrolls has a second position (critic M2): if the
        // nudge moves nothing, every held finding fails where it stands.
        let texts = app.staticTexts.allElementsBoundByIndex.prefix(12)
        let before = texts.map(\.frame)
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6))
        // Exactly 120 pt: a quick drag flung the list ~300 pt, a different second
        // position each run (critic H-A); slow and held, it stops where it's let go.
        start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -120)),
                    withVelocity: 200, thenHoldForDuration: 0.5)
        sleep(1)
        let moved = zip(before, texts.map { $0.exists ? $0.frame : .zero }).contains { abs($0.minY - $1.minY) > 20 }
        guard moved else {
            for h in held { XCTFail("AUDIT [\(name)] no element, and the screen doesn't scroll: \(h.what)") }
            keepScreenshot(app, "no element \(name)")
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
        if !verdict.failing.isEmpty { keepScreenshot(app, "no element \(name)") }
        guard !verdict.waved.isEmpty else { return }
        let report = verdict.waved.map { "AUDIT-WAVED [\(name)] no element (frame unknown) \($0)" }.joined(separator: "\n")
        print(report)
        let attachment = XCTAttachment(string: report)
        attachment.name = "audit-waved-through \(name)"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    /// A finding with no element has no element screenshot: the screen, for a reader.
    private func keepScreenshot(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    /// The top of the floor: the pinned button (Home's Talk, sign-in's "Text me
    /// a code") and the paper behind it, a little above the button.
    static func floor(_ app: XCUIApplication) -> (top: CGFloat, button: CGRect) {
        // By identifier: "Talk" matched "Talk about this" and iPad's sidebar row (critic L).
        // Hittable: Home's Talk stays in the tree under a sheet (Settings, Help),
        // and was taken for the sheet's floor, 136 pt up.
        let talk = app.buttons["home.talk"]
        let pinned = talk.exists && talk.isHittable ? talk : app.buttons["signIn.continue"]
        // 21 pt: the controls' top padding (FerniSpace.rest), which the fade
        // fills. At 24 the last row on iPad at AX5 (the team's "Peter") could
        // never be scrolled clear: the content ends 21 pt above the button.
        if pinned.exists && pinned.isHittable { return (pinned.frame.minY - 21, pinned.frame) }
        // A sheet that ends above the screen's bottom (iPad's form sheets):
        // its own bottom edge is where rows are cut off.
        let list = app.collectionViews.firstMatch
        if list.exists, list.isHittable, list.frame.height > 200, list.frame.maxY < app.frame.maxY - 1 {
            return (list.frame.maxY, .null)
        }
        return (app.frame.maxY, .null)
    }

    /// Contrast findings on text cut off by the floor or below it (award upgrade
    /// 2: a long note at AX5 runs from mid-screen into the fade behind Talk, and
    /// on an SE starts below it; the audit reads the floor, not the text). Each is scrolled up once, just enough to clear the
    /// floor, and audited there: the same finding on the same text, in full
    /// view, fails. Waved ones are printed and attached, like the nudge's.
    private func underTheFloor(_ app: XCUIApplication, cut: [Named], floor: CGFloat, name: String) throws {
        var waved: [String] = []
        for finding in cut {
            let text = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", finding.label)).firstMatch
            // In steps of at most 240 pt, held at the end so nothing flings past.
            let line = floor - (finding.type == XCUIAccessibilityAuditType.textClipped.rawValue ? Self.edge : 0)
            for _ in 0..<4 {
                let lift = min(text.frame.maxY - line + 24, 240)
                guard lift > 0 else { break }
                // In the text's own column (on iPad the sidebar takes the left),
                // a little above the floor, inside what scrolls.
                let x = text.exists ? text.frame.midX : app.frame.midX
                let start = app.coordinate(withNormalizedOffset: .zero)
                    .withOffset(CGVector(dx: x, dy: min(app.frame.height * 0.7, floor - 80)))
                start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -lift)),
                            withVelocity: 300, thenHoldForDuration: 0.3)
                sleep(1)
            }
            var again: [Named] = []
            try app.performAccessibilityAudit(for: [.contrast, .textClipped]) { issue in
                if let element = issue.element, !element.label.isEmpty { again.append(Named(issue, label: element.label)) }
                return true
            }
            let verdict = Self.floorVerdict(cut: [finding], again: again, clear: text.frame.maxY <= line + 1)
            for f in verdict.failing { XCTFail("AUDIT [\(name)] \(f) (at \(text.frame), floor \(line))") }
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

    /// The whole floor path can go red: a faint line planted a screen below the
    /// floor on Home is scrolled into full view, is still faint, and fails.
    func testTheFloorRuleStillFails() throws {
        var seen: [String] = []
        let options = XCTExpectedFailure.Options()
        options.issueMatcher = { issue in seen.append(issue.compactDescription); return true }
        XCTExpectFailure("the floor rule must fail the faint planted line", options: options) {
            try? audit(.home, size: .standard, extra: ["-FerniFloorFixture", "YES"])
        }
        XCTAssertTrue(seen.contains { $0.contains("in full view too") && $0.contains("faint words under the floor") },
                      "failed in full view: \(seen)")
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
        let type: UInt64, label: String, what: String, height: CGFloat
        init(type: UInt64, label: String, what: String, height: CGFloat = 0) {
            self.type = type; self.label = label; self.what = what; self.height = height
        }
        init(_ issue: XCUIAccessibilityAuditIssue, label: String, height: CGFloat = 0) {
            self.init(type: issue.auditType.rawValue, label: label,
                      what: "\(issue.compactDescription): '\(label)' | \(issue.detailedDescription)", height: height)
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
        ("more|memory", .dynamicType, "Done",
         "The More sheet's and the memory journal's system toolbar button, like Settings' Done: the Large Content Viewer instead."),
        ("report", .dynamicType, "Cancel", "The report sheet's system toolbar button, like sign-in's Cancel."),
        ("report", .dynamicType, "Send", "The report sheet's system toolbar button, like Settings' Done."),
        ("report", .textClipped, "Cancel",
         "The same toolbar button at AX5: bar buttons keep their size and show the Large Content Viewer, so the audit reads the word as cut."),
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
        ("home|call|team|connecting|reconnecting|onHold|failed|remember", .textClipped, "#sidebar.talk", "iPad sidebar row (that row only, by identifier): the AX5 screenshot shows the full word."),
        ("home|call|team|connecting|reconnecting|onHold|failed|remember", .textClipped, "#sidebar.remembers", "iPad sidebar row (that row only, by identifier): wraps to three full lines at AX5 (screenshot)."),
        ("remember ax5 14h ipad", .contrast, "Peter",
         "The audit names a \"Peter\" at y 1326, under Talk and past the screen's edge, which the AX5 screenshot doesn't show; the visible Peter, under his face in the shelf, sits whole above the floor (2026-10-21) and the same card passes on both iPhones."),
        ("waitlist join standard ipad", .contrast, "I’m letting people",
         "The join line in secondary ink: #5c544a on #faf8f5, 7.0:1 measured from the iPad screenshot (2026-10-21); the same line passes on the iPhones."),
        ("waitlist join standard ipad", .contrast, "Not now",
         "Forest on paper, #3d5a45 on #faf8f5, 7.2:1 measured from the iPad screenshot (2026-10-21); passes on the iPhones."),
        ("settings", .dynamicType, "Try again", "A system List button row; it scales at AX5 like the other rows."),
        ("settings", .dynamicType, "Get help with your account",
         "Account footer link; HelpLinksUITests.testAccountHelpGrowsWithTextSize proves it grows at AX5 (pinned, it stays 34 pt and fails)."),
    ]

    /// The 1-pt probe, or an entry in `accepted`: a label prefix, or
    /// "#identifier" for exactly one element.
    nonisolated static func isAccepted(_ issue: XCUIAccessibilityAuditIssue, on screen: String) -> Bool {
        guard let element = issue.element else { return false }
        if element.identifier.hasPrefix("uitest.") { return true }
        return accepted.contains(where: {
            $0.screen.split(separator: "|").contains { screen.hasPrefix($0) } && issue.auditType == $0.type
                && ($0.label.hasPrefix("#") ? element.identifier == String($0.label.dropFirst()) : element.label.hasPrefix($0.label))
        })
    }

    /// Every issue fails the test, named with its element so the log says what
    /// to fix. The 1-pt probe exists only in UI-test launches and is skipped.
    nonisolated static func handle(_ issue: XCUIAccessibilityAuditIssue, on screen: String) -> Bool {
        let element = issue.element
        if isAccepted(issue, on: screen) { return true }
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

    // MARK: - Every place, at both sizes and at night (critic H-B, H-C)

    /// Night Ink's hour: 23:00, the app dark on a light-mode phone.
    static let night = 23

    /// Launches a scenario, walks to a place, and audits it there.
    @discardableResult
    private func auditPlace(_ place: String, scenario: String, size: TextSize, hour: Int? = nil, extra: [String] = [],
                            asking: Bool = false, answering asked: [Named] = [], large: Bool = false,
                            go: (XCUIApplication) -> XCUIElement) throws -> [Named] {
        func launch() -> XCUIApplication {
            let app = XCUIApplication()
            app.launchArguments = ["-FerniUITest", scenario, "-UIPreferredContentSizeCategoryName", size.rawValue,
                                   "-FerniReduceMotion", "NO", "-FerniReduceTransparency", "NO", "-FerniSounds", "NO"]
                + (hour.map { ["-FerniHour", String($0)] } ?? []) + extra
            app.launch()
            let ready = go(app)
            XCTAssertTrue(ready.waitForExistence(timeout: 20), "\(place) never appeared")
            if large {
                // Up to the large detent by the title bar. At half height the call
                // shows dimmed above the sheet, and the audit reads its captions as
                // faint, clipped text with no element (screenshot kept, 2026-10-21).
                let top = ready.frame.minY
                for _ in 0..<3 where ready.frame.minY > top - 100 {
                    ready.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
                        .press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.02)))
                    sleep(1)
                }
                XCTAssertLessThan(ready.frame.minY, top - 100, "\(place): the sheet went up to its large detent")
            }
            sleep(1)
            return app
        }
        let name = "\(place) \(size)" + (hour.map { " \($0)h" } ?? "")
            + (UIDevice.current.userInterfaceIdiom == .pad ? " ipad" : "")
        // The answers first, on launches of their own (see proveAtAX5).
        if !asked.isEmpty { try proveAtAX5(launch: launch, asked: asked, name: name) }
        let app = launch()
        let found = try XCTContext.runActivity(named: name) { _ in try auditTwice(app, name: name, asking: asking) }
        app.terminate()
        return found
    }

    /// Standard by day and at night, then AX5, which answers what the
    /// default size asked about larger sizes (once per text).
    private func everyWay(_ place: String, scenario: String, extra: [String] = [], large: Bool = false,
                          go: @escaping (XCUIApplication) -> XCUIElement) throws {
        var asked = try auditPlace(place, scenario: scenario, size: .standard, hour: 14, extra: extra, asking: true, large: large, go: go)
        asked += try auditPlace(place, scenario: scenario, size: .standard, hour: Self.night, extra: extra, asking: true, large: large, go: go)
        var seen = Set<String>()
        asked = asked.filter { seen.insert($0.label).inserted }
        try auditPlace(place, scenario: scenario, size: .ax5, hour: 14, extra: extra, answering: asked, large: large, go: go)
    }

    private var pad: Bool { UIDevice.current.userInterfaceIdiom == .pad }

    /// Opens a Settings link: on iPhone the Settings sheet, on iPad the sidebar's page.
    private func settingsLink(_ app: XCUIApplication, _ label: String) -> XCUIElement {
        if pad {
            let item = app.staticTexts["Settings"].firstMatch
            if item.waitForExistence(timeout: 20) { item.tap() }
        }
        let link = label == "What Ferni remembers" ? app.memoryLink : app.buttons[label].firstMatch
        for _ in 0..<6 where !(link.waitForExistence(timeout: 2) && link.isHittable) { app.collectionViews.firstMatch.swipeUp(velocity: .slow) }
        link.tap()
        return app.navigationBars[label]
    }

    /// The main screens at night, in Night Ink (critic H-B: white on the light
    /// sage, 2.48:1, on consent's button).
    func testTheMainScreensAtNight() throws {
        for screen in [Screen.consent, .settings, .call] {
            try audit(screen, size: .standard, hour: Self.night)
            try audit(screen, size: .ax5, hour: Self.night)
        }
    }

    func testSignInAtNight() throws {
        for size in [TextSize.standard, .ax5] {
            try auditPlace("signIn", scenario: "home", size: size, hour: Self.night, extra: ["-FerniAccount", "anonymous"]) { app in
                let offer = app.buttons["home.signIn"]
                if offer.waitForExistence(timeout: 20) { offer.tap() }
                return app.buttons["Continue with Google"]
            }
        }
    }

    /// Release hides phone sign-in (critic H3); audited that way too.
    func testSignInWithoutThePhone() throws {
        try auditPlace("signIn noPhone", scenario: "home", size: .standard, extra: ["-FerniAccount", "anonymous", "-FerniPhoneSignIn", "NO"]) { app in
            let offer = app.buttons["home.signIn"]
            if offer.waitForExistence(timeout: 20) { offer.tap() }
            return app.buttons["Continue with Google"]
        }
    }

    func testTeamAtNight() throws {
        try auditPlace("team", scenario: pad ? "home" : "settings", size: .standard, hour: Self.night) { app in
            let way = self.pad ? app.staticTexts["Team"].firstMatch : app.buttons["Your team"].firstMatch
            if way.waitForExistence(timeout: 20) { way.tap() }
            return app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'team.'")).firstMatch
        }
    }

    /// What Ferni remembers, opened from Home (iPhone) or the sidebar (iPad).
    func testMemoryJournal() throws {
        try everyWay("memory", scenario: "home", extra: ["-FerniStoreData", "YES"]) { app in
            let open = self.pad ? app.staticTexts["What Ferni remembers"].firstMatch : app.buttons["home.memory"]
            if open.waitForExistence(timeout: 20) { open.tap() }
            return app.navigationBars["What Ferni remembers"]
        }
    }

    /// The same journal, reached from Settings (pushed, not a sheet).
    func testMemoryJournalFromSettings() throws {
        try everyWay("memory settings", scenario: "settings", extra: ["-FerniStoreData", "YES"]) { app in
            self.settingsLink(app, "What Ferni remembers")
        }
    }

    /// Signed in, not on the list: the waiting screen's "Join the list" (critic H1).
    func testJoinTheList() throws {
        for size in [TextSize.standard, .ax5] {
            try auditPlace("waitlist join", scenario: "waitlist", size: size,
                           extra: ["-FerniAccount", "signedIn", "-FerniWaitlistMe", "notJoined"]) { app in
                app.buttons["Join the list"]
            }
        }
    }

    /// The "I'll remember" card after a call.
    func testRememberCard() throws {
        try everyWay("remember", scenario: "remember", extra: ["-FerniStoreData", "YES"]) { app in
            app.staticTexts["I'll remember"]
        }
    }

    func testHelp() throws {
        try everyWay("help", scenario: "settings") { app in self.settingsLink(app, "Help") }
    }

    func testDeleteAccount() throws {
        try everyWay("deleteAccount", scenario: "settings") { app in self.settingsLink(app, "Delete account") }
    }

    /// The call's More sheet.
    func testMore() throws {
        try everyWay("more", scenario: "call", large: !pad) { app in
            let more = app.buttons["More"]
            if more.waitForExistence(timeout: 20) { more.tap() }
            return app.navigationBars["More"]
        }
    }

    /// The report sheet, from More.
    func testReport() throws {
        try everyWay("report", scenario: "call", large: !pad) { app in
            let more = app.buttons["More"]
            if more.waitForExistence(timeout: 20) { more.tap() }
            let report = app.buttons["Report something Ferni said"]
            for _ in 0..<4 where !(report.waitForExistence(timeout: 3) && report.isHittable) { app.collectionViews.firstMatch.swipeUp(velocity: .slow) }
            report.tap()
            return app.navigationBars["Report a reply"]
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
            // Met teammates come first: at AX5 on an SE the others are below the
            // fold, and the list loads them as they scroll in.
            for _ in 0..<6 where !notYet.waitForExistence(timeout: 2) { app.swipeUp() }
            XCTAssertTrue(notYet.exists, "a teammate not met yet")
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
            // Through the floor rule: on an SE the hint under the field runs under
            // the pinned button, and reads in full scrolled up.
            try XCTContext.runActivity(named: name) { _ in try auditTwice(app, name: name, nudges: false) }
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
