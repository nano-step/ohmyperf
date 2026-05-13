import { afterEach, describe, expect, it } from "vitest";
import { __setLookupForTests, assertSafeUrl, SsrfError } from "./ssrf-guard.js";

function mockLookupOnce(address: string, family: 4 | 6): void {
  let called = false;
  __setLookupForTests(async () => {
    if (called) throw new Error("lookup mock exhausted");
    called = true;
    return { address, family };
  });
}

function mockLookupReject(err: Error): void {
  __setLookupForTests(async () => {
    throw err;
  });
}

afterEach(() => {
  __setLookupForTests(null);
});

describe("assertSafeUrl", () => {
  it("rejects non-http(s) protocol", async () => {
    await expect(assertSafeUrl("file:///etc/passwd", false)).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSafeUrl("gopher://x", false)).rejects.toThrow(/http\/https/);
  });

  it("rejects an invalid URL string", async () => {
    await expect(assertSafeUrl("not a url", false)).rejects.toBeInstanceOf(SsrfError);
  });

  it("rejects localhost by host blocklist before DNS", async () => {
    await expect(assertSafeUrl("http://localhost/", false)).rejects.toThrow(
      /Blocked host: localhost/,
    );
  });

  it("rejects metadata.google.internal", async () => {
    await expect(assertSafeUrl("http://metadata.google.internal/x", false)).rejects.toThrow(
      /Blocked host/,
    );
  });

  it("rejects AWS IMDS literal 169.254.169.254", async () => {
    await expect(assertSafeUrl("http://169.254.169.254/", false)).rejects.toThrow(
      /Blocked host: 169\.254\.169\.254/,
    );
  });

  it.each([
    ["10.1.2.3", "10.0.0.0/8"],
    ["172.20.0.1", "172.16.0.0/12"],
    ["192.168.1.1", "192.168.0.0/16"],
    ["127.0.0.5", "127.0.0.0/8"],
    ["169.254.42.1", "169.254.0.0/16"],
    ["0.1.2.3", "0.0.0.0/8"],
    ["100.64.5.7", "100.64.0.0/10"],
  ])("rejects DNS resolved to %s (range %s)", async (ip, range) => {
    mockLookupOnce(ip, 4);
    try {
      await assertSafeUrl("http://example.test/", false);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(SsrfError);
      expect((e as SsrfError).range).toBe(range);
    }
  });

  it("rejects IPv6 loopback ::1", async () => {
    mockLookupOnce("::1", 6);
    await expect(assertSafeUrl("http://example.test/", false)).rejects.toThrow(/blocked range/);
  });

  it("rejects IPv6 fc00::/7 unique-local", async () => {
    mockLookupOnce("fd12:3456::1", 6);
    await expect(assertSafeUrl("http://example.test/", false)).rejects.toThrow(/blocked range/);
  });

  it("rejects IPv6 link-local fe80::/10", async () => {
    mockLookupOnce("fe80::1234", 6);
    await expect(assertSafeUrl("http://example.test/", false)).rejects.toThrow(/blocked range/);
  });

  it("rejects IPv4-mapped IPv6 ::ffff:127.0.0.1", async () => {
    mockLookupOnce("::ffff:127.0.0.1", 6);
    await expect(assertSafeUrl("http://example.test/", false)).rejects.toThrow(/blocked range/);
  });

  it("allows public IPv4", async () => {
    mockLookupOnce("93.184.216.34", 4);
    await expect(assertSafeUrl("https://example.com/", false)).resolves.toBeUndefined();
  });

  it("bypasses range checks when allowPrivate=true (but still blocks host list)", async () => {
    await expect(assertSafeUrl("http://10.0.0.1/", true)).resolves.toBeUndefined();
    await expect(assertSafeUrl("http://localhost/", true)).rejects.toThrow();
  });

  it("reports dns-failure range when lookup throws", async () => {
    mockLookupReject(new Error("ENOTFOUND"));
    try {
      await assertSafeUrl("http://nonexistent.invalid/", false);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(SsrfError);
      expect((e as SsrfError).range).toBe("dns-failure");
    }
  });
});
