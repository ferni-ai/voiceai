import XCTest
import SwiftUI
@testable import FerniShared

// MARK: - Persona Model Tests

final class PersonaModelTests: XCTestCase {

    func testPersonaIdentifiable() {
        let persona = PersonaRegistry.ferni
        XCTAssertEqual(persona.id, "ferni")
    }

    func testPersonaEquatable() {
        let persona1 = PersonaRegistry.ferni
        let persona2 = PersonaRegistry.ferni
        let persona3 = PersonaRegistry.maya

        XCTAssertEqual(persona1, persona2)
        XCTAssertNotEqual(persona1, persona3)
    }

    func testPersonaCustomInitialization() {
        let custom = Persona(
            id: "custom",
            name: "Custom Persona",
            emoji: "🎭",
            initials: "CP",
            role: "Custom Role",
            specialty: "Custom specialty",
            primaryColor: .blue,
            secondaryColor: .cyan,
            glowColor: .blue.opacity(0.4)
        )

        XCTAssertEqual(custom.id, "custom")
        XCTAssertEqual(custom.name, "Custom Persona")
        XCTAssertEqual(custom.emoji, "🎭")
        XCTAssertEqual(custom.initials, "CP")
        XCTAssertEqual(custom.role, "Custom Role")
        XCTAssertEqual(custom.specialty, "Custom specialty")
    }

    func testTaglineAliasesRole() {
        let persona = PersonaRegistry.maya
        XCTAssertEqual(persona.tagline, persona.role)
    }
}

// MARK: - Persona Primary Hex Tests

final class PersonaPrimaryHexTests: XCTestCase {

    func testFerniPrimaryHex() {
        XCTAssertEqual(PersonaRegistry.ferni.primaryHex, "#4a6741")
    }

    func testMayaPrimaryHex() {
        XCTAssertEqual(PersonaRegistry.maya.primaryHex, "#a67a6a")
    }

    func testAlexPrimaryHex() {
        XCTAssertEqual(PersonaRegistry.alex.primaryHex, "#5a6b8a")
    }

    func testJordanPrimaryHex() {
        XCTAssertEqual(PersonaRegistry.jordan.primaryHex, "#c4856a")
    }

    func testPeterPrimaryHex() {
        XCTAssertEqual(PersonaRegistry.peter.primaryHex, "#3a6b73")
    }

    func testNayanPrimaryHex() {
        XCTAssertEqual(PersonaRegistry.nayan.primaryHex, "#9a7b5a")
    }

    func testUnknownIdDefaultsToFerni() {
        let custom = Persona(
            id: "unknown",
            name: "Unknown",
            emoji: "❓",
            initials: "UN",
            role: "Unknown",
            specialty: "Unknown",
            primaryColor: .gray,
            secondaryColor: .gray,
            glowColor: .gray
        )
        XCTAssertEqual(custom.primaryHex, "#4a6741") // Defaults to Ferni
    }

    func testAllHexValuesStartWithHash() {
        for persona in PersonaRegistry.all {
            XCTAssertTrue(persona.primaryHex.hasPrefix("#"), "\(persona.name) hex should start with #")
        }
    }

    func testAllHexValuesAreValidLength() {
        for persona in PersonaRegistry.all {
            XCTAssertEqual(persona.primaryHex.count, 7, "\(persona.name) hex should be 7 characters")
        }
    }
}

// MARK: - PersonaRegistry Tests

final class PersonaRegistryTests: XCTestCase {

    func testAllPersonasCount() {
        XCTAssertEqual(PersonaRegistry.all.count, 6)
    }

    func testAllPersonasIncludeFerni() {
        XCTAssertTrue(PersonaRegistry.all.contains(PersonaRegistry.ferni))
    }

    func testAllPersonasIncludeMaya() {
        XCTAssertTrue(PersonaRegistry.all.contains(PersonaRegistry.maya))
    }

    func testAllPersonasIncludeAlex() {
        XCTAssertTrue(PersonaRegistry.all.contains(PersonaRegistry.alex))
    }

    func testAllPersonasIncludeJordan() {
        XCTAssertTrue(PersonaRegistry.all.contains(PersonaRegistry.jordan))
    }

    func testAllPersonasIncludePeter() {
        XCTAssertTrue(PersonaRegistry.all.contains(PersonaRegistry.peter))
    }

    func testAllPersonasIncludeNayan() {
        XCTAssertTrue(PersonaRegistry.all.contains(PersonaRegistry.nayan))
    }

    func testGetPersonaById() {
        XCTAssertEqual(PersonaRegistry.get("ferni"), PersonaRegistry.ferni)
        XCTAssertEqual(PersonaRegistry.get("maya"), PersonaRegistry.maya)
        XCTAssertEqual(PersonaRegistry.get("alex"), PersonaRegistry.alex)
        XCTAssertEqual(PersonaRegistry.get("jordan"), PersonaRegistry.jordan)
        XCTAssertEqual(PersonaRegistry.get("peter"), PersonaRegistry.peter)
        XCTAssertEqual(PersonaRegistry.get("nayan"), PersonaRegistry.nayan)
    }

    func testGetUnknownIdDefaultsToFerni() {
        XCTAssertEqual(PersonaRegistry.get("unknown"), PersonaRegistry.ferni)
        XCTAssertEqual(PersonaRegistry.get(""), PersonaRegistry.ferni)
        XCTAssertEqual(PersonaRegistry.get("nonexistent"), PersonaRegistry.ferni)
    }

    func testDisplayOrder() {
        let personas = PersonaRegistry.all
        XCTAssertEqual(personas[0], PersonaRegistry.ferni)
        XCTAssertEqual(personas[1], PersonaRegistry.maya)
        XCTAssertEqual(personas[2], PersonaRegistry.alex)
        XCTAssertEqual(personas[3], PersonaRegistry.jordan)
        XCTAssertEqual(personas[4], PersonaRegistry.peter)
        XCTAssertEqual(personas[5], PersonaRegistry.nayan)
    }
}

// MARK: - Ferni Persona Tests

final class FerniPersonaTests: XCTestCase {

    let ferni = PersonaRegistry.ferni

    func testFerniId() {
        XCTAssertEqual(ferni.id, "ferni")
    }

    func testFerniName() {
        XCTAssertEqual(ferni.name, "Ferni")
    }

    func testFerniEmoji() {
        XCTAssertEqual(ferni.emoji, "🌿")
    }

    func testFerniInitials() {
        XCTAssertEqual(ferni.initials, "FE")
    }

    func testFerniRole() {
        XCTAssertEqual(ferni.role, "Life Coach")
    }

    func testFerniSpecialty() {
        XCTAssertEqual(ferni.specialty, "Leadership, life direction, bringing in the right expert")
    }
}

// MARK: - Maya Persona Tests

final class MayaPersonaTests: XCTestCase {

    let maya = PersonaRegistry.maya

    func testMayaId() {
        XCTAssertEqual(maya.id, "maya")
    }

    func testMayaName() {
        XCTAssertEqual(maya.name, "Maya")
    }

    func testMayaEmoji() {
        XCTAssertEqual(maya.emoji, "🦋")
    }

    func testMayaInitials() {
        XCTAssertEqual(maya.initials, "MS")
    }

    func testMayaRole() {
        XCTAssertEqual(maya.role, "Habits Coach")
    }

    func testMayaSpecialty() {
        XCTAssertEqual(maya.specialty, "Building habits, breaking bad ones, behavior change")
    }
}

// MARK: - Alex Persona Tests

final class AlexPersonaTests: XCTestCase {

    let alex = PersonaRegistry.alex

    func testAlexId() {
        XCTAssertEqual(alex.id, "alex")
    }

    func testAlexName() {
        XCTAssertEqual(alex.name, "Alex")
    }

    func testAlexEmoji() {
        XCTAssertEqual(alex.emoji, "💬")
    }

    func testAlexInitials() {
        XCTAssertEqual(alex.initials, "AC")
    }

    func testAlexRole() {
        XCTAssertEqual(alex.role, "Communications")
    }

    func testAlexSpecialty() {
        XCTAssertEqual(alex.specialty, "Difficult conversations, relationships, conflict resolution")
    }
}

// MARK: - Jordan Persona Tests

final class JordanPersonaTests: XCTestCase {

    let jordan = PersonaRegistry.jordan

    func testJordanId() {
        XCTAssertEqual(jordan.id, "jordan")
    }

    func testJordanName() {
        XCTAssertEqual(jordan.name, "Jordan")
    }

    func testJordanEmoji() {
        XCTAssertEqual(jordan.emoji, "📋")
    }

    func testJordanInitials() {
        XCTAssertEqual(jordan.initials, "JT")
    }

    func testJordanRole() {
        XCTAssertEqual(jordan.role, "Life Planner")
    }

    func testJordanSpecialty() {
        XCTAssertEqual(jordan.specialty, "Goals, planning, productivity, time management")
    }
}

// MARK: - Peter Persona Tests

final class PeterPersonaTests: XCTestCase {

    let peter = PersonaRegistry.peter

    func testPeterId() {
        XCTAssertEqual(peter.id, "peter")
    }

    func testPeterName() {
        XCTAssertEqual(peter.name, "Peter")
    }

    func testPeterEmoji() {
        XCTAssertEqual(peter.emoji, "🔬")
    }

    func testPeterInitials() {
        XCTAssertEqual(peter.initials, "PJ")
    }

    func testPeterRole() {
        XCTAssertEqual(peter.role, "Research")
    }

    func testPeterSpecialty() {
        XCTAssertEqual(peter.specialty, "Deep research, analysis, finding answers")
    }
}

// MARK: - Nayan Persona Tests

final class NayanPersonaTests: XCTestCase {

    let nayan = PersonaRegistry.nayan

    func testNayanId() {
        XCTAssertEqual(nayan.id, "nayan")
    }

    func testNayanName() {
        XCTAssertEqual(nayan.name, "Nayan")
    }

    func testNayanEmoji() {
        XCTAssertEqual(nayan.emoji, "🧘")
    }

    func testNayanInitials() {
        XCTAssertEqual(nayan.initials, "NP")
    }

    func testNayanRole() {
        XCTAssertEqual(nayan.role, "Wisdom")
    }

    func testNayanSpecialty() {
        XCTAssertEqual(nayan.specialty, "Philosophy, mindfulness, deeper meaning")
    }
}

// MARK: - Persona Unique IDs Tests

final class PersonaUniqueIdsTests: XCTestCase {

    func testAllIdsAreUnique() {
        let ids = PersonaRegistry.all.map { $0.id }
        let uniqueIds = Set(ids)
        XCTAssertEqual(ids.count, uniqueIds.count, "All persona IDs should be unique")
    }

    func testAllNamesAreUnique() {
        let names = PersonaRegistry.all.map { $0.name }
        let uniqueNames = Set(names)
        XCTAssertEqual(names.count, uniqueNames.count, "All persona names should be unique")
    }

    func testAllInitialsAreUnique() {
        let initials = PersonaRegistry.all.map { $0.initials }
        let uniqueInitials = Set(initials)
        XCTAssertEqual(initials.count, uniqueInitials.count, "All persona initials should be unique")
    }

    func testAllEmojisAreUnique() {
        let emojis = PersonaRegistry.all.map { $0.emoji }
        let uniqueEmojis = Set(emojis)
        XCTAssertEqual(emojis.count, uniqueEmojis.count, "All persona emojis should be unique")
    }
}

// MARK: - Persona Non-Empty Fields Tests

final class PersonaNonEmptyFieldsTests: XCTestCase {

    func testAllPersonasHaveNonEmptyIds() {
        for persona in PersonaRegistry.all {
            XCTAssertFalse(persona.id.isEmpty, "\(persona.name) should have non-empty ID")
        }
    }

    func testAllPersonasHaveNonEmptyNames() {
        for persona in PersonaRegistry.all {
            XCTAssertFalse(persona.name.isEmpty, "\(persona.id) should have non-empty name")
        }
    }

    func testAllPersonasHaveNonEmptyEmojis() {
        for persona in PersonaRegistry.all {
            XCTAssertFalse(persona.emoji.isEmpty, "\(persona.name) should have non-empty emoji")
        }
    }

    func testAllPersonasHaveNonEmptyInitials() {
        for persona in PersonaRegistry.all {
            XCTAssertFalse(persona.initials.isEmpty, "\(persona.name) should have non-empty initials")
        }
    }

    func testAllPersonasHaveNonEmptyRoles() {
        for persona in PersonaRegistry.all {
            XCTAssertFalse(persona.role.isEmpty, "\(persona.name) should have non-empty role")
        }
    }

    func testAllPersonasHaveNonEmptySpecialties() {
        for persona in PersonaRegistry.all {
            XCTAssertFalse(persona.specialty.isEmpty, "\(persona.name) should have non-empty specialty")
        }
    }
}

// MARK: - Persona Initials Format Tests

final class PersonaInitialsFormatTests: XCTestCase {

    func testAllInitialsAreTwoCharacters() {
        for persona in PersonaRegistry.all {
            XCTAssertEqual(persona.initials.count, 2, "\(persona.name) initials should be 2 characters")
        }
    }

    func testAllInitialsAreUppercase() {
        for persona in PersonaRegistry.all {
            XCTAssertEqual(persona.initials, persona.initials.uppercased(), "\(persona.name) initials should be uppercase")
        }
    }
}
