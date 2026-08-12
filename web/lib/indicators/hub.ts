/**
 * In-process SSE fan-out. On Vercel each serverless instance has its own hub;
 * clients on the same instance get sub-second pushes. State API remains source of truth.
 */

type Listener = (event: string, data: unknown) => void;

const listeners = new Set<Listener>();

export function subscribeIndicators(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function broadcastIndicator(event: string, data: unknown) {
  for (const listener of Array.from(listeners)) {
    try {
      listener(event, data);
    } catch (e) {
      console.warn("[indicators/hub] listener error", e);
    }
  }
}

export function indicatorListenerCount(): number {
  return listeners.size;
}
