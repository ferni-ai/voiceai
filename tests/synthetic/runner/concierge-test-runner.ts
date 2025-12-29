/**
 * Concierge Calling System - Synthetic Test Runner
 *
 * Runs all concierge test scenarios with mock businesses.
 * Validates the full E2E flow from user request to confirmation.
 *
 * Usage:
 *   pnpm test:synthetic                    # Run all scenarios
 *   pnpm test:synthetic --quick            # Run quick scenarios only
 *   pnpm test:synthetic --category=healthcare  # Run specific category
 *   pnpm test:synthetic --id=hc-001        # Run specific scenario
 */

import { MockBusiness, type AgentInput, type BusinessResponse } from '../mocks/mock-business.js';
import {
  ALL_SCENARIOS,
  getScenariosByCategory,
  getScenarioById,
  getQuickTestScenarios,
  getScenarioSummary,
  type TestScenario,
  type TestResult,
  type ExpectedExtraction,
} from '../scenarios/concierge-scenarios.js';

// ============================================================================
// TYPES
// ============================================================================

export interface TestRunOptions {
  scenarios?: TestScenario[];
  category?: 'healthcare' | 'dining' | 'personal_service' | 'edge_case';
  scenarioId?: string;
  quickOnly?: boolean;
  verbose?: boolean;
  stopOnFailure?: boolean;
  parallelism?: number;
}

export interface TestReport {
  timestamp: Date;
  duration: number;
  totalScenarios: number;
  passed: number;
  failed: number;
  skipped: number;
  results: TestResult[];
  summary: {
    byCategory: Record<string, { passed: number; failed: number }>;
    byOutcome: Record<string, { passed: number; failed: number }>;
  };
}

// ============================================================================
// MOCK AGENT (Simulates ConciergeCallerAgent behavior)
// ============================================================================

/**
 * Simulated agent for testing (will be replaced by actual agent in production tests)
 */
class MockConciergeAgent {
  private scenario: TestScenario;
  private mockBusiness: MockBusiness;
  private conversationLog: Array<{ from: 'agent' | 'business'; content: unknown; timestamp: Date }> = [];
  private extractedData: Record<string, unknown> = {};
  private startTime: number = 0;

  constructor(scenario: TestScenario) {
    this.scenario = scenario;
    this.mockBusiness = new MockBusiness(scenario.mockBusiness);
  }

  /**
   * Execute the full call flow
   */
  async execute(): Promise<TestResult> {
    this.startTime = Date.now();

    try {
      // Phase 1: Resolve contact
      const contact = await this.resolveContact();
      if (!contact) {
        return this.buildResult('callback_requested', {
          askedForContactInfo: true,
        });
      }

      // Check for ambiguous contacts
      if (Array.isArray(contact)) {
        return this.buildResult('callback_requested', {
          askedForClarification: true,
          presentedOptions: contact.map(c => c.name),
        });
      }

      // Phase 2: Initiate call
      const connection = await this.mockBusiness.receiveCall();
      this.log('business', connection);

      // Phase 3: Handle call based on connection type
      let outcome: string;
      switch (connection.type) {
        case 'voicemail':
          outcome = await this.handleVoicemail(connection.greeting!);
          break;
        case 'ivr':
          outcome = await this.handleIVR(connection.menu!);
          break;
        case 'human':
          outcome = await this.handleHumanConversation(connection.greeting!);
          break;
        default:
          outcome = 'call_failed';
      }

      return this.buildResult(outcome, this.extractedData);
    } catch (error) {
      return this.buildResult('call_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Resolve "my doctor" / "my dentist" etc. to stored contact
   */
  private async resolveContact(): Promise<
    | { name: string; phone: string; type: string }
    | Array<{ name: string; phone: string; type: string }>
    | null
  > {
    const storedContacts = this.scenario.userContext?.storedContacts || [];

    if (storedContacts.length === 0) {
      return null;
    }

    // Extract entity type from request (doctor, dentist, restaurant, etc.)
    const request = this.scenario.userRequest.toLowerCase();
    const entityTypes = ['doctor', 'dentist', 'restaurant', 'salon', 'spa', 'clinic'];
    let matchedType: string | null = null;

    for (const type of entityTypes) {
      if (request.includes(type)) {
        matchedType = type;
        break;
      }
    }

    // Also check aliases
    if (!matchedType) {
      for (const contact of storedContacts) {
        for (const alias of contact.aliases || []) {
          if (request.includes(alias.toLowerCase())) {
            return contact;
          }
        }
      }
    }

    // Filter by type
    const matchingContacts = storedContacts.filter(
      (c) => c.type === matchedType || c.type.includes(matchedType || '')
    );

    if (matchingContacts.length === 0) {
      // Check aliases
      const byAlias = storedContacts.find((c) =>
        c.aliases?.some((a) => request.includes(a.toLowerCase()))
      );
      return byAlias || null;
    }

    if (matchingContacts.length > 1) {
      // Ambiguous - return all for clarification
      return matchingContacts;
    }

    return matchingContacts[0];
  }

  /**
   * Handle voicemail scenario
   */
  private async handleVoicemail(greeting: string): Promise<string> {
    this.log('business', greeting);

    // Leave voicemail message
    const message = this.generateVoicemailMessage();
    this.log('agent', { type: 'speech', content: message });

    this.extractedData.voicemailLeft = true;
    this.extractedData.voicemailIncludedCallback = message.toLowerCase().includes('call');

    return 'voicemail_left';
  }

  /**
   * Handle IVR navigation
   */
  private async handleIVR(menu: { prompt: string; options: Array<{ digit: string; description: string; leadsTo: string }>; allowsOperator: boolean }): Promise<string> {
    let currentMenu = menu;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      attempts++;

      // Log the menu prompt
      this.log('business', currentMenu.prompt);

      // Determine best option
      const selection = this.selectIVROption(currentMenu);
      this.log('agent', { type: 'dtmf', content: selection });

      // Get business response
      const response = await this.mockBusiness.handleInput({
        type: 'dtmf',
        content: selection,
        timestamp: new Date(),
      });

      this.log('business', response);

      // Check what we got
      if (response.type === 'speech') {
        // Reached human
        this.extractedData.reachedHuman = true;
        return this.handleHumanConversation(response.content);
      }

      if (response.type === 'hold_music') {
        // On hold
        this.extractedData.waitedOnHold = true;
        this.extractedData.holdDuration = response.holdDuration || 0;

        // Wait through hold
        await this.delay(Math.min(response.holdDuration || 0, 5000)); // Cap at 5s for tests

        // Get next response after hold
        const afterHold = await this.mockBusiness.handleInput({
          type: 'speech',
          content: '',
          timestamp: new Date(),
        });

        if (afterHold.type === 'speech') {
          this.extractedData.reachedHuman = true;
          return this.handleHumanConversation(afterHold.content);
        }
      }

      if (response.type === 'ivr_menu' && response.nextMenu) {
        currentMenu = response.nextMenu;
        continue;
      }

      if (response.type === 'disconnect') {
        return 'call_failed';
      }
    }

    return 'call_failed'; // Too many IVR attempts
  }

  /**
   * Select best IVR option based on goal
   */
  private selectIVROption(menu: { prompt: string; options: Array<{ digit: string; description: string }>; allowsOperator: boolean }): string {
    const prompt = menu.prompt.toLowerCase();
    const request = this.scenario.userRequest.toLowerCase();

    // Look for appointment/scheduling option
    if (request.includes('appointment') || request.includes('schedule')) {
      for (const opt of menu.options) {
        if (
          opt.description.toLowerCase().includes('appointment') ||
          opt.description.toLowerCase().includes('schedule') ||
          opt.description.toLowerCase().includes('new patient')
        ) {
          return opt.digit;
        }
      }
    }

    // Look for reservation option
    if (request.includes('reservation') || request.includes('book')) {
      for (const opt of menu.options) {
        if (opt.description.toLowerCase().includes('reservation')) {
          return opt.digit;
        }
      }
    }

    // Default: try operator or first option
    if (menu.allowsOperator) {
      return '0';
    }

    return menu.options[0]?.digit || '1';
  }

  /**
   * Handle conversation with human receptionist
   */
  private async handleHumanConversation(greeting: string): Promise<string> {
    this.log('business', greeting);

    // Generate initial request
    const request = this.generateInitialRequest();
    this.log('agent', { type: 'speech', content: request });

    let response = await this.mockBusiness.handleInput({
      type: 'speech',
      content: request,
      timestamp: new Date(),
    });

    let turns = 0;
    const maxTurns = 10;

    while (turns < maxTurns) {
      turns++;

      this.log('business', response);

      // Check for disconnection
      if (response.type === 'disconnect') {
        this.extractedData.disconnected = true;
        this.extractedData.retryQueued = true;
        return 'call_failed';
      }

      // Extract any data from response
      if (response.extractableData) {
        Object.assign(this.extractedData, response.extractableData);
      }

      // Check if we have confirmation
      if (this.extractedData.confirmed) {
        return this.determineSuccessOutcome();
      }

      // Check for no availability
      if (this.extractedData.fullyBooked) {
        return 'no_availability';
      }

      // Check for business issues
      if (this.extractedData.outOfBusiness) {
        this.extractedData.businessClosed = true;
        this.extractedData.contactMarkedInactive = true;
        return 'business_closed';
      }

      // Wrong number detection
      if (this.detectWrongNumber(response.content)) {
        this.extractedData.contactNeedsUpdate = true;
        return 'wrong_number';
      }

      // Generate follow-up based on response
      const followUp = this.generateFollowUp(response);
      if (!followUp) {
        break;
      }

      this.log('agent', { type: 'speech', content: followUp });

      response = await this.mockBusiness.handleInput({
        type: 'speech',
        content: followUp,
        timestamp: new Date(),
      });
    }

    // Determine final outcome
    if (this.extractedData.offeredTime && !this.extractedData.confirmed) {
      return 'callback_requested';
    }

    return 'call_failed';
  }

  /**
   * Generate initial request based on scenario
   */
  private generateInitialRequest(): string {
    const request = this.scenario.userRequest.toLowerCase();
    const contact = this.scenario.userContext?.storedContacts?.[0];
    const userName = 'my client'; // Would come from user profile

    if (request.includes('doctor') || request.includes('dentist') || request.includes('checkup')) {
      return `Hello, I'm calling on behalf of ${userName} to schedule an appointment${contact ? ` with ${contact.name}` : ''}. What's your earliest availability?`;
    }

    if (request.includes('reservation') || request.includes('restaurant')) {
      const partyMatch = request.match(/(\d+)\s*(?:people|person|guests?)/);
      const partySize = partyMatch ? partyMatch[1] : '2';
      return `Hi, I'd like to make a reservation for ${partySize} people. What do you have available?`;
    }

    if (request.includes('haircut') || request.includes('salon')) {
      const stylistMatch = request.match(/with\s+(\w+)/);
      const stylist = stylistMatch ? stylistMatch[1] : null;
      return `Hi, I'd like to book an appointment${stylist ? ` with ${stylist}` : ''}. What's available?`;
    }

    return `Hello, I'm calling on behalf of a client to schedule an appointment. What's your availability?`;
  }

  /**
   * Generate follow-up response
   */
  private generateFollowUp(response: BusinessResponse): string | null {
    const content = response.content.toLowerCase();

    // If offered a time, accept it
    if (content.includes('would that work') || content.includes('available')) {
      this.extractedData.acceptedOfferedTime = true;
      return "That works great, let's book that.";
    }

    // If asked about insurance
    if (content.includes('insurance')) {
      const insurance = this.scenario.userContext?.preferences?.insurance || 'Blue Cross';
      return `Their insurance is ${insurance}.`;
    }

    // If asked for callback number
    if (content.includes('callback') || content.includes('number')) {
      return "They can be reached at 555-123-4567.";
    }

    // If no availability, ask about waitlist
    if (content.includes('booked') || content.includes('busy') || content.includes('nothing')) {
      return "Could we be added to a cancellation waitlist?";
    }

    // If asking what service
    if (content.includes('what') && content.includes('service')) {
      return "Looking for a haircut.";
    }

    // End conversation
    return null;
  }

  /**
   * Generate voicemail message
   */
  private generateVoicemailMessage(): string {
    return `Hi, I'm calling on behalf of a client to schedule an appointment. Please call us back at 555-123-4567 at your earliest convenience. Thank you!`;
  }

  /**
   * Detect if we reached a wrong number
   */
  private detectWrongNumber(content: string): boolean {
    const lower = content.toLowerCase();
    const wrongIndicators = ["you've reached", 'pizza', 'wrong number', 'this is not'];

    // Check if the business name doesn't match what we expected
    const expectedName = this.scenario.userContext?.storedContacts?.[0]?.name?.toLowerCase();
    if (expectedName) {
      const mentionedBusiness = lower.includes('doctor') || lower.includes('clinic') || 
                                lower.includes('dental') || lower.includes('restaurant');
      
      if (!mentionedBusiness && wrongIndicators.some(i => lower.includes(i))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Determine success outcome type
   */
  private determineSuccessOutcome(): string {
    const category = this.scenario.category;

    if (category === 'dining') {
      return 'reservation_confirmed';
    }

    return 'appointment_confirmed';
  }

  /**
   * Log conversation turn
   */
  private log(from: 'agent' | 'business', content: unknown): void {
    this.conversationLog.push({ from, content, timestamp: new Date() });
  }

  /**
   * Build test result
   */
  private buildResult(outcome: string, extractedData: Record<string, unknown>): TestResult {
    const duration = Date.now() - this.startTime;
    const passed = this.checkAssertions(outcome, extractedData);

    return {
      scenario: this.scenario,
      passed: passed.allPassed,
      outcome,
      duration,
      extractedData,
      conversationLog: this.conversationLog,
      assertions: passed.details,
    };
  }

  /**
   * Check all assertions
   */
  private checkAssertions(
    outcome: string,
    extractedData: Record<string, unknown>
  ): { allPassed: boolean; details: Array<{ description: string; passed: boolean; details?: string }> } {
    const details: Array<{ description: string; passed: boolean; details?: string }> = [];

    // Check expected outcome
    const outcomeMatches = outcome === this.scenario.expectedOutcome;
    details.push({
      description: `Expected outcome: ${this.scenario.expectedOutcome}`,
      passed: outcomeMatches,
      details: outcomeMatches ? undefined : `Got: ${outcome}`,
    });

    // Check expected extraction
    if (this.scenario.expectedExtraction) {
      for (const [key, expectedValue] of Object.entries(this.scenario.expectedExtraction)) {
        const actualValue = extractedData[key];
        let passed: boolean;

        if (expectedValue === 'any') {
          passed = actualValue !== undefined;
        } else {
          passed = actualValue === expectedValue;
        }

        details.push({
          description: `Extracted ${key}: ${expectedValue}`,
          passed,
          details: passed ? undefined : `Got: ${actualValue}`,
        });
      }
    }

    // Check custom assertions
    if (this.scenario.assertions) {
      const mockResult: TestResult = {
        scenario: this.scenario,
        passed: true,
        outcome,
        duration: 0,
        extractedData,
        conversationLog: this.conversationLog,
        assertions: [],
      };

      for (const assertion of this.scenario.assertions) {
        try {
          const passed = assertion.check(mockResult);
          details.push({
            description: assertion.description,
            passed,
          });
        } catch (error) {
          details.push({
            description: assertion.description,
            passed: false,
            details: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
          });
        }
      }
    }

    const allPassed = details.every((d) => d.passed);
    return { allPassed, details };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// TEST RUNNER
// ============================================================================

/**
 * Run synthetic tests for the concierge calling system
 */
export async function runSyntheticTests(options: TestRunOptions = {}): Promise<TestReport> {
  const startTime = Date.now();
  const results: TestResult[] = [];

  // Determine which scenarios to run
  let scenarios = options.scenarios || ALL_SCENARIOS;

  if (options.scenarioId) {
    const scenario = getScenarioById(options.scenarioId);
    scenarios = scenario ? [scenario] : [];
  } else if (options.category) {
    scenarios = getScenariosByCategory(options.category);
  } else if (options.quickOnly) {
    scenarios = getQuickTestScenarios();
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        CONCIERGE CALLING SYSTEM - SYNTHETIC TESTS          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const summary = getScenarioSummary();
  console.log(`📋 Total scenarios: ${summary.total}`);
  console.log(`🏃 Running: ${scenarios.length} scenarios\n`);

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const scenario of scenarios) {
    console.log(`\n🧪 [${scenario.id}] ${scenario.name}`);
    console.log(`   Category: ${scenario.category}`);
    console.log(`   Request: "${scenario.userRequest}"`);

    try {
      const agent = new MockConciergeAgent(scenario);
      const result = await agent.execute();

      results.push(result);

      if (result.passed) {
        passed++;
        console.log(`   ✅ PASSED (${result.duration}ms)`);
      } else {
        failed++;
        console.log(`   ❌ FAILED`);
        console.log(`      Expected: ${scenario.expectedOutcome}`);
        console.log(`      Got: ${result.outcome}`);

        // Show failed assertions
        const failedAssertions = result.assertions.filter((a) => !a.passed);
        for (const assertion of failedAssertions) {
          console.log(`      ⚠️ ${assertion.description}`);
          if (assertion.details) {
            console.log(`         ${assertion.details}`);
          }
        }

        if (options.stopOnFailure) {
          console.log('\n⛔ Stopping on first failure');
          break;
        }
      }

      if (options.verbose) {
        console.log(`   📝 Conversation log (${result.conversationLog.length} turns)`);
      }
    } catch (error) {
      failed++;
      console.log(`   💥 ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
      results.push({
        scenario,
        passed: false,
        outcome: 'error',
        duration: 0,
        extractedData: {},
        conversationLog: [],
        assertions: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const duration = Date.now() - startTime;

  // Build summary
  const byCategory: Record<string, { passed: number; failed: number }> = {};
  const byOutcome: Record<string, { passed: number; failed: number }> = {};

  for (const result of results) {
    const cat = result.scenario.category;
    const out = result.outcome;

    byCategory[cat] = byCategory[cat] || { passed: 0, failed: 0 };
    byOutcome[out] = byOutcome[out] || { passed: 0, failed: 0 };

    if (result.passed) {
      byCategory[cat].passed++;
      byOutcome[out].passed++;
    } else {
      byCategory[cat].failed++;
      byOutcome[out].failed++;
    }
  }

  const report: TestReport = {
    timestamp: new Date(),
    duration,
    totalScenarios: scenarios.length,
    passed,
    failed,
    skipped,
    results,
    summary: { byCategory, byOutcome },
  };

  // Print summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                      TEST SUMMARY                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`⏱️  Duration: ${duration}ms`);
  console.log(`📊 Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`📈 Pass rate: ${((passed / scenarios.length) * 100).toFixed(1)}%\n`);

  console.log('By Category:');
  for (const [cat, stats] of Object.entries(byCategory)) {
    const pct = ((stats.passed / (stats.passed + stats.failed)) * 100).toFixed(0);
    console.log(`  ${cat}: ${stats.passed}/${stats.passed + stats.failed} (${pct}%)`);
  }

  console.log('\nBy Outcome:');
  for (const [out, stats] of Object.entries(byOutcome)) {
    console.log(`  ${out}: ${stats.passed} passed, ${stats.failed} failed`);
  }

  if (failed > 0) {
    console.log('\n❌ Some tests failed. Check the detailed output above.');
  } else {
    console.log('\n✅ All tests passed!');
  }

  return report;
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const options: TestRunOptions = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    quickOnly: args.includes('--quick') || args.includes('-q'),
    stopOnFailure: args.includes('--stop-on-failure') || args.includes('-s'),
  };

  // Parse --category=X
  const categoryArg = args.find((a) => a.startsWith('--category='));
  if (categoryArg) {
    options.category = categoryArg.split('=')[1] as TestRunOptions['category'];
  }

  // Parse --id=X
  const idArg = args.find((a) => a.startsWith('--id='));
  if (idArg) {
    options.scenarioId = idArg.split('=')[1];
  }

  const report = await runSyntheticTests(options);

  // Exit with failure code if tests failed
  if (report.failed > 0) {
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { MockConciergeAgent };
