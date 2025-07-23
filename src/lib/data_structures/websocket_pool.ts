/**
 * A resource pool for WebSocket connections.
 * The pool maintains a set of up to 4 connections for each URL. Connections are acquired from the
 * pool on a per-URL basis. Idle connections are automatically closed after 60 seconds.
 */
export class WebSocketPool {
  static #instance: WebSocketPool;

  #pool: Map<string, WebSocket[]> = new Map();
  #busy: Set<WebSocket> = new Set();
  #waitQueue: Map<string, Array<(ws: WebSocket | PromiseLike<WebSocket>) => void>> = new Map();
  #idleTimers: Map<WebSocket, number> = new Map();
  #maxConnectionsPerUrl;
  #idleTimeoutMs;

  /**
   * Private constructor invoked when the singleton instance is first created.
   * @param maxConnectionsPerUrl - The maximum number of connections to maintain for each URL.
   * @param idleTimeoutMs - The timeout in milliseconds after which idle connections will be
   * closed. Defaults to 60 seconds.
   */
  private constructor(maxConnectionsPerUrl: number = 4, idleTimeoutMs: number = 60000) {
    this.#maxConnectionsPerUrl = maxConnectionsPerUrl;
    this.#idleTimeoutMs = idleTimeoutMs;
  }

  /**
   * Returns the singleton instance of the WebsocketPool.
   * @returns The singleton instance.
   */
  public static get instance(): WebSocketPool {
    if (!WebSocketPool.#instance) {
      WebSocketPool.#instance = new WebSocketPool();
    }
    return WebSocketPool.#instance;
  }

  // #region Resource Management Interface

  /**
   * Acquires a WebSocket connection for the specified URL. If a connection is available in the
   * pool, that connection is returned. If no connection is available but the pool is not full, a
   * new connection is created and returned. If the pool is full, the request is queued until a
   * connection is released, at which point the newly-available connection is returned to the
   * caller.
   *
   * @param url - The URL to connect to.
   * @returns A promise that resolves with a WebSocket connection.
   */
  public acquire(url: string): Promise<WebSocket> {
    const availableSocket = this.#findAvailableSocket(url);
    if (availableSocket) {
      // Clear any idle timer for this socket since it's being used again.
      this.#clearIdleTimer(availableSocket);
      // Add the reference to the socket resource to the busy set.
      this.#busy.add(availableSocket);
      return Promise.resolve(availableSocket);
    }

    const socketsForUrl = this.#pool.get(url) || [];
    if (socketsForUrl.length < this.#maxConnectionsPerUrl) {
      return this.#createSocket(url);
    }

    return new Promise(resolve => {
      if (!this.#waitQueue.has(url)) {
        this.#waitQueue.set(url, []);
      }
      this.#waitQueue.get(url)!.push(resolve);
    });
  }

  /**
   * Releases a WebSocket connection back to the pool. If there are pending requests for the same
   * URL, the connection is passed to the requestor in the queue. Otherwise, the connection is
   * marked as available.
   *
   * @param ws - The WebSocket connection to release.
   */
  public release(ws: WebSocket): void {
    const url = ws.url;

    const waitingResolvers = this.#waitQueue.get(url);
    if (waitingResolvers?.length > 0) {
      const resolver = waitingResolvers.shift()!;
      
      // Cleanup empty queues immediately
      if (waitingResolvers.length === 0) {
        this.#waitQueue.delete(url);
      }
      
      resolver(ws);
      return;
    }

    // If no requestors are waiting, delete the reference from the busy set and start idle timer.
    this.#busy.delete(ws);
    this.#startIdleTimer(ws);
  }

  /**
   * Sets the idle timeout for WebSocket connections.
   *
   * @param timeoutMs - The timeout in milliseconds after which idle connections will be closed.
   */
  public setIdleTimeout(timeoutMs: number): void {
    this.#idleTimeoutMs = timeoutMs;
  }

  /**
   * Gets the current idle timeout setting.
   *
   * @returns The current idle timeout in milliseconds.
   */
  public getIdleTimeout(): number {
    return this.#idleTimeoutMs;
  }

  /**
   * Closes all WebSocket connections and "drains" the pool.
   */
  public drain(): void {
    // Clear all idle timers first
    for (const timer of this.#idleTimers.values()) {
      clearTimeout(timer);
    }
    this.#idleTimers.clear();

    for (const sockets of this.#pool.values()) {
      for (const ws of sockets) {
        ws.onclose = null;
        ws.close();
      }
    }
    this.#pool.clear();
    this.#busy.clear();
    this.#waitQueue.clear();
  }

  // #endregion

  // #region Private Helper Methods

  #findAvailableSocket(url: string): WebSocket | null {
    const sockets = this.#pool.get(url);
    if (!sockets) {
      return null;
    }
    return sockets.find(ws => !this.#busy.has(ws) && ws.readyState === WebSocket.OPEN) ?? null;
  }

  #createSocket(url: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(url);
        ws.onopen = () => {
          const sockets = this.#pool.get(url) || [];
          sockets.push(ws);
          this.#pool.set(url, sockets);
          this.#busy.add(ws);
          resolve(ws);
        };

        // Remove the socket from the pool when it is closed. The socket may be closed by either
        // the client or the server.
        ws.onclose = () => this.#removeSocket(ws);

        ws.onerror = () => reject(new Error('WebSocket error'));
      } catch (error) {
        reject(error);
      }
    });
  }

  #removeSocket(ws: WebSocket): void {
    const url = ws.url;
    const sockets = this.#pool.get(url);
    if (sockets) {
      const index = sockets.indexOf(ws);
      if (index > -1) {
        sockets.splice(index, 1);
      }
      if (sockets.length === 0) {
        this.#pool.delete(url);
      }
    }
    this.#busy.delete(ws);
    this.#clearIdleTimer(ws);
  }

  /**
   * Starts an idle timer for the specified WebSocket. The connection will be automatically
   * closed after the idle timeout period if it remains unused.
   *
   * @param ws - The WebSocket to start the idle timer for.
   */
  #startIdleTimer(ws: WebSocket): void {
    // Clear any existing timer first
    this.#clearIdleTimer(ws);

    const timer = setTimeout(() => {
      // Check if the socket is still idle (not in busy set) before closing
      if (!this.#busy.has(ws) && ws.readyState === WebSocket.OPEN) {
        ws.close();
        this.#removeSocket(ws);
      }
    }, this.#idleTimeoutMs);

    this.#idleTimers.set(ws, timer);
  }

  /**
   * Clears the idle timer for the specified WebSocket.
   *
   * @param ws - The WebSocket to clear the idle timer for.
   */
  #clearIdleTimer(ws: WebSocket): void {
    const timer = this.#idleTimers.get(ws);
    if (timer) {
      clearTimeout(timer);
      this.#idleTimers.delete(ws);
    }
  }

  // #endregion
}
