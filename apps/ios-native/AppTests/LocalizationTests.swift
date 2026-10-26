import XCTest
@testable import Ferni

/// The app speaks the web's languages, with the web's own words where they match.
final class LocalizationTests: XCTestCase {
    func testEveryWebLocaleShipsWithTheWebsTranslations() throws {
        let web = ["en-GB", "ar", "de", "es", "fr", "he", "ja", "ko", "zh-Hans", "zh-Hant"]
        XCTAssertTrue(Set(Bundle.main.localizations).isSuperset(of: web))
        let german = try XCTUnwrap(Bundle.main.path(forResource: "de", ofType: "lproj").flatMap(Bundle.init(path:)))
        XCTAssertEqual(german.localizedString(forKey: "Settings", value: nil, table: nil), "Einstellungen")
        XCTAssertEqual(german.localizedString(forKey: "Talk to Ferni", value: nil, table: nil), "Mit Ferni sprechen")
    }
}
