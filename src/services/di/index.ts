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

// Store Interfaces (contracts for DI)
// NOTE: Only verified interfaces are exported. For internal stores like
// ProductivityStore, LifeDataStore, etc., import from their source files directly.
export type {
  // Core types
  QueryOptions,
  SearchResult,
  // Store interfaces (verified to match implementations)
  IMemoryStore,
  IVectorStore,
  IRedisCache,
} from './store-interfaces.js';

// Type guards
export { isMemoryStore, isRedisCache } from './store-interfaces.js';

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
  resolvePersonaRegistry,
  getServicesFromDI,
  type BootstrapOptions,
} from './setup.js';

// Persona Registry (OCP-compliant)
export type {
  IPersonaRegistry,
  PersonaDefinition,
  RegisteredPersona,
} from '../../personas/registry/persona-registry-interface.js';
export {
  getPersonaRegistry,
  resetPersonaRegistry,
} from '../../personas/registry/persona-registry-impl.js';
