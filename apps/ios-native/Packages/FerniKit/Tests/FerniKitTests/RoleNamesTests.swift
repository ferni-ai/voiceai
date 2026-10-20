import XCTest
@testable import FerniKit

/// Design audit P2 #14: role names disagreed between two tables (Peter was
/// "Research" on one and "The Quant" on the other) and mixed their capitals.
final class RoleNamesTests: XCTestCase {
    func testOneNamePerTeammateEverywhere() {
        for member in TeamUnlock.allMembers {
            XCTAssertEqual(member.role, PersonaRegistry.get(member.id).role, member.id)
        }
    }

    /// Sentence case: a capital to start, the rest lower case.
    func testRolesAreInSentenceCase() {
        for persona in PersonaRegistry.all {
            let role = persona.role
            XCTAssertEqual(role, role.prefix(1).uppercased() + role.dropFirst().lowercased(), "\(persona.id): \(role)")
        }
    }

    func testTheRolesAreTheWebsLabels() {
        XCTAssertEqual(PersonaRegistry.all.map(\.role),
                       ["Life coach", "Habits coach", "Chief of staff", "Life planner", "Insights mentor", "Wisdom guide"])
    }
}
