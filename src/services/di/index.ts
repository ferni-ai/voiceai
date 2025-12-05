/**
 * Dependency Injection Module
 *
 * Exports the DI container, service tokens, and DI-enabled services.
 */

export {
  Container,
  getContainer,
  resetContainer,
  Tokens,
  defineInjectable,
  type Factory,
  type ServiceId,
  type Injectable,
} from './container.js';

// DI-enabled services
export {
  UserIdentificationService,
  UserIdentificationToken,
  createUserIdentificationService,
  registerUserIdentificationService,
  getUserIdentificationService,
  type UserIdentificationDeps,
  type IdentificationResult,
} from './user-identification-di.js';

// Bootstrap and setup
export {
  bootstrapServices,
  resetServices,
  resolveMemoryStore,
  resolveVectorStore,
  resolveProductivityStore,
  resolveAgentBus,
  getServicesFromDI,
  type BootstrapOptions,
} from './setup.js';
