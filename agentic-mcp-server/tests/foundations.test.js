import test from "node:test";
import assert from "node:assert/strict";
import { createId, isOpaqueId } from "../dist/support/ids.js";
import { loadConfig } from "../dist/config.js";
import { redact } from "../dist/support/redaction.js";
import { UrlPolicy } from "../dist/policy/urlPolicy.js";
import { FilePolicy } from "../dist/policy/filePolicy.js";
import { ToolFailure } from "../dist/mcp/errors.js";

test("opaque ids are prefixed and non-guessable in shape", () => {
  const id = createId("pg");
  assert.equal(isOpaqueId(id, "pg"), true);
  assert.equal(isOpaqueId(id, "rt"), false);
  assert.equal(isOpaqueId("pg_plain", "pg"), false);
});

test("configuration applies safe browser defaults", () => {
  const config = loadConfig();
  assert.equal(config.browser.headless, true);
  assert.deepEqual(config.policy.capabilities, ["browser.read", "browser.navigate"]);
  assert.ok(config.limits.maxChars > 0);
});

test("redaction removes secret fields and URL credentials", () => {
  const result = redact({ token: "secret", url: "https://example.test/path?token=secret#fragment", nested: { password: "value" } });
  assert.deepEqual(result, { token: "[REDACTED]", url: "https://example.test/path[REDACTED]", nested: { password: "[REDACTED]" } });
});

test("URL policy rejects local and credential-bearing targets", () => {
  const policy = new UrlPolicy(["example.test"]);
  assert.equal(policy.canonicalize("https://example.test/path#x").toString(), "https://example.test/path");
  for (const url of ["http://localhost", "http://192.168.1.2", "https://user:pass@example.test"]) {
    assert.throws(() => policy.canonicalize(url), ToolFailure);
  }
});

test("file policy does not allow prefix escapes", () => {
  const policy = new FilePolicy(["C:/approved"]);
  assert.equal(policy.resolveApproved("C:/approved/file.txt").toLowerCase(), "c:\\approved\\file.txt");
  assert.throws(() => policy.resolveApproved("C:/approved-other/file.txt"), ToolFailure);
});
