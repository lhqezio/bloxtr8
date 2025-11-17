// Main state machine class
export { EscrowStateMachine } from './state-machine.js';
export type { EscrowStateMachineOptions } from './state-machine.js';

// Transition validator
export { TransitionValidator } from './transition-validator.js';

// Transition executor
export { TransitionExecutor } from './transition-executor.js';

// Guard executor
export { GuardExecutor } from './guards/guard-executor.js';

// Guards
export {
  statePreconditionGuard,
  createIdempotencyGuard,
  businessRulesGuard,
} from './guards/index.js';
export { createActorAuthorizationGuard } from './guards/actor-authorization-guard.js';

// Types
export type {
  TransitionContext,
  TransitionResult,
  GuardResult,
  Guard,
  TransitionAction,
} from './types.js';

// Errors
export {
  InvalidTransitionError,
  GuardViolationError,
  TransitionExecutionError,
} from './errors.js';
