import FerniKit
import XCTest
@testable import Ferni

/// Design audit P1-1: a teammate chosen for the next call is greeted on
/// Home, in Ferni's own words about them.
final class TeamAtRestTests: XCTestCase {
    func testAChosenTeammateIsIntroduced() throws {
        let words = RestingWords.words(home: nil, ended: false, hour: 10, hasTalked: true, chosen: "maya")
        XCTAssertEqual(words.headline, "Maya's here.")
        XCTAssertEqual(words.detail, try XCTUnwrap(TeammateIntroduction.forPersona("maya")).ferniSays)
    }

    func testEveryTeammateHasTheirIntroduction() {
        for persona in PersonaRegistry.all where persona.id != PersonaRegistry.ferni.id {
            let words = RestingWords.words(home: nil, ended: false, hour: 10, hasTalked: true, chosen: persona.id)
            XCTAssertEqual(words.headline, "\(persona.name)'s here.", persona.id)
        }
    }

    func testFerniAndTheEndOfACallAreUnchanged() {
        let ferni = RestingWords.words(home: nil, ended: false, hour: 10, hasTalked: true)
        XCTAssertEqual(RestingWords.words(home: nil, ended: false, hour: 10, hasTalked: true, chosen: "ferni").headline, ferni.headline)
        XCTAssertEqual(RestingWords.words(home: nil, ended: true, hour: 10, hasTalked: true, chosen: "maya").headline, "Talk soon.")
    }
}

/// Design audit P1-14: on iPad Home was a phone column, Ferni 200 pt.
final class RestSizeTests: XCTestCase {
    func testAPhoneKeepsFerniAt200() {
        XCTAssertEqual(HomeView.restSize(room: CGSize(width: 402, height: 874), regular: false), 200)
    }

    func testAnIPadSizesFerniToTheRoom() {
        // iPad Pro 13", the detail beside the sidebar, portrait and landscape.
        XCTAssertEqual(HomeView.restSize(room: CGSize(width: 700, height: 1376), regular: true), 350, accuracy: 0.5)
        XCTAssertEqual(HomeView.restSize(room: CGSize(width: 1032, height: 1032), regular: true), 433.4, accuracy: 0.5)
        XCTAssertEqual(HomeView.restSize(room: CGSize(width: 2000, height: 2000), regular: true), 440, "no bigger than 440")
        XCTAssertEqual(HomeView.restSize(room: CGSize(width: 400, height: 500), regular: true), 200, "no smaller than a phone's")
        XCTAssertEqual(HomeView.restSize(room: .zero, regular: true), 200, "before it's measured")
    }
}

/// A screen's intro (a small Ferni and a line) steps aside at AX3 and up.
final class ScreenIntroTests: XCTestCase {
    func testTheIntroStepsAsideAtLargeAccessibilitySizes() {
        XCTAssertTrue(ScreenIntro.shows(at: .large))
        XCTAssertTrue(ScreenIntro.shows(at: .accessibility2))
        XCTAssertFalse(ScreenIntro.shows(at: .accessibility3))
        XCTAssertFalse(ScreenIntro.shows(at: .accessibility5))
    }
}
