import XCTest
import SwiftUI
@testable import FerniVoice

// MARK: - Persona Tests

final class PersonaTests: XCTestCase {
    
    // MARK: - Persona Registry Tests
    
    func testAllPersonasExist() {
        // Should have 6 team members
        XCTAssertEqual(PersonaRegistry.all.count, 6)
    }
    
    func testPersonaIds() {
        let expectedIds = ["ferni", "maya", "alex", "jordan", "peter", "nayan"]
        let actualIds = PersonaRegistry.all.map { $0.id }
        XCTAssertEqual(Set(actualIds), Set(expectedIds))
    }
    
    func testGetPersonaById() {
        let ferni = PersonaRegistry.get("ferni")
        XCTAssertEqual(ferni.name, "Ferni")
        XCTAssertEqual(ferni.role, "Life Coach")
        
        let maya = PersonaRegistry.get("maya")
        XCTAssertEqual(maya.name, "Maya")
        XCTAssertEqual(maya.role, "Habits Coach")
    }
    
    func testGetInvalidPersonaReturnsFerni() {
        let unknown = PersonaRegistry.get("invalid")
        XCTAssertEqual(unknown.id, "ferni")
    }
    
    func testPersonaHexColors() {
        XCTAssertEqual(PersonaRegistry.ferni.primaryHex, "#4a6741")
        XCTAssertEqual(PersonaRegistry.maya.primaryHex, "#a67a6a")
        XCTAssertEqual(PersonaRegistry.peter.primaryHex, "#3a6b73")
    }
    
    func testAllPersonasHaveRequiredFields() {
        for persona in PersonaRegistry.all {
            XCTAssertFalse(persona.id.isEmpty, "\(persona.name) should have id")
            XCTAssertFalse(persona.name.isEmpty, "\(persona.id) should have name")
            XCTAssertFalse(persona.emoji.isEmpty, "\(persona.id) should have emoji")
            XCTAssertFalse(persona.initials.isEmpty, "\(persona.id) should have initials")
            XCTAssertFalse(persona.role.isEmpty, "\(persona.id) should have role")
            XCTAssertFalse(persona.specialty.isEmpty, "\(persona.id) should have specialty")
        }
    }
    
    func testPersonaEquatable() {
        let ferni1 = PersonaRegistry.ferni
        let ferni2 = PersonaRegistry.get("ferni")
        XCTAssertEqual(ferni1, ferni2)
        
        let maya = PersonaRegistry.maya
        XCTAssertNotEqual(ferni1, maya)
    }
    
    func testPersonaInitials() {
        XCTAssertEqual(PersonaRegistry.ferni.initials, "FN")
        XCTAssertEqual(PersonaRegistry.maya.initials, "MS")
        XCTAssertEqual(PersonaRegistry.alex.initials, "AC")
        XCTAssertEqual(PersonaRegistry.jordan.initials, "JT")
        XCTAssertEqual(PersonaRegistry.peter.initials, "PJ")
        XCTAssertEqual(PersonaRegistry.nayan.initials, "NP")
    }
}

// MARK: - Color Extension Tests

final class ColorExtensionTests: XCTestCase {
    
    func testColorFromHex() {
        let green = Color(hex: 0x4a6741)
        // Color comparison is tricky, just verify it doesn't crash
        XCTAssertNotNil(green)
    }
    
    func testColorFromHexString() {
        let green = Color(hexString: "#4a6741")
        XCTAssertNotNil(green)
        
        let greenNoHash = Color(hexString: "4a6741")
        XCTAssertNotNil(greenNoHash)
    }
    
    func testColorWithAlpha() {
        let semiTransparent = Color(hex: 0x4a6741, alpha: 0.5)
        XCTAssertNotNil(semiTransparent)
    }
}

