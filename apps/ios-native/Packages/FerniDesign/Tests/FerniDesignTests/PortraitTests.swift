import SwiftUI
import XCTest
@testable import FerniDesign

@MainActor
final class PortraitTests: XCTestCase {
    func testAPortraitDrawsAndAnAbsentTeammateLooksDifferent() throws {
        func image(_ present: Bool) throws -> Data {
            let renderer = ImageRenderer(content: AvatarPortrait(persona: .maya, present: present).frame(width: 44, height: 44))
            return try XCTUnwrap(renderer.uiImage?.pngData())
        }
        XCTAssertNotEqual(try image(true), try image(false))
    }
}
