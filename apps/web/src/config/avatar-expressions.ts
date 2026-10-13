/**
 * The entry point to Ferni's expression tokens (design-system/tokens/
 * expressions.json → expressions.generated.ts). Code outside config imports
 * the expression data and types from here, never from the generated file,
 * so a regeneration changes one import site (apps/web architecture rules).
 *
 * @module config/avatar-expressions
 */

export { EXPRESSIONS, type ExpressionConfig, type ExpressionId } from './expressions.generated.js';
