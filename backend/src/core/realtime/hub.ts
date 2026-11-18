import type { FastifyReply } from 'fastify';

/** In-memory fan-out of server-sent events, keyed by user. Single instance only. */
export class EventHub {
  private readonly clients = new Map<string, Set<FastifyReply>>();

  subscribe(userId: string, reply: FastifyReply): () => void {
    const set = this.clients.get(userId) ?? new Set<FastifyReply>();
    set.add(reply);
    this.clients.set(userId, set);
    return () => {
      set.delete(reply);
      if (set.size === 0) this.clients.delete(userId);
    };
  }

  publish(userId: string, event: string, data: unknown): void {
    const set = this.clients.get(userId);
    if (!set) return;
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const reply of set) reply.raw.write(frame);
  }
}

export const hub = new EventHub();
