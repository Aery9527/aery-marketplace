import net from "node:net";

import { parseBrokerEndpoint } from "./lib/broker-endpoint.mjs";

const MAX_REQUEST_BYTES = 64 * 1024;

function responseError(id, code, message) {
  return { id: id ?? null, error: { code, message } };
}

function send(socket, response) {
  if (!socket.destroyed) {
    socket.write(`${JSON.stringify(response)}\n`);
  }
}

export async function startClaudeBroker(options) {
  const { endpoint, ownerId, session } = options ?? {};
  if (!ownerId || typeof session?.interrupt !== "function" || typeof session?.close !== "function") {
    throw new Error("Broker startup requires one owner and one Claude session.");
  }

  const target = parseBrokerEndpoint(endpoint);
  const sockets = new Set();
  let closePromise = null;
  let sessionClosePromise = null;
  let sessionClosed = false;

  async function closeSession() {
    if (sessionClosed) {
      return;
    }
    if (sessionClosePromise) {
      return sessionClosePromise;
    }
    sessionClosePromise = (async () => {
      try {
        await session.close();
        sessionClosed = true;
      } finally {
        if (!sessionClosed) {
          sessionClosePromise = null;
        }
      }
    })();
    return sessionClosePromise;
  }

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding("utf8");
    let buffer = "";

    socket.on("data", async (chunk) => {
      buffer += chunk;
      if (Buffer.byteLength(buffer, "utf8") > MAX_REQUEST_BYTES) {
        send(socket, responseError(null, "request-too-large", "Broker request exceeds 64 KiB."));
        socket.end();
        return;
      }

      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (!line.trim()) {
          continue;
        }

        let request;
        try {
          request = JSON.parse(line);
        } catch (error) {
          send(socket, responseError(null, "invalid-json", `Invalid JSON: ${error.message}`));
          continue;
        }

        const id = request?.id ?? null;
        if (request?.params?.ownerId !== ownerId) {
          send(socket, responseError(id, "owner-mismatch", "Control request does not own this Claude session."));
          continue;
        }

        if (request.method === "session/interrupt") {
          try {
            send(socket, { id, result: await session.interrupt() });
          } catch (error) {
            send(socket, responseError(id, "interrupt-failed", error instanceof Error ? error.message : String(error)));
          }
          continue;
        }

        if (request.method === "broker/shutdown") {
          try {
            await closeSession();
            send(socket, { id, result: {} });
            socket.end();
            setImmediate(() => close().catch(() => {}));
          } catch (error) {
            send(socket, responseError(id, "shutdown-failed", error instanceof Error ? error.message : String(error)));
          }
          continue;
        }

        send(socket, responseError(id, "unsupported-method", `Unsupported broker method: ${request?.method ?? ""}`));
      }
    });

    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => sockets.delete(socket));
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(target.path);
  });

  function close() {
    if (closePromise) {
      return closePromise;
    }
    closePromise = (async () => {
      await closeSession();
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error?.code === "ERR_SERVER_NOT_RUNNING") {
            resolve();
          } else if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    })();
    return closePromise;
  }

  return { endpoint, ownerId, close };
}
