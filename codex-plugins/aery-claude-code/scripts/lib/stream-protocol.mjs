// Upstream type-checks the app-server protocol at build time. This package has no
// build step, so the same contract is enforced here at runtime: a malformed frame
// fails loudly instead of being silently treated as an empty turn.

export class StreamProtocolError extends Error {
  constructor(message, line) {
    super(message);
    this.name = "StreamProtocolError";
    this.line = line;
  }
}

// Unknown types are informational, not fatal: the CLI adds event types over time and a
// consumer is expected to ignore what it does not recognise. A frame whose type the
// bridge *does* act on must still carry the fields that action depends on, so those
// types are validated and everything else is passed through.
function checkOptional(event, field, predicate, description, fail) {
  if (field in event && event[field] !== null && !predicate(event[field])) {
    fail(description);
  }
}

const isString = (value) => typeof value === "string";
const isBoolean = (value) => typeof value === "boolean";
const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

const EVENT_VALIDATORS = Object.freeze({
  system(event, fail) {
    if (typeof event.subtype !== "string") {
      fail("a system event without a string `subtype`");
    }
    checkOptional(event, "session_id", isString, "a system event whose `session_id` is not a string", fail);
    if (event.subtype === "init" && "capabilities" in event && event.capabilities !== null) {
      if (!Array.isArray(event.capabilities)) {
        fail("an init event whose `capabilities` is not an array");
      } else if (!event.capabilities.every(isString)) {
        fail("an init event whose `capabilities` contains a non-string entry");
      }
    }
  },
  result(event, fail) {
    if (typeof event.subtype !== "string") {
      fail("a result event without a string `subtype`");
    }
    checkOptional(event, "result", isString, "a result event whose `result` is not a string", fail);
    // `is_error` decides whether a turn is reported as a failure, so a string "false"
    // must not be accepted and coerced to true.
    checkOptional(event, "is_error", isBoolean, "a result event whose `is_error` is not a boolean", fail);
    checkOptional(event, "session_id", isString, "a result event whose `session_id` is not a string", fail);
    checkOptional(event, "total_cost_usd", isNumber, "a result event whose `total_cost_usd` is not a number", fail);
    checkOptional(event, "duration_ms", isNumber, "a result event whose `duration_ms` is not a number", fail);
  },
  control_response(event, fail) {
    const response = event.response;
    if (response === null || typeof response !== "object" || Array.isArray(response)) {
      fail("a control_response without a response object");
      return;
    }
    if (typeof response.request_id !== "string") {
      fail("a control_response without a string `request_id`");
    }
    if (typeof response.subtype !== "string") {
      fail("a control_response without a string `subtype`");
    }
  }
});

export const VALIDATED_EVENT_TYPES = Object.freeze(Object.keys(EVENT_VALIDATORS));

export function parseStreamLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  let event;
  try {
    event = JSON.parse(trimmed);
  } catch (error) {
    throw new StreamProtocolError(`Claude emitted a line that is not JSON: ${error.message}`, trimmed);
  }

  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    throw new StreamProtocolError("Claude emitted a JSON value that is not an event object.", trimmed);
  }

  if (typeof event.type !== "string" || event.type === "") {
    throw new StreamProtocolError("Claude emitted an event without a string `type`.", trimmed);
  }

  const validate = EVENT_VALIDATORS[event.type];
  if (validate) {
    validate(event, (description) => {
      throw new StreamProtocolError(`Claude emitted ${description}.`, trimmed);
    });
  }

  return event;
}

export function createStreamLineReader(onEvent) {
  let buffer = "";
  return {
    push(chunk) {
      buffer += String(chunk);
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        const event = parseStreamLine(line);
        if (event) {
          onEvent(event);
        }
      }
    },
    flush() {
      const event = parseStreamLine(buffer);
      buffer = "";
      if (event) {
        onEvent(event);
      }
    }
  };
}

export function isInitEvent(event) {
  return event.type === "system" && event.subtype === "init";
}

export function isTurnResult(event) {
  return event.type === "result";
}

export function isAssistantMessage(event) {
  return event.type === "assistant";
}

// Feature detection reads this array rather than comparing version strings, as the
// CLI documentation requires. Absent on releases before 2.1.205.
export function readCapabilities(initEvent) {
  const capabilities = initEvent?.capabilities;
  return Array.isArray(capabilities) ? capabilities.filter((value) => typeof value === "string") : [];
}

export function readSessionId(event) {
  return typeof event?.session_id === "string" ? event.session_id : null;
}

export function describeResult(event) {
  return {
    sessionId: readSessionId(event),
    subtype: typeof event.subtype === "string" ? event.subtype : "unknown",
    isError: Boolean(event.is_error),
    text: typeof event.result === "string" ? event.result : "",
    structuredOutput: event.structured_output ?? null,
    totalCostUsd: typeof event.total_cost_usd === "number" ? event.total_cost_usd : null,
    durationMs: typeof event.duration_ms === "number" ? event.duration_ms : null
  };
}

export function buildUserMessage(text) {
  return {
    type: "user",
    message: { role: "user", content: [{ type: "text", text }] }
  };
}

export function buildInterruptRequest(requestId) {
  return {
    type: "control_request",
    request_id: requestId,
    request: { subtype: "interrupt" }
  };
}

export function readControlResponse(event) {
  const response = event?.response ?? null;
  if (!response || typeof response !== "object") {
    return null;
  }
  return {
    requestId: typeof response.request_id === "string" ? response.request_id : null,
    subtype: typeof response.subtype === "string" ? response.subtype : "unknown",
    error: response.subtype === "error" ? response.error ?? "unknown error" : null
  };
}
