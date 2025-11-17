/**
 * Error thrown when an invalid state transition is attempted
 */
export class InvalidTransitionError extends Error {
  constructor(
    public readonly currentState: string,
    public readonly targetState: string,
    public readonly escrowId: string
  ) {
    super(
      `Invalid state transition from ${currentState} to ${targetState} for escrow ${escrowId}`
    );
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Error thrown when a guard check fails
 */
export class GuardViolationError extends Error {
  constructor(
    public readonly guardName: string,
    public readonly reason: string,
    public readonly escrowId: string
  ) {
    super(`Guard violation: ${guardName} - ${reason} for escrow ${escrowId}`);
    this.name = 'GuardViolationError';
  }
}

/**
 * Error thrown when transition execution fails
 */
export class TransitionExecutionError extends Error {
  override readonly cause?: Error;

  constructor(
    public readonly escrowId: string,
    public readonly targetState: string,
    cause?: Error
  ) {
    super(
      `Failed to execute transition to ${targetState} for escrow ${escrowId}${
        cause ? `: ${cause.message}` : ''
      }`
    );
    this.name = 'TransitionExecutionError';
    this.cause = cause;
  }
}
