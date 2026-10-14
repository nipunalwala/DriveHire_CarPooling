export type DomainEventName =
  | 'user.registered'
  | 'user.verified'
  | 'driver.submitted'
  | 'driver.verified'
  | 'driver.rejected'
  | 'vehicle.submitted'
  | 'vehicle.verified'
  | 'vehicle.rejected'
  | 'booking.created'
  | 'booking.confirmed'
  | 'booking.cancelled'
  | 'carpool.published'
  | 'carpool.request_created'
  | 'carpool.request_approved'
  | 'ride.assigned'
  | 'ride.started'
  | 'ride.completed';
export type DomainEvent = {
  name: DomainEventName;
  occurredAt: string;
  aggregateId: string;
  actorId?: string;
  payload: Readonly<Record<string, unknown>>;
};
type Listener = (event: DomainEvent) => void | Promise<void>;

export class DomainEventBus {
  private readonly listeners = new Map<DomainEventName, Set<Listener>>();
  on(name: DomainEventName, listener: Listener): () => void {
    const set = this.listeners.get(name) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(name, set);
    return () => {
      set.delete(listener);
      if (!set.size) this.listeners.delete(name);
    };
  }
  async emit(event: DomainEvent): Promise<void> {
    for (const listener of this.listeners.get(event.name) ?? []) await listener(event);
  }
}
export const domainEvents = new DomainEventBus();
