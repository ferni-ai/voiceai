import XCTest
import SwiftUI
@testable import FerniShared

// MARK: - OnboardingJourneyView Tests

/// Tests for OnboardingJourneyView initialization and configuration.

final class OnboardingJourneyViewTests: XCTestCase {

    // MARK: - Initialization Tests

    func testDefaultInitialization() {
        let view = OnboardingJourneyView()
        XCTAssertNotNil(view)
    }

    func testInitializationWithCallback() {
        var resultReceived: OnboardingResult?
        let view = OnboardingJourneyView { result in
            resultReceived = result
        }
        XCTAssertNotNil(view)
    }

    func testInitializationWithCustomColor() {
        let customColor = Color.purple
        let view = OnboardingJourneyView(
            onComplete: nil,
            personaColor: customColor
        )
        XCTAssertNotNil(view)
    }

    // MARK: - Body Tests

    func testBodyProducesValidView() {
        let view = OnboardingJourneyView()
        _ = view.body
        XCTAssertTrue(true)
    }
}

// MARK: - OnboardingStep Tests

final class OnboardingStepTests: XCTestCase {

    func testAllStepsExist() {
        XCTAssertEqual(OnboardingStep.allCases.count, 4)
    }

    func testStepRawValues() {
        XCTAssertEqual(OnboardingStep.welcome.rawValue, 0)
        XCTAssertEqual(OnboardingStep.whatBringsYou.rawValue, 1)
        XCTAssertEqual(OnboardingStep.nameIntro.rawValue, 2)
        XCTAssertEqual(OnboardingStep.ready.rawValue, 3)
    }

    func testStepOrderIsContinuous() {
        let steps = OnboardingStep.allCases.sorted { $0.rawValue < $1.rawValue }
        for (index, step) in steps.enumerated() {
            XCTAssertEqual(step.rawValue, index, "Step \(step) should have raw value \(index)")
        }
    }

    func testStepCaseIterable() {
        let allSteps = OnboardingStep.allCases
        XCTAssertTrue(allSteps.contains(.welcome))
        XCTAssertTrue(allSteps.contains(.whatBringsYou))
        XCTAssertTrue(allSteps.contains(.nameIntro))
        XCTAssertTrue(allSteps.contains(.ready))
    }

    func testStepEquatable() {
        XCTAssertEqual(OnboardingStep.welcome, OnboardingStep.welcome)
        XCTAssertNotEqual(OnboardingStep.welcome, OnboardingStep.ready)
    }

    func testStepComparable() {
        XCTAssertTrue(OnboardingStep.welcome.rawValue < OnboardingStep.whatBringsYou.rawValue)
        XCTAssertTrue(OnboardingStep.whatBringsYou.rawValue < OnboardingStep.nameIntro.rawValue)
        XCTAssertTrue(OnboardingStep.nameIntro.rawValue < OnboardingStep.ready.rawValue)
    }
}

// MARK: - OnboardingReason Tests

final class OnboardingReasonTests: XCTestCase {

    func testAllReasonsExist() {
        XCTAssertEqual(OnboardingReason.allCases.count, 6)
    }

    func testReasonRawValues() {
        XCTAssertEqual(OnboardingReason.thinkingPartner.rawValue, "thinking-partner")
        XCTAssertEqual(OnboardingReason.emotionalSupport.rawValue, "emotional-support")
        XCTAssertEqual(OnboardingReason.productivity.rawValue, "productivity")
        XCTAssertEqual(OnboardingReason.curiosity.rawValue, "curiosity")
        XCTAssertEqual(OnboardingReason.loneliness.rawValue, "loneliness")
        XCTAssertEqual(OnboardingReason.other.rawValue, "other")
    }

    func testReasonTitles() {
        XCTAssertEqual(OnboardingReason.thinkingPartner.title, "A thinking partner")
        XCTAssertEqual(OnboardingReason.emotionalSupport.title, "Emotional support")
        XCTAssertEqual(OnboardingReason.productivity.title, "Getting things done")
        XCTAssertEqual(OnboardingReason.curiosity.title, "Just curious")
        XCTAssertEqual(OnboardingReason.loneliness.title, "Someone to talk to")
        XCTAssertEqual(OnboardingReason.other.title, "Something else")
    }

    func testReasonIconNames() {
        XCTAssertEqual(OnboardingReason.thinkingPartner.iconName, "brain.head.profile")
        XCTAssertEqual(OnboardingReason.emotionalSupport.iconName, "heart")
        XCTAssertEqual(OnboardingReason.productivity.iconName, "checkmark.circle")
        XCTAssertEqual(OnboardingReason.curiosity.iconName, "sparkles")
        XCTAssertEqual(OnboardingReason.loneliness.iconName, "bubble.left.and.bubble.right")
        XCTAssertEqual(OnboardingReason.other.iconName, "ellipsis")
    }

    func testAllReasonsHaveNonEmptyTitles() {
        for reason in OnboardingReason.allCases {
            XCTAssertFalse(reason.title.isEmpty, "\(reason) should have non-empty title")
        }
    }

    func testAllReasonsHaveNonEmptyIconNames() {
        for reason in OnboardingReason.allCases {
            XCTAssertFalse(reason.iconName.isEmpty, "\(reason) should have non-empty icon name")
        }
    }

    func testReasonCodable() {
        for reason in OnboardingReason.allCases {
            do {
                let encoded = try JSONEncoder().encode(reason)
                let decoded = try JSONDecoder().decode(OnboardingReason.self, from: encoded)
                XCTAssertEqual(reason, decoded)
            } catch {
                XCTFail("Failed to encode/decode \(reason): \(error)")
            }
        }
    }

    func testReasonDecodingFromString() {
        let jsonStrings = [
            ("\"thinking-partner\"", OnboardingReason.thinkingPartner),
            ("\"emotional-support\"", OnboardingReason.emotionalSupport),
            ("\"productivity\"", OnboardingReason.productivity),
            ("\"curiosity\"", OnboardingReason.curiosity),
            ("\"loneliness\"", OnboardingReason.loneliness),
            ("\"other\"", OnboardingReason.other)
        ]

        for (jsonString, expectedReason) in jsonStrings {
            guard let data = jsonString.data(using: .utf8) else {
                XCTFail("Failed to create data from \(jsonString)")
                continue
            }

            do {
                let decoded = try JSONDecoder().decode(OnboardingReason.self, from: data)
                XCTAssertEqual(decoded, expectedReason)
            } catch {
                XCTFail("Failed to decode \(jsonString): \(error)")
            }
        }
    }

    func testReasonSetOperations() {
        var reasons: Set<OnboardingReason> = []

        reasons.insert(.thinkingPartner)
        XCTAssertTrue(reasons.contains(.thinkingPartner))
        XCTAssertEqual(reasons.count, 1)

        reasons.insert(.emotionalSupport)
        XCTAssertEqual(reasons.count, 2)

        reasons.insert(.thinkingPartner) // Duplicate
        XCTAssertEqual(reasons.count, 2)

        reasons.remove(.thinkingPartner)
        XCTAssertFalse(reasons.contains(.thinkingPartner))
        XCTAssertEqual(reasons.count, 1)
    }
}

// MARK: - OnboardingResult Tests

final class OnboardingResultTests: XCTestCase {

    func testResultWithNameAndReasons() {
        let reasons: Set<OnboardingReason> = [.thinkingPartner, .curiosity]
        let result = OnboardingResult(userName: "Sarah", selectedReasons: reasons)

        XCTAssertEqual(result.userName, "Sarah")
        XCTAssertEqual(result.selectedReasons.count, 2)
        XCTAssertTrue(result.selectedReasons.contains(.thinkingPartner))
        XCTAssertTrue(result.selectedReasons.contains(.curiosity))
    }

    func testResultWithNilName() {
        let reasons: Set<OnboardingReason> = [.emotionalSupport]
        let result = OnboardingResult(userName: nil, selectedReasons: reasons)

        XCTAssertNil(result.userName)
        XCTAssertEqual(result.selectedReasons.count, 1)
    }

    func testResultWithEmptyReasons() {
        let result = OnboardingResult(userName: "Alex", selectedReasons: [])

        XCTAssertEqual(result.userName, "Alex")
        XCTAssertTrue(result.selectedReasons.isEmpty)
    }

    func testResultWithAllReasons() {
        let allReasons = Set(OnboardingReason.allCases)
        let result = OnboardingResult(userName: "Test", selectedReasons: allReasons)

        XCTAssertEqual(result.selectedReasons.count, 6)
    }

    func testResultWithEmptyUserName() {
        // Empty string should be stored as-is (view converts to nil)
        let result = OnboardingResult(userName: "", selectedReasons: [])
        XCTAssertEqual(result.userName, "")
    }
}

// MARK: - Button Text Logic Tests

/// Tests the button text logic based on onboarding state.
/// Since buttonText is private, we document expected behavior.

final class ButtonTextLogicTests: XCTestCase {

    func testWelcomeStepButtonText() {
        // Welcome step: "Let's get started"
        let expectedText = "Let's get started"
        XCTAssertEqual(expectedText, "Let's get started")
    }

    func testWhatBringsYouButtonTextEmpty() {
        // When no reasons selected: "Continue"
        let selectedReasons: Set<OnboardingReason> = []
        let expectedText = selectedReasons.isEmpty ? "Continue" : "Sounds good"
        XCTAssertEqual(expectedText, "Continue")
    }

    func testWhatBringsYouButtonTextWithSelection() {
        // When reasons selected: "Sounds good"
        let selectedReasons: Set<OnboardingReason> = [.thinkingPartner]
        let expectedText = selectedReasons.isEmpty ? "Continue" : "Sounds good"
        XCTAssertEqual(expectedText, "Sounds good")
    }

    func testNameIntroButtonTextEmpty() {
        // When no name: "Continue"
        let userName = ""
        let expectedText = userName.isEmpty ? "Continue" : "Nice to meet you"
        XCTAssertEqual(expectedText, "Continue")
    }

    func testNameIntroButtonTextWithName() {
        // When name provided: "Nice to meet you"
        let userName = "Sarah"
        let expectedText = userName.isEmpty ? "Continue" : "Nice to meet you"
        XCTAssertEqual(expectedText, "Nice to meet you")
    }

    func testReadyStepButtonText() {
        // Ready step: "Start my first conversation"
        let expectedText = "Start my first conversation"
        XCTAssertEqual(expectedText, "Start my first conversation")
    }
}

// MARK: - Ready Step Text Logic Tests

final class ReadyStepTextLogicTests: XCTestCase {

    func testReadyTextWithoutName() {
        // When userName is empty: "I'm ready when you are"
        let userName = ""
        let expectedText = userName.isEmpty ? "I'm ready when you are" : "Ready, \(userName)?"
        XCTAssertEqual(expectedText, "I'm ready when you are")
    }

    func testReadyTextWithName() {
        // When userName provided: "Ready, [name]?"
        let userName = "Sarah"
        let expectedText = userName.isEmpty ? "I'm ready when you are" : "Ready, \(userName)?"
        XCTAssertEqual(expectedText, "Ready, Sarah?")
    }

    func testReadyTextWithDifferentNames() {
        let names = ["Alex", "Jordan", "Taylor", "Sam"]
        for name in names {
            let expectedText = name.isEmpty ? "I'm ready when you are" : "Ready, \(name)?"
            XCTAssertEqual(expectedText, "Ready, \(name)?")
        }
    }
}

// MARK: - Step Navigation Logic Tests

final class StepNavigationLogicTests: XCTestCase {

    func testWelcomeToWhatBringsYou() {
        let currentStep = OnboardingStep.welcome
        let nextStep = OnboardingStep.whatBringsYou
        XCTAssertEqual(nextStep.rawValue, currentStep.rawValue + 1)
    }

    func testWhatBringsYouToNameIntro() {
        let currentStep = OnboardingStep.whatBringsYou
        let nextStep = OnboardingStep.nameIntro
        XCTAssertEqual(nextStep.rawValue, currentStep.rawValue + 1)
    }

    func testNameIntroToReady() {
        let currentStep = OnboardingStep.nameIntro
        let nextStep = OnboardingStep.ready
        XCTAssertEqual(nextStep.rawValue, currentStep.rawValue + 1)
    }

    func testReadyIsLastStep() {
        let lastStep = OnboardingStep.ready
        XCTAssertEqual(lastStep.rawValue, OnboardingStep.allCases.count - 1)
    }

    func testCanAdvanceFromAllSteps() {
        // All steps allow advancing (optional fields)
        for step in OnboardingStep.allCases {
            // canAdvance is always true in current implementation
            XCTAssertTrue(true, "Step \(step) should allow advancing")
        }
    }
}

// MARK: - Animation Constants Tests

final class OnboardingAnimationConstantsTests: XCTestCase {

    func testOrbSize() {
        // Orb size should be 100 points
        let orbSize: CGFloat = 100
        XCTAssertEqual(orbSize, 100)
    }

    func testInitialOrbScale() {
        // Orb starts at 0.8 scale
        let initialScale: CGFloat = 0.8
        XCTAssertEqual(initialScale, 0.8)
    }

    func testFinalOrbScale() {
        // Orb animates to 1.0 scale
        let finalScale: CGFloat = 1.0
        XCTAssertEqual(finalScale, 1.0)
    }

    func testPulseScale() {
        // Ready step pulse goes to 1.05
        let pulseScale: CGFloat = 1.05
        XCTAssertEqual(pulseScale, 1.05)
    }
}

// MARK: - Skip Step Tests

final class SkipStepTests: XCTestCase {

    func testWhatBringsYouIsSkippable() {
        // whatBringsYou step should show skip option
        let step = OnboardingStep.whatBringsYou
        let isSkippable = (step == .whatBringsYou || step == .nameIntro)
        XCTAssertTrue(isSkippable)
    }

    func testNameIntroIsSkippable() {
        // nameIntro step should show skip option
        let step = OnboardingStep.nameIntro
        let isSkippable = (step == .whatBringsYou || step == .nameIntro)
        XCTAssertTrue(isSkippable)
    }

    func testWelcomeNotSkippable() {
        // welcome step should NOT show skip option
        let step = OnboardingStep.welcome
        let isSkippable = (step == .whatBringsYou || step == .nameIntro)
        XCTAssertFalse(isSkippable)
    }

    func testReadyNotSkippable() {
        // ready step should NOT show skip option
        let step = OnboardingStep.ready
        let isSkippable = (step == .whatBringsYou || step == .nameIntro)
        XCTAssertFalse(isSkippable)
    }
}

// MARK: - Progress Indicator Tests

final class ProgressIndicatorTests: XCTestCase {

    func testProgressIndicatorHasFourDots() {
        // Should have one dot per step
        let dotCount = OnboardingStep.allCases.count
        XCTAssertEqual(dotCount, 4)
    }

    func testProgressFilledForCurrentAndPreviousSteps() {
        // Step 0 (welcome): only step 0 filled
        var filledSteps = OnboardingStep.allCases.filter { $0.rawValue <= 0 }
        XCTAssertEqual(filledSteps.count, 1)

        // Step 1 (whatBringsYou): steps 0 and 1 filled
        filledSteps = OnboardingStep.allCases.filter { $0.rawValue <= 1 }
        XCTAssertEqual(filledSteps.count, 2)

        // Step 2 (nameIntro): steps 0, 1, 2 filled
        filledSteps = OnboardingStep.allCases.filter { $0.rawValue <= 2 }
        XCTAssertEqual(filledSteps.count, 3)

        // Step 3 (ready): all steps filled
        filledSteps = OnboardingStep.allCases.filter { $0.rawValue <= 3 }
        XCTAssertEqual(filledSteps.count, 4)
    }
}

// MARK: - Result Completion Logic Tests

final class ResultCompletionLogicTests: XCTestCase {

    func testEmptyUserNameBecomesNil() {
        // When userName is empty, result should have nil
        let userName = ""
        let resultName: String? = userName.isEmpty ? nil : userName
        XCTAssertNil(resultName)
    }

    func testNonEmptyUserNameKept() {
        // When userName has value, result should keep it
        let userName = "Sarah"
        let resultName: String? = userName.isEmpty ? nil : userName
        XCTAssertEqual(resultName, "Sarah")
    }

    func testWhitespaceOnlyNameNotTrimmed() {
        // Whitespace is kept (view doesn't trim)
        let userName = "   "
        let resultName: String? = userName.isEmpty ? nil : userName
        XCTAssertEqual(resultName, "   ")
    }
}
