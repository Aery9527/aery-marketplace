import test from "node:test";
import assert from "node:assert/strict";

import {
  createStreamLineReader,
  describeResult,
  isInitEvent,
  isTurnResult,
  parseStreamLine,
  readCapabilities,
  readControlResponse,
  StreamProtocolError
} from "../scripts/lib/stream-protocol.mjs";

test("parseStreamLine ignores blank lines", () => {
  assert.equal(parseStreamLine("   "), null);
});

test("parseStreamLine rejects a line that is not JSON", () => {
  assert.throws(() => parseStreamLine("not json"), StreamProtocolError);
});

test("parseStreamLine rejects JSON that is not an event object", () => {
  assert.throws(() => parseStreamLine("[1,2,3]"), StreamProtocolError);
  assert.throws(() => parseStreamLine("\"text\""), StreamProtocolError);
});

test("parseStreamLine rejects an event without a string type", () => {
  assert.throws(() => parseStreamLine(JSON.stringify({ subtype: "init" })), StreamProtocolError);
  assert.throws(() => parseStreamLine(JSON.stringify({ type: 7 })), StreamProtocolError);
});

test("parseStreamLine accepts an unknown event type", () => {
  const event = parseStreamLine(JSON.stringify({ type: "something_new_v9" }));
  assert.equal(event.type, "something_new_v9");
});

test("createStreamLineReader reassembles events split across chunks", () => {
  const seen = [];
  const reader = createStreamLineReader((event) => seen.push(event));

  reader.push('{"type":"assist');
  reader.push('ant"}\n{"type":"res');
  reader.push('ult","subtype":"success"}\n');

  assert.deepEqual(seen.map((event) => event.type), ["assistant", "result"]);
});

test("createStreamLineReader emits a trailing event without a newline on flush", () => {
  const seen = [];
  const reader = createStreamLineReader((event) => seen.push(event));

  reader.push('{"type":"result","subtype":"success"}');
  assert.equal(seen.length, 0);

  reader.flush();
  assert.deepEqual(seen.map((event) => event.type), ["result"]);
});

test("isInitEvent and isTurnResult identify the session boundaries", () => {
  assert.equal(isInitEvent({ type: "system", subtype: "init" }), true);
  assert.equal(isInitEvent({ type: "system", subtype: "hook_started" }), false);
  assert.equal(isTurnResult({ type: "result", subtype: "success" }), true);
  assert.equal(isTurnResult({ type: "assistant" }), false);
});

test("readCapabilities returns an empty list when the field is absent", () => {
  assert.deepEqual(readCapabilities({ type: "system", subtype: "init" }), []);
  assert.deepEqual(readCapabilities(undefined), []);
});

test("readCapabilities keeps only string entries", () => {
  const capabilities = readCapabilities({ capabilities: ["interrupt_receipt_v1", 5, null] });
  assert.deepEqual(capabilities, ["interrupt_receipt_v1"]);
});

test("describeResult exposes the fields commands render", () => {
  const described = describeResult({
    type: "result",
    subtype: "success",
    is_error: false,
    session_id: "abc",
    result: "done",
    structured_output: { verdict: "ok" },
    total_cost_usd: 0.5,
    duration_ms: 12
  });

  assert.deepEqual(described, {
    sessionId: "abc",
    subtype: "success",
    isError: false,
    text: "done",
    structuredOutput: { verdict: "ok" },
    totalCostUsd: 0.5,
    durationMs: 12
  });
});

test("describeResult reports an interrupted turn as an error", () => {
  const described = describeResult({ type: "result", subtype: "error_during_execution", is_error: true });
  assert.equal(described.isError, true);
  assert.equal(described.subtype, "error_during_execution");
  assert.equal(described.text, "");
});

test("readControlResponse extracts the request id and outcome", () => {
  const response = readControlResponse({
    type: "control_response",
    response: { subtype: "success", request_id: "bridge-interrupt-1", response: { still_queued: [] } }
  });

  assert.equal(response.requestId, "bridge-interrupt-1");
  assert.equal(response.subtype, "success");
  assert.equal(response.error, null);
});

test("readControlResponse returns null when there is no response payload", () => {
  assert.equal(readControlResponse({ type: "control_response" }), null);
});

test("a result frame without a subtype is rejected, not read as an empty success", () => {
  assert.throws(() => parseStreamLine(JSON.stringify({ type: "result" })), StreamProtocolError);
});

test("a result frame with a non-string result is rejected", () => {
  assert.throws(
    () => parseStreamLine(JSON.stringify({ type: "result", subtype: "success", result: { text: "x" } })),
    StreamProtocolError
  );
});

test("a result frame may carry a null result", () => {
  const event = parseStreamLine(JSON.stringify({ type: "result", subtype: "success", result: null }));
  assert.equal(event.subtype, "success");
});

test("a system frame without a subtype is rejected", () => {
  assert.throws(() => parseStreamLine(JSON.stringify({ type: "system" })), StreamProtocolError);
});

test("an init frame whose capabilities is not an array is rejected", () => {
  assert.throws(
    () => parseStreamLine(JSON.stringify({ type: "system", subtype: "init", capabilities: "all" })),
    StreamProtocolError
  );
});

test("a control_response without a response object is rejected", () => {
  assert.throws(
    () => parseStreamLine(JSON.stringify({ type: "control_response" })),
    StreamProtocolError
  );
});

test("a control_response without a request id is rejected", () => {
  assert.throws(
    () => parseStreamLine(JSON.stringify({ type: "control_response", response: { subtype: "success" } })),
    StreamProtocolError
  );
});

test("frames the real CLI emits are accepted", () => {
  const frames = [
    { type: "system", subtype: "init", session_id: "s", capabilities: ["interrupt_receipt_v1"] },
    { type: "system", subtype: "hook_started" },
    { type: "system", subtype: "thinking_tokens" },
    { type: "assistant", message: { role: "assistant", content: [] } },
    { type: "user", message: { role: "user", content: [] } },
    { type: "rate_limit_event" },
    { type: "stream_event", event: { delta: { type: "text_delta", text: "x" } } },
    { type: "result", subtype: "success", is_error: false, result: "done" },
    { type: "result", subtype: "error_during_execution", is_error: true },
    { type: "control_response", response: { subtype: "success", request_id: "r", response: {} } }
  ];

  for (const frame of frames) {
    assert.ok(parseStreamLine(JSON.stringify(frame)), `rejected ${frame.type}/${frame.subtype ?? ""}`);
  }
});

// `is_error` decides whether a turn is reported as a failure, so a truthy string must
// not slip through and be coerced.
test("a result frame with a non-boolean is_error is rejected", () => {
  assert.throws(
    () => parseStreamLine(JSON.stringify({ type: "result", subtype: "success", is_error: "false" })),
    StreamProtocolError
  );
});

test("a result frame with non-numeric cost or duration is rejected", () => {
  assert.throws(
    () => parseStreamLine(JSON.stringify({ type: "result", subtype: "success", total_cost_usd: "0.1" })),
    StreamProtocolError
  );
  assert.throws(
    () => parseStreamLine(JSON.stringify({ type: "result", subtype: "success", duration_ms: "12" })),
    StreamProtocolError
  );
});

test("an init frame with a non-string capability entry is rejected", () => {
  assert.throws(
    () => parseStreamLine(JSON.stringify({ type: "system", subtype: "init", capabilities: ["ok", 7] })),
    StreamProtocolError
  );
});

test("a frame with a non-string session_id is rejected", () => {
  assert.throws(
    () => parseStreamLine(JSON.stringify({ type: "result", subtype: "success", session_id: 42 })),
    StreamProtocolError
  );
});

test("an init frame may omit capabilities or send null", () => {
  assert.ok(parseStreamLine(JSON.stringify({ type: "system", subtype: "init" })));
  assert.ok(parseStreamLine(JSON.stringify({ type: "system", subtype: "init", capabilities: null })));
});
