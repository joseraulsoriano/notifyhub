export interface ProviderCapacityWaitEvent {
  activeCount: number;
  waitingCount: number;
  limit: number;
}

export interface AcquireProviderCapacityInput {
  providerCode: string;
  notificationId: string;
  queue: string;
  limit: number;
  leaseMs: number;
  waitTimeoutMs: number;
  dispatchLeaseId: string;
  dispatchLeaseMs: number;
  onWaiting?: (event: ProviderCapacityWaitEvent) => void;
}

export interface ProviderCapacityLease {
  id: string;
  providerCode: string;
  activeCount: number;
  limit: number;
}

export interface ProviderCapacityStatus {
  provider: string;
  limit: number;
  activeCount: number;
  waitingCount: number;
}

export interface DispatchCapacityRepository {
  acquireDispatch(notificationId: string, leaseMs: number): Promise<string | null>;
  renewDispatch(leaseId: string, leaseMs: number): Promise<boolean>;
  releaseDispatch(leaseId: string): Promise<void>;
  acquire(input: AcquireProviderCapacityInput): Promise<ProviderCapacityLease>;
  release(leaseId: string): Promise<void>;
  list(
    providerLimits: Record<string, number>,
  ): Promise<{ observedAt: Date; providers: ProviderCapacityStatus[] }>;
}

export class ProviderCapacityWaitTimeoutError extends Error {
  constructor(providerCode: string) {
    super(`Timed out waiting for provider capacity: ${providerCode}`);
    this.name = 'ProviderCapacityWaitTimeoutError';
  }
}
