import XCTest
@testable import FerniKit

final class FerniConfigTests: XCTestCase {

    func testTheAppTalksToTheBaseURLItWasBuiltWith() {
        let config = FerniConfig.fromBundle(["FerniAPIBaseURL": "https://dev.ferni.example"])
        XCTAssertEqual(config.apiBaseURL.absoluteString, "https://dev.ferni.example")
    }

    /// A missing or unexpanded build setting must not send the app nowhere.
    func testMissingOrBrokenSettingFallsBackToProduction() {
        XCTAssertEqual(FerniConfig.fromBundle([:]), .production)
        XCTAssertEqual(FerniConfig.fromBundle(["FerniAPIBaseURL": "$(FERNI_API_BASE_URL)"]), .production)
        XCTAssertEqual(FerniConfig.fromBundle(["FerniAPIBaseURL": "http://plain.example"]), .production)
        XCTAssertEqual(FerniConfig.production.apiBaseURL.absoluteString, "https://app.ferni.ai")
    }
}
