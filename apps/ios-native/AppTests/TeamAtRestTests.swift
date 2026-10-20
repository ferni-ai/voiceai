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
