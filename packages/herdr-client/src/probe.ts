import { HerdrClient, HerdrError, LogFn } from './client';

export interface ProbeResult {
  /** Required methods the server advertises. */
  present: string[];
  /** Required methods the server does not advertise. */
  missing: string[];
  version: string;
  protocol: number;
  /** Every method name the server enumerated, or `undefined` when unparseable. */
  catalogue?: string[];
}

/** A method name Herdr will never have, used to provoke the enumeration. */
const BOGUS_METHOD = 'gsd.probe_unknown_method';

/**
 * Parse the method catalogue out of an `invalid_request` message:
 *
 *   invalid request: unknown variant `x`, expected one of `ping`, `server.stop`, … at line 1 column 52
 *
 * The first backtick-quoted token is the bogus method we sent; the rest is the
 * catalogue. Returns `undefined` when the message does not have that shape.
 */
export function parseMethodCatalogue(message: string, bogus = BOGUS_METHOD): string[] | undefined {
  const quoted = [...message.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? '');
  const methods = quoted.filter((m) => m !== bogus && m.length > 0);
  if (methods.length < 2) return undefined;
  return methods;
}

/**
 * Capability probe (spec §2.3 principle 6). Uses `ping` for version/protocol and
 * the "unknown method enumerates every method" behaviour from spike §1.2 —
 * there is no dedicated introspection call.
 *
 * If the enumeration cannot be parsed the probe warns and reports everything as
 * present: a probe must never be the reason a working daemon refuses to start.
 */
export async function probeMethods(client: HerdrClient, required: string[], log?: LogFn): Promise<ProbeResult> {
  const pong = await client.ping();
  let catalogue: string[] | undefined;
  try {
    await client.call(BOGUS_METHOD, {});
    log?.('warn', 'herdr accepted a bogus method; method probe skipped');
  } catch (err) {
    if (err instanceof HerdrError && err.code === 'invalid_request') {
      catalogue = parseMethodCatalogue(err.message);
      if (!catalogue) log?.('warn', 'could not parse herdr method catalogue', { message: err.message.slice(0, 200) });
    } else if (err instanceof HerdrError && (err.code === 'socket_unavailable' || err.code === 'timeout')) {
      throw err;
    } else {
      log?.('warn', 'unexpected error probing herdr methods', { code: err instanceof HerdrError ? err.code : 'unknown' });
    }
  }

  if (!catalogue) {
    return { present: [...required], missing: [], version: pong.version, protocol: pong.protocol };
  }
  const known = new Set(catalogue);
  return {
    present: required.filter((m) => known.has(m)),
    missing: required.filter((m) => !known.has(m)),
    version: pong.version,
    protocol: pong.protocol,
    catalogue,
  };
}
