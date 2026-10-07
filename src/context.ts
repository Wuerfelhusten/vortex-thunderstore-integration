import { HostContextSnapshot, OperationContext } from "./types";

export class TargetChangedError extends Error {
  readonly code = "TARGET_CHANGED" as const;

  constructor(message = "The selected game or profile changed while the operation was running") {
    super(`[TARGET_CHANGED] ${message}`);
    this.name = "TargetChangedError";
  }
}

export function createOperationContext(input: Omit<OperationContext, "createdAt">): OperationContext {
  return { ...input, createdAt: new Date().toISOString() };
}

export function assertContextCurrent(
  operation: OperationContext,
  current: HostContextSnapshot,
): void {
  if (
    operation.vortexGameId !== current.vortexGameId ||
    operation.profileId !== current.profileId ||
    operation.generation !== current.generation ||
    operation.mappingVersion !== current.mappingVersion ||
    operation.adapterVersion !== current.adapterVersion
  ) {
    throw new TargetChangedError();
  }
}

export class ContextGeneration {
  private value = 0;

  current(): number {
    return this.value;
  }

  advance(): number {
    this.value += 1;
    return this.value;
  }
}
