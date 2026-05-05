import WebSocket from "ws";

export type ReconnectingWsOptions = {
  /** 새 소켓 팩토리 */
  createSocket: () => WebSocket;
  /** 연결 직후 (구독 전송 등) */
  onOpen?: (ws: WebSocket) => void;
  onMessage?: (raw: string, ws: WebSocket) => void;
  onError?: (err: Error) => void;
  /** 최소 재연결 지연(ms) */
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** 로그 프리픽스 */
  label?: string;
};

function log(prefix: string, msg: string) {
  console.log(`[${prefix}] ${new Date().toISOString()} ${msg}`);
}

/**
 * 끊김·에러 시 지수 백오프로 재연결하는 WebSocket 래퍼.
 */
export function createReconnectingWs(opts: ReconnectingWsOptions): {
  start: () => void;
  stop: () => void;
  getSocket: () => WebSocket | null;
} {
  const label = opts.label ?? "ws";
  const base = opts.baseDelayMs ?? 1_000;
  const max = opts.maxDelayMs ?? 60_000;

  let socket: WebSocket | null = null;
  let attempt = 0;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (closed) return;
    clearTimer();
    const exp = Math.min(max, base * Math.pow(2, attempt));
    const jitter = Math.random() * 500;
    const delay = exp + jitter;
    attempt += 1;
    log(label, `reconnect in ${Math.round(delay)}ms (attempt ${attempt})`);
    reconnectTimer = setTimeout(connect, delay);
  };

  const connect = () => {
    if (closed) return;
    clearTimer();
    try {
      socket = opts.createSocket();
    } catch (e) {
      opts.onError?.(e instanceof Error ? e : new Error(String(e)));
      scheduleReconnect();
      return;
    }

    socket.on("open", () => {
      attempt = 0;
      log(label, "connected");
      opts.onOpen?.(socket!);
    });

    socket.on("message", (data) => {
      const raw = typeof data === "string" ? data : data.toString();
      opts.onMessage?.(raw, socket!);
    });

    socket.on("close", (code, reason) => {
      log(label, `close code=${code} reason=${reason.toString()}`);
      socket = null;
      if (!closed) scheduleReconnect();
    });

    socket.on("error", (err) => {
      log(label, `error ${err.message}`);
      opts.onError?.(err);
    });
  };

  return {
    start: () => {
      closed = false;
      attempt = 0;
      connect();
    },
    stop: () => {
      closed = true;
      clearTimer();
      socket?.close();
      socket = null;
    },
    getSocket: () => socket,
  };
}
