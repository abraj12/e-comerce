import { EventEmitter } from 'events';
import { logger } from '../logging/logger.js';

export interface AppEvent<T = unknown> {
  name: string;
  payload: T;
  timestamp: string;
}

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  publish<T>(eventName: string, payload: T): void {
    const event: AppEvent<T> = {
      name: eventName,
      payload,
      timestamp: new Date().toISOString()
    };

    logger.debug(`[EVENT] Dispatched: ${eventName}`, { eventName });
    // Emit asynchronously to not block the calling request
    setImmediate(() => {
      this.emit(eventName, event);
    });
  }

  subscribe<T>(eventName: string, handler: (event: AppEvent<T>) => Promise<void> | void): void {
    this.on(eventName, async (event: AppEvent<T>) => {
      try {
        await handler(event);
      } catch (error) {
        logger.error(`Error processing event ${eventName}`, error as Error, { eventName });
      }
    });
  }
}

export const eventBus = new EventBus();
