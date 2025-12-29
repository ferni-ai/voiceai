/**
 * Menu Navigation Test Runner
 *
 * Browser-based E2E test runner for menu navigation.
 * Can be run headless via Playwright or in-browser for visual debugging.
 *
 * Usage:
 *   pnpm test:menu                      # Run all menu scenarios
 *   pnpm test:menu --category=insights  # Run specific category
 *   pnpm test:menu --id=ins-001         # Run specific scenario
 *   pnpm test:menu --tag=new            # Run by tag
 *   pnpm test:menu --visual             # Run with visible browser
 *   pnpm test:menu --core               # Run core scenarios only
 */

import {
  ALL_MENU_SCENARIOS,
  getScenariosByCategory,
  getScenarioById,
  getScenariosByTag,
  getCoreScenarios,
  getMenuScenarioSummary,
  type MenuTestScenario,
  type MenuTestResult,
  type MenuTestCategory,
  type RelationshipStage,
} from '../scenarios/menu-scenarios.js';

// ============================================================================
// TYPES
// ============================================================================

export interface MenuTestRunOptions {
  scenarios?: MenuTestScenario[];
  category?: MenuTestCategory;
  scenarioId?: string;
  tag?: string;
  coreOnly?: boolean;
  visual?: boolean; // Show browser
  verbose?: boolean;
  stopOnFailure?: boolean;
  baseUrl?: string;
  timeout?: number; // Default scenario timeout
}

export interface MenuTestReport {
  timestamp: Date;
  duration: number;
  totalScenarios: number;
  passed: number;
  failed: number;
  skipped: number;
  results: MenuTestResult[];
  summary: {
    byCategory: Record<string, { passed: number; failed: number }>;
    byTag: Record<string, { passed: number; failed: number }>;
  };
}

// ============================================================================
// BROWSER TEST EXECUTOR
// ============================================================================

/**
 * Execute a single menu test scenario
 * This can be run in-browser or via Playwright
 */
class MenuTestExecutor {
  private scenario: MenuTestScenario;
  private baseUrl: string;
  private timeout: number;
  private startTime: number = 0;
  private errors: string[] = [];

  constructor(scenario: MenuTestScenario, baseUrl: string, timeout: number) {
    this.scenario = scenario;
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  /**
   * Execute the test scenario
   */
  async execute(): Promise<MenuTestResult> {
    this.startTime = Date.now();
    this.errors = [];

    try {
      // 1. Set up preconditions
      await this.setupPreconditions();

      // 2. Open the menu
      await this.openMenu();

      // 3. Expand the target section if needed
      if (this.scenario.sectionId) {
        await this.expandSection(this.scenario.sectionId);
      }

      // 4. Check visibility based on preconditions
      if (this.scenario.expectedResult.type === 'hidden') {
        return this.checkHidden();
      }

      // 5. Execute test steps
      for (const step of this.scenario.steps) {
        await this.executeStep(step);
      }

      // 6. Verify expected result
      const passed = await this.verifyResult();

      return this.buildResult(passed);
    } catch (error) {
      this.errors.push(error instanceof Error ? error.message : String(error));
      return this.buildResult(false);
    } finally {
      // Cleanup
      await this.cleanup();
    }
  }

  /**
   * Set up preconditions (localStorage, relationship stage, etc.)
   */
  private async setupPreconditions(): Promise<void> {
    const { preconditions } = this.scenario;
    if (!preconditions) return;

    // Set relationship stage
    if (preconditions.relationshipStage) {
      await this.setRelationshipStage(preconditions.relationshipStage);
    }

    // Set team unlock status
    if (preconditions.isTeamUnlocked !== undefined) {
      await this.setTeamUnlockStatus(preconditions.isTeamUnlocked);
    }

    // Set admin status
    if (preconditions.isAdmin !== undefined) {
      await this.setAdminStatus(preconditions.isAdmin);
    }

    // Set Spotify status
    if (preconditions.spotifyConnected !== undefined) {
      await this.setSpotifyStatus(preconditions.spotifyConnected);
    }

    // Set user ID
    if (preconditions.userId) {
      localStorage.setItem('ferni_user_id', preconditions.userId);
    }
  }

  /**
   * Set relationship stage in localStorage
   */
  private async setRelationshipStage(stage: RelationshipStage): Promise<void> {
    // The relationship stage service reads from localStorage
    const stageData = {
      stage,
      conversationCount: this.getConversationCountForStage(stage),
      totalDays: this.getDaysForStage(stage),
      lastConversation: new Date().toISOString(),
    };
    localStorage.setItem('ferni_relationship_stage', JSON.stringify(stageData));
  }

  private getConversationCountForStage(stage: RelationshipStage): number {
    const counts: Record<RelationshipStage, number> = {
      'first-meeting': 0,
      'getting-started': 3,
      'building-trust': 10,
      'established': 25,
      'deep-partnership': 50,
    };
    return counts[stage];
  }

  private getDaysForStage(stage: RelationshipStage): number {
    const days: Record<RelationshipStage, number> = {
      'first-meeting': 0,
      'getting-started': 2,
      'building-trust': 7,
      'established': 21,
      'deep-partnership': 60,
    };
    return days[stage];
  }

  private async setTeamUnlockStatus(unlocked: boolean): Promise<void> {
    // This depends on how team unlock is stored
    if (unlocked) {
      localStorage.setItem('ferni_team_unlocked', JSON.stringify({
        ferni: true,
        peter: true,
        maya: true,
        jordan: true,
        alex: true,
        nayan: true,
      }));
    } else {
      localStorage.removeItem('ferni_team_unlocked');
    }
  }

  private async setAdminStatus(isAdmin: boolean): Promise<void> {
    if (isAdmin) {
      localStorage.setItem('ferni_admin_id', 'test-admin');
    } else {
      localStorage.removeItem('ferni_admin_id');
    }
  }

  private async setSpotifyStatus(connected: boolean): Promise<void> {
    localStorage.setItem('spotify_connected', JSON.stringify(connected));
  }

  /**
   * Open the settings menu
   */
  private async openMenu(): Promise<void> {
    const trigger = document.querySelector('.settings-trigger');
    if (!trigger) {
      throw new Error('Settings trigger not found');
    }
    (trigger as HTMLElement).click();
    await this.waitFor('.settings-menu--visible', 1000);
  }

  /**
   * Expand a collapsible section
   */
  private async expandSection(sectionId: string): Promise<void> {
    const header = document.querySelector(`[data-section="${sectionId}"]`);
    if (!header) {
      // Section might not exist (e.g., admin section for non-admins)
      return;
    }

    const section = header.closest('.settings-menu__section');
    if (section && !section.classList.contains('settings-menu__section--expanded')) {
      (header as HTMLElement).click();
      await this.delay(300); // Wait for animation
    }
  }

  /**
   * Execute a single test step
   */
  private async executeStep(step: { action: string; target: string; waitFor?: string; timeout?: number }): Promise<void> {
    const timeout = step.timeout || this.timeout;

    switch (step.action) {
      case 'click':
        await this.click(step.target);
        break;
      case 'tap':
        await this.tap(step.target);
        break;
      case 'rightClick':
        await this.rightClick(step.target);
        break;
      case 'hover':
        await this.hover(step.target);
        break;
      case 'scroll':
        await this.scrollTo(step.target);
        break;
      case 'wait':
        await this.delay(timeout);
        break;
    }

    if (step.waitFor) {
      await this.waitFor(step.waitFor, timeout);
    }
  }

  private async click(selector: string): Promise<void> {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    (element as HTMLElement).click();
  }

  private async tap(selector: string): Promise<void> {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    
    // Simulate touch event
    const touch = new Touch({
      identifier: Date.now(),
      target: element,
      clientX: 0,
      clientY: 0,
    });
    
    element.dispatchEvent(new TouchEvent('touchstart', { touches: [touch] }));
    element.dispatchEvent(new TouchEvent('touchend', { touches: [] }));
  }

  private async rightClick(selector: string): Promise<void> {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    
    element.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
    }));
  }

  private async hover(selector: string): Promise<void> {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    
    element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  }

  private async scrollTo(selector: string): Promise<void> {
    const element = document.querySelector(selector);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.delay(300);
    }
  }

  private waitFor(selector: string, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const check = () => {
        if (document.querySelector(selector)) {
          resolve();
          return;
        }
        
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for: ${selector}`));
          return;
        }
        
        requestAnimationFrame(check);
      };
      
      check();
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check that an element is hidden
   */
  private checkHidden(): MenuTestResult {
    const { menuAction } = this.scenario;
    const element = document.querySelector(`[data-action="${menuAction}"]`);
    const isHidden = !element || (element as HTMLElement).offsetParent === null;
    
    return this.buildResult(isHidden);
  }

  /**
   * Verify the expected result
   */
  private async verifyResult(): Promise<boolean> {
    const { expectedResult } = this.scenario;

    switch (expectedResult.type) {
      case 'modal':
        return this.verifyModal(expectedResult.modalId);
      case 'panel':
        return this.verifyPanel(expectedResult.panelId);
      case 'toggle':
        return this.verifyToggle(expectedResult.stateKey, expectedResult.newValue);
      case 'redirect':
        return this.verifyRedirect(expectedResult.urlPattern);
      case 'toast':
        return this.verifyToast(expectedResult.message);
      case 'locked':
        return this.verifyLocked(expectedResult.shakeAnimation);
      case 'hidden':
        return true; // Already checked in checkHidden
      default:
        return false;
    }
  }

  private verifyModal(modalId: string): boolean {
    // Look for modal by class or data attribute
    const modal = document.querySelector(`.${modalId}, [data-modal="${modalId}"]`);
    return modal !== null && (modal as HTMLElement).offsetParent !== null;
  }

  private verifyPanel(panelId: string): boolean {
    const panel = document.querySelector(`.${panelId}, [data-panel="${panelId}"]`);
    return panel !== null && (panel as HTMLElement).offsetParent !== null;
  }

  private verifyToggle(stateKey: string, expectedValue: boolean): boolean {
    const stored = localStorage.getItem(stateKey);
    if (stored === null) return !expectedValue;
    
    try {
      return JSON.parse(stored) === expectedValue;
    } catch {
      return stored === String(expectedValue);
    }
  }

  private verifyRedirect(urlPattern: RegExp): boolean {
    return urlPattern.test(window.location.href);
  }

  private verifyToast(messagePattern: RegExp): boolean {
    const toasts = document.querySelectorAll('.ferni-toast, .toast');
    for (let i = 0; i < toasts.length; i++) {
      const toast = toasts[i];
      if (messagePattern.test(toast.textContent || '')) {
        return true;
      }
    }
    return false;
  }

  private verifyLocked(expectShake: boolean): boolean {
    const { menuAction } = this.scenario;
    const button = document.querySelector(`[data-action="${menuAction}"]`);
    
    if (!button) return false;
    
    const isLocked = button.getAttribute('data-locked') === 'true';
    const hasShakeClass = button.classList.contains('settings-menu__item--shake');
    
    return isLocked && (!expectShake || hasShakeClass);
  }

  /**
   * Build the test result
   */
  private buildResult(passed: boolean): MenuTestResult {
    return {
      scenario: this.scenario,
      passed,
      duration: Date.now() - this.startTime,
      uiState: this.captureUIState(),
      errors: this.errors,
    };
  }

  private captureUIState(): MenuTestResult['uiState'] {
    const visibleModals: string[] = [];
    const visiblePanels: string[] = [];
    const activeToasts: string[] = [];

    // Find visible modals
    document.querySelectorAll('[data-modal], .modal, [role="dialog"]').forEach((el) => {
      if ((el as HTMLElement).offsetParent !== null) {
        visibleModals.push(el.className || (el as HTMLElement).dataset.modal || 'unknown');
      }
    });

    // Find visible panels
    document.querySelectorAll('[data-panel], .panel').forEach((el) => {
      if ((el as HTMLElement).offsetParent !== null) {
        visiblePanels.push(el.className || (el as HTMLElement).dataset.panel || 'unknown');
      }
    });

    // Find toasts
    document.querySelectorAll('.ferni-toast, .toast').forEach((el) => {
      activeToasts.push(el.textContent || '');
    });

    // Capture relevant localStorage
    const localStorageSnapshot: Record<string, string> = {};
    const keysToCapture = [
      'ferni_menu_pinned',
      'ferni_menu_expanded',
      'ferni_relationship_stage',
      'ferni_team_unlocked',
      'spotify_connected',
    ];
    
    for (const key of keysToCapture) {
      const value = localStorage.getItem(key);
      if (value) {
        localStorageSnapshot[key] = value;
      }
    }

    return {
      visibleModals,
      visiblePanels,
      activeToasts,
      currentUrl: window.location.href,
      localStorage: localStorageSnapshot,
    };
  }

  /**
   * Clean up after test
   */
  private async cleanup(): Promise<void> {
    // Close menu if open
    const menu = document.querySelector('.settings-menu--visible');
    if (menu) {
      const closeBtn = menu.querySelector('.settings-menu__close');
      if (closeBtn) {
        (closeBtn as HTMLElement).click();
      }
    }

    // Close any open modals
    document.querySelectorAll('[data-modal-close], .modal__close').forEach((btn) => {
      (btn as HTMLElement).click();
    });

    await this.delay(300);
  }
}

// ============================================================================
// TEST RUNNER
// ============================================================================

/**
 * Run menu navigation tests
 */
export async function runMenuTests(options: MenuTestRunOptions = {}): Promise<MenuTestReport> {
  const startTime = Date.now();
  const results: MenuTestResult[] = [];
  const baseUrl = options.baseUrl || window.location.origin;
  const defaultTimeout = options.timeout || 5000;

  // Determine which scenarios to run
  let scenarios = options.scenarios || ALL_MENU_SCENARIOS;

  if (options.scenarioId) {
    const scenario = getScenarioById(options.scenarioId);
    scenarios = scenario ? [scenario] : [];
  } else if (options.category) {
    scenarios = getScenariosByCategory(options.category);
  } else if (options.tag) {
    scenarios = getScenariosByTag(options.tag);
  } else if (options.coreOnly) {
    scenarios = getCoreScenarios();
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          MENU NAVIGATION - SYNTHETIC TESTS                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const summary = getMenuScenarioSummary();
  console.log(`📋 Total scenarios available: ${summary.total}`);
  console.log(`🏃 Running: ${scenarios.length} scenarios\n`);

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const scenario of scenarios) {
    console.log(`\n🧪 [${scenario.id}] ${scenario.name}`);
    console.log(`   Category: ${scenario.category}`);
    console.log(`   Action: ${scenario.menuAction}`);

    try {
      const executor = new MenuTestExecutor(scenario, baseUrl, defaultTimeout);
      const result = await executor.execute();

      results.push(result);

      if (result.passed) {
        passed++;
        console.log(`   ✅ PASSED (${result.duration}ms)`);
      } else {
        failed++;
        console.log(`   ❌ FAILED`);
        console.log(`      Expected: ${JSON.stringify(scenario.expectedResult)}`);

        if (result.errors.length > 0) {
          for (const error of result.errors) {
            console.log(`      ⚠️ ${error}`);
          }
        }

        if (options.stopOnFailure) {
          console.log('\n⛔ Stopping on first failure');
          break;
        }
      }

      if (options.verbose) {
        console.log(`   📝 UI State: ${JSON.stringify(result.uiState, null, 2)}`);
      }
    } catch (error) {
      failed++;
      console.log(`   💥 ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
      results.push({
        scenario,
        passed: false,
        duration: 0,
        uiState: {
          visibleModals: [],
          visiblePanels: [],
          activeToasts: [],
          currentUrl: window.location.href,
          localStorage: {},
        },
        errors: [error instanceof Error ? error.message : String(error)],
      });
    }
  }

  const duration = Date.now() - startTime;

  // Build summary
  const byCategory: Record<string, { passed: number; failed: number }> = {};
  const byTag: Record<string, { passed: number; failed: number }> = {};

  for (const result of results) {
    const cat = result.scenario.category;
    byCategory[cat] = byCategory[cat] || { passed: 0, failed: 0 };

    if (result.passed) {
      byCategory[cat].passed++;
    } else {
      byCategory[cat].failed++;
    }

    for (const tag of result.scenario.tags || []) {
      byTag[tag] = byTag[tag] || { passed: 0, failed: 0 };
      if (result.passed) {
        byTag[tag].passed++;
      } else {
        byTag[tag].failed++;
      }
    }
  }

  const report: MenuTestReport = {
    timestamp: new Date(),
    duration,
    totalScenarios: scenarios.length,
    passed,
    failed,
    skipped,
    results,
    summary: { byCategory, byTag },
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

  console.log('\nBy Tag:');
  for (const [tag, stats] of Object.entries(byTag)) {
    const pct = ((stats.passed / (stats.passed + stats.failed)) * 100).toFixed(0);
    console.log(`  ${tag}: ${stats.passed}/${stats.passed + stats.failed} (${pct}%)`);
  }

  if (failed > 0) {
    console.log('\n❌ Some tests failed. Check the detailed output above.');
  } else {
    console.log('\n✅ All tests passed!');
  }

  return report;
}

// ============================================================================
// BROWSER INTERFACE (for running from console)
// ============================================================================

// Make available on window for browser console testing
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).runMenuTests = runMenuTests;
  (window as unknown as Record<string, unknown>).menuTestScenarios = ALL_MENU_SCENARIOS;
  console.log('🧪 Menu tests loaded. Run with: runMenuTests()');
  console.log('   Options: runMenuTests({ category: "insights" })');
  console.log('   Options: runMenuTests({ tag: "new" })');
  console.log('   Options: runMenuTests({ coreOnly: true })');
}

export { MenuTestExecutor };
