interface WebSocketPoolWaitingQueueItem {
  url: string;
  resolve: (ws: WebSocket) => void;
  reject: (reason?: any) => void;
}

/**
 * A resource pool for WebSocket connections. Its purpose is to allow multiple requestors to share
 * an open WebSocket connection for greater resource efficiency.
 *
 * The pool maintains a single connection per URL. Requestors may acquire a reference to a
 * connection, and are expected to release it when it is no longer needed. If the number of
 * requestors using a connection drops to zero and no new requestors acquire it for a set period,
 * the connection is closed.
 */
export class WebSocketPool {
  static #shared: WebSocketPool;

  #pool: Map<string, WebSocket> = new Map();
  #connecting: Map<string, Promise<WebSocket>> = new Map();
  #refCounts: Map<WebSocket, number> = new Map();
  #idleTimers: Map<WebSocket, ReturnType<typeof setTimeout>> = new Map();
  #idleTimeoutMs: number;
  #maxConnections: number;
  #waitingQueue: WebSocketPoolWaitingQueueItem[] = [];

  /**
   * Private constructor invoked when the singleton instance is first created.
   * @param idleTimeoutMs - The timeout in milliseconds after which idle connections will be
   * closed. Defaults to 60 seconds.
   * @param maxConnections - The maximum number of simultaneous WebSocket connections. Defaults to
   * 16.
   */
  private constructor(idleTimeoutMs: number = 60000, maxConnections: number = 16) {
    this.#idleTimeoutMs = idleTimeoutMs;
    this.#maxConnections = maxConnections;
  }

  /**
   * Returns the singleton instance of the WebsocketPool.
   * @returns The singleton instance.
   */
  public static get instance(): WebSocketPool {
    if (!WebSocketPool.#shared) {
      WebSocketPool.#shared = new WebSocketPool();
    }
    return WebSocketPool.#shared;
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
  public async acquire(url: string): Promise<WebSocket> {
    const normalizedUrl = this.#normalizeUrl(url);
    const existingSocket = this.#pool.get(normalizedUrl);

    if (existingSocket && existingSocket.readyState < WebSocket.CLOSING) {
      this.#checkOutSocket(existingSocket);
      return Promise.resolve(existingSocket);
    }

    const connectingPromise = this.#connecting.get(normalizedUrl);
    if (connectingPromise) {
      const ws = await connectingPromise;
      if (ws.readyState === WebSocket.OPEN) {
        this.#checkOutSocket(ws);
        return ws;
      }
      throw new Error(`[WebSocketPool] WebSocket connection failed for ${normalizedUrl}`);
    }

    if (this.#pool.size + this.#connecting.size >= this.#maxConnections) {
      return new Promise((resolve, reject) => {
        this.#waitingQueue.push({ url: normalizedUrl, resolve, reject });
      });
    }

    const newConnectionPromise = this.#createSocket(normalizedUrl);
    this.#connecting.set(normalizedUrl, newConnectionPromise);

    newConnectionPromise.finally(() => {
      this.#connecting.delete(normalizedUrl);
    });

    return newConnectionPromise;
  }

  /**
   * Releases a WebSocket connection back to the pool. If there are pending requests for the same
   * URL, the connection is passed to the requestor in the queue. Otherwise, the connection is
   * marked as available.
   *
   * @param ws - The WebSocket connection to release.
   */
  public release(ws: WebSocket): void {
    const currentCount = this.#refCounts.get(ws);
    if (!currentCount) {
      throw new Error('[WebSocketPool] Attempted to release an unmanaged WebSocket connection.');
    }

    if (currentCount > 0) {
      const newCount = currentCount - 1;
      this.#refCounts.set(ws, newCount);

      if (newCount === 0) {
        this.#startIdleTimer(ws);
      }
    }
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
   * Sets the maximum number of simultaneous WebSocket connections.
   *
   * @param limit - The new connection limit.
   */
  public set maxConnections(limit: number) {
    this.#maxConnections = limit;
    this.#processWaitingQueue();
  }

  /**
   * Gets the current maximum number of simultaneous WebSocket connections.
   *
   * @returns The current connection limit.
   */
  public get maxConnections(): number {
    return this.#maxConnections;
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

    for (const { reject } of this.#waitingQueue) {
      reject(new Error('[WebSocketPool] Draining pool.'));
    }
    this.#waitingQueue = [];

    for (const promise of this.#connecting.values()) {
      // While we can't cancel the connection attempt, we can prevent callers from using it.
      promise.catch(() => {
        /* ignore connection errors during drain */
      });
    }
    this.#connecting.clear();

    for (const ws of this.#pool.values()) {
      ws.close();
    }
    this.#pool.clear();
    this.#refCounts.clear();
  }

  // #endregion

  // #region Private Helper Methods

  #createSocket(url: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(url);
        ws.onopen = () => {
          this.#pool.set(url, ws);
          this.#refCounts.set(ws, 1);

          // Remove the socket from the pool when it is closed. The socket may be closed by
          // either the client or the server.
          ws.onclose = () => this.#removeSocket(ws);
          resolve(ws);
        };

        ws.onerror = (event) => {
          this.#processWaitingQueue();
          reject(new Error(`[WebSocketPool] WebSocket connection failed for ${url}: ${event.type}`));
        };
      } catch (error) {
        this.#processWaitingQueue();
        reject(error);
      }
    });
  }

  #removeSocket(ws: WebSocket): void {
    const url = ws.url;
    this.#pool.delete(url);
    this.#refCounts.delete(ws);
    this.#clearIdleTimer(ws);
    this.#processWaitingQueue();
  }

  /**
   * Starts an idle timer for the specified WebSocket. The connection will be automatically
   * closed after the idle timeout period if it remains unused.
   *
   * @param ws - The WebSocket for which to start the idle timer.
   */
  #startIdleTimer(ws: WebSocket): void {
    // Clear any existing timer first
    this.#clearIdleTimer(ws);

    const timer = setTimeout(() => {
      const refCount = this.#refCounts.get(ws);
      if ((!refCount || refCount === 0) && ws.readyState === WebSocket.OPEN) {
        ws.close();
        this.#removeSocket(ws);
      }
    }, this.#idleTimeoutMs);

    this.#idleTimers.set(ws, timer);
  }

  /**
   * Clears the idle timer for the specified WebSocket.
   *
   * @param ws - The WebSocket for which to clear the idle timer.
   */
  #clearIdleTimer(ws: WebSocket): void {
    const timer = this.#idleTimers.get(ws);
    if (timer) {
      clearTimeout(timer);
      this.#idleTimers.delete(ws);
    }
  }

  #processWaitingQueue(): void {
    while (
      this.#waitingQueue.length > 0 &&
      this.#pool.size + this.#connecting.size < this.#maxConnections
    ) {
      const nextInQueue = this.#waitingQueue.shift();

      if (!nextInQueue) {
        continue;
      }

      const { url, resolve, reject } = nextInQueue;
      // Re-check if a connection for this URL was created while this request was in the queue
      const existingSocket = this.#pool.get(url);
      if (existingSocket && existingSocket.readyState < WebSocket.CLOSING) {
        this.#checkOutSocket(existingSocket);
        resolve(existingSocket);
      } else {
        const connectingPromise = this.#connecting.get(url);
        if (connectingPromise) {
          connectingPromise.then(resolve, reject);
        }
      }
    }
  }

  #checkOutSocket(ws: WebSocket): void {
    const count = (this.#refCounts.get(ws) || 0) + 1;
    this.#refCounts.set(ws, count);
    this.#clearIdleTimer(ws);
  }

  #normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // The URL constructor correctly normalizes scheme and hostname casing.
      let normalized = urlObj.toString();

      // The logic to remove a trailing slash for connection coalescing can be kept,
      // but should be done on the normalized string.
      if (urlObj.pathname !== '/' && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }
      
      return normalized;
    } catch {
      // If URL is invalid, return it as-is and let WebSocket constructor handle the error.
      return url;
    }
  }

  // #endregion
}
