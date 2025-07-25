/**
 * A representation of a WebSocket connection used internally by the WebSocketPool. Attaches
 * information about the connection's state within the resource pool to the connection itself.
 */
interface WebSocketHandle {
  ws: WebSocket;
  refCount: number;
  idleTimer?: ReturnType<typeof setTimeout>;
}

interface WebSocketPoolWaitingQueueItem {
  url: string;
  resolve: (handle: WebSocketHandle) => void;
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

  /**
   * A map of WebSocket URLs to the handles containing the connection and its state.
   */
  #pool: Map<string, WebSocketHandle> = new Map();

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
   * Sets the maximum number of simultaneous WebSocket connections.
   *
   * @param limit - The new connection limit.
   */
  public set maxConnections(limit: number) {
    if (limit === this.#maxConnections) {
      return;
    }

    if (limit == null || isNaN(limit)) {
      throw new Error('[WebSocketPool] Connection limit must be a number.');
    }

    if (limit <= 0) {
      throw new Error('[WebSocketPool] Connection limit must be greater than 0.');
    }

    if (!Number.isInteger(limit)) {
      throw new Error('[WebSocketPool] Connection limit must be an integer.');
    }

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
   * Sets the idle timeout for WebSocket connections.
   *
   * @param timeoutMs - The timeout in milliseconds after which idle connections will be closed.
   */
  public set idleTimeoutMs(timeoutMs: number) {
    if (timeoutMs === this.#idleTimeoutMs) {
      return;
    }

    if (timeoutMs == null || isNaN(timeoutMs)) {
      throw new Error('[WebSocketPool] Idle timeout must be a number.');
    }

    if (timeoutMs <= 0) {
      throw new Error('[WebSocketPool] Idle timeout must be greater than 0.');
    }

    if (!Number.isInteger(timeoutMs)) {
      throw new Error('[WebSocketPool] Idle timeout must be an integer.');
    }

    this.#idleTimeoutMs = timeoutMs;
  }

  /**
   * Gets the current idle timeout setting.
   *
   * @returns The current idle timeout in milliseconds.
   */
  public get idleTimeoutMs(): number {
    return this.#idleTimeoutMs;
  }

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
    const handle = this.#pool.get(normalizedUrl);

    try {
      if (handle && handle.ws.readyState === WebSocket.OPEN) {
        this.#checkOut(handle);
        return handle.ws;
      }

      if (this.#pool.size >= this.#maxConnections) {
        return new Promise((resolve, reject) => {
          this.#waitingQueue.push({ 
            url: normalizedUrl, 
            resolve: (handle) => resolve(handle.ws), 
            reject,
          });
        });
      }

      const newHandle = await this.#createSocket(normalizedUrl);
      return newHandle.ws;
    } catch (error) {
      throw new Error(
        `[WebSocketPool] Failed to acquire connection for ${normalizedUrl}: ${error}`
      );
    }
  }

  /**
   * Releases a WebSocket connection back to the pool. If there are pending requests for the same
   * URL, the connection is passed to the requestor in the queue. Otherwise, the connection is
   * marked as available.
   *
   * @param handle - The WebSocketHandle to release.
   */
  public release(ws: WebSocket): void {
    const normalizedUrl = this.#normalizeUrl(ws.url);
    const handle = this.#pool.get(normalizedUrl);
    if (!handle) {
      throw new Error('[WebSocketPool] Attempted to release an unmanaged WebSocket connection.');
    }

    if (--handle.refCount === 0) {
      this.#startIdleTimer(handle);
    }
  }

  /**
   * Closes all WebSocket connections and "drains" the pool.
   */
  public drain(): void {
    // Clear all idle timers first
    for (const handle of this.#pool.values()) {
      this.#clearIdleTimer(handle);
    }

    for (const { reject } of this.#waitingQueue) {
      reject(new Error('[WebSocketPool] Draining pool.'));
    }
    this.#waitingQueue = [];

    for (const handle of this.#pool.values()) {
      handle.ws.close();
    }
    this.#pool.clear();
  }

  // #endregion

  // #region Private Helper Methods

  #createSocket(url: string): Promise<WebSocketHandle> {
    return new Promise((resolve, reject) => {
      try {
        const handle: WebSocketHandle = {
          ws: new WebSocket(url),
          refCount: 1,
        };
        handle.ws.onopen = () => {
          this.#pool.set(url, handle);

          // Remove the socket from the pool when it is closed. The socket may be closed by
          // either the client or the server.
          handle.ws.onclose = () => this.#removeSocket(handle);
          resolve(handle);
        };

        handle.ws.onerror = (event) => {
          this.#removeSocket(handle);
          this.#processWaitingQueue();
          reject(
            new Error(`[WebSocketPool] WebSocket connection failed for ${url}: ${event.type}`)
          );
        };
      } catch (error) {
        this.#processWaitingQueue();
        reject(error);
      }
    });
  }

  #removeSocket(handle: WebSocketHandle): void {
    this.#clearIdleTimer(handle);
    handle.ws.onopen = handle.ws.onerror = handle.ws.onclose = null;
    this.#pool.delete(this.#normalizeUrl(handle.ws.url));
    this.#processWaitingQueue();
  }

  /**
   * Starts an idle timer for the specified WebSocket. The connection will be automatically
   * closed after the idle timeout period if it remains unused.
   *
   * @param ws - The WebSocket for which to start the idle timer.
   */
  #startIdleTimer(handle: WebSocketHandle): void {
    // Clear any existing timer first
    this.#clearIdleTimer(handle);

    handle.idleTimer = setTimeout(() => {
      const refCount = handle.refCount;
      if (refCount === 0 && handle.ws.readyState === WebSocket.OPEN) {
        handle.ws.close();
        this.#removeSocket(handle);
      }
    }, this.#idleTimeoutMs);
  }

  /**
   * Clears the idle timer for the specified WebSocket.
   *
   * @param handle - The WebSocketHandle for which to clear the idle timer.
   */
  #clearIdleTimer(handle: WebSocketHandle): void {
    const timer = handle.idleTimer;
    if (timer) {
      clearTimeout(timer);
      handle.idleTimer = undefined;
    }
  }

  /**
   * Processes pending requests to acquire a connection. Reuses existing connections when possible.
   */
  #processWaitingQueue(): void {
    while (
      this.#waitingQueue.length > 0 &&
      this.#pool.size < this.#maxConnections
    ) {
      const nextInQueue = this.#waitingQueue.shift();
      if (!nextInQueue) {
        continue;
      }

      const { url, resolve, reject } = nextInQueue;

      const existingHandle = this.#pool.get(url);
      if (existingHandle && existingHandle.ws.readyState === WebSocket.OPEN) {
        this.#checkOut(existingHandle);
        resolve(existingHandle);
        return;
      }

      this.#createSocket(url).then(resolve, reject);
    }
  }

  #checkOut(handle: WebSocketHandle): void {
    if (handle.refCount == null) {
      throw new Error('[WebSocketPool] Handle refCount unexpectedly null.');
    }

    ++handle.refCount;
    this.#clearIdleTimer(handle);
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
