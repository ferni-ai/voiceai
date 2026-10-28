import XCTest
@testable import Ferni

/// Delight gap 9: 1.0 ships English only. About 78% of the catalog was
/// English placeholders, so a German phone got an English app while the
/// App Store listed German. App/Localizable.xcstrings stays in the repo (and
/// scripts/build-string-catalog.py keeps it current) for when real
/// translations exist; it isn't built into the app until then.
final class LocalizationTests: XCTestCase {
    func testOneOhDeclaresEnglishOnly() {
        XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "CFBundleLocalizations") as? [String], ["en"])
    }

    /// The App Store lists a language for every .lproj in the app.
    func testNoOtherLanguageShipsInTheApp() throws {
        let folders = try FileManager.default.contentsOfDirectory(atPath: Bundle.main.bundlePath).filter { $0.hasSuffix(".lproj") }
        XCTAssertEqual(Set(folders).subtracting(["en.lproj", "Base.lproj"]), [], "\(folders)")
    }

    /// Without the catalog the words are the source's own English, including
    /// interpolated ones.
    func testTheWordsAreEnglish() {
        let name = "Ferni"
        XCTAssertEqual(String(localized: "Calling \(name)…"), "Calling Ferni…")
        XCTAssertEqual(Greeting.headline(hour: 9, firstVisit: false), "Good morning.")
    }
}
