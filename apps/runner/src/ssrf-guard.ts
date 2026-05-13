import { lookup as nodeLookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

export type LookupFn = (hostname: string) => Promise<{ address: string; family: number }>;

let _lookup: LookupFn = nodeLookup;

export function __setLookupForTests(fn: LookupFn | null): void {
  _lookup = fn ?? nodeLookup;
}

type IPv4Instance = InstanceType<typeof ipaddr.IPv4>;
type IPv6Instance = InstanceType<typeof ipaddr.IPv6>;

type BlockedRange = readonly [network: string, prefixBits: number, family: "ipv4" | "ipv6"];

const BLOCKED_RANGES: ReadonlyArray<BlockedRange> = [
  ["10.0.0.0", 8, "ipv4"],
  ["172.16.0.0", 12, "ipv4"],
  ["192.168.0.0", 16, "ipv4"],
  ["127.0.0.0", 8, "ipv4"],
  ["169.254.0.0", 16, "ipv4"],
  ["0.0.0.0", 8, "ipv4"],
  ["100.64.0.0", 10, "ipv4"],
  ["::1", 128, "ipv6"],
  ["fc00::", 7, "ipv6"],
  ["fe80::", 10, "ipv6"],
  ["::ffff:0:0", 96, "ipv6"],
];

const BLOCKED_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.googleapis.com",
  "169.254.169.254",
  "fd00:ec2::254",
]);

export class SsrfError extends Error {
  readonly range: string;
  constructor(message: string, range: string) {
    super(message);
    this.name = "SsrfError";
    this.range = range;
  }
}

export async function assertSafeUrl(raw: string, allowPrivate: boolean): Promise<void> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SsrfError(`Invalid URL: ${raw}`, "invalid-url");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new SsrfError(`Only http/https supported (got ${u.protocol})`, "bad-protocol");
  }
  const hostname = u.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) {
    throw new SsrfError(`Blocked host: ${hostname}`, hostname);
  }
  if (allowPrivate) return;

  let address: string;
  try {
    const r = await _lookup(hostname);
    address = r.address;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new SsrfError(`DNS resolution failed for ${hostname}: ${reason}`, "dns-failure");
  }

  let addr: IPv4Instance | IPv6Instance;
  try {
    addr = ipaddr.parse(address);
  } catch {
    throw new SsrfError(`Cannot parse resolved address: ${address}`, "parse-failure");
  }

  for (const [net, bits, family] of BLOCKED_RANGES) {
    if (family !== addr.kind()) continue;
    let matched = false;
    if (family === "ipv4") {
      const range = ipaddr.IPv4.parse(net);
      matched = (addr as IPv4Instance).match(range, bits);
    } else {
      const range = ipaddr.IPv6.parse(net);
      matched = (addr as IPv6Instance).match(range, bits);
    }
    if (matched) {
      throw new SsrfError(
        `Refusing to measure ${address} in blocked range ${net}/${String(bits)} ` +
          `(set OHMYPERF_RUNNER_ALLOW_PRIVATE=1 to override)`,
        `${net}/${String(bits)}`,
      );
    }
  }
}
