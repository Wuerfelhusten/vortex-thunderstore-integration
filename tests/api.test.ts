import { describe, expect, it } from "vitest";
import { ThunderstoreApiClient } from "../src/api";
import { UnsafeInputError } from "../src/security";

describe("Thunderstore API transport", () => {
  it("binds the ambient fetch implementation for browser hosts", async () => {
    const originalFetch = globalThis.fetch;
    let receiver: unknown;
    globalThis.fetch = function (this: unknown, input: RequestInfo | URL): Promise<Response> {
      receiver = this;
      void input;
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    } as typeof fetch;
    try {
      const client = new ThunderstoreApiClient();
      await expect(client.getJson("/api/test")).resolves.toMatchObject({ value: { ok: true } });
      expect(receiver).toBe(globalThis);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("honours bounded retry-after retries for temporary failures", async () => {
    let calls = 0;
    const waits: number[] = [];
    const client = new ThunderstoreApiClient({
      fetchImpl: async () => {
        calls += 1;
        return calls === 1
          ? new Response("busy", { status: 429, headers: { "retry-after": "2" } })
          : new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
      },
      sleep: async (ms) => { waits.push(ms); },
      random: () => 0,
    });
    await expect(client.getJson("/api/test")).resolves.toMatchObject({ value: { ok: true } });
    expect(calls).toBe(2);
    expect(waits[0]).toBe(2000);
  });

  it("follows same-host pagination and blocks a foreign next link", async () => {
    const calls: string[] = [];
    const client = new ThunderstoreApiClient({
      fetchImpl: async (input) => {
        const url = String(input);
        calls.push(url);
        return url.endsWith("page=2")
          ? new Response(JSON.stringify({ results: [2] }), { status: 200 })
          : new Response(JSON.stringify({ results: [1], next: "https://thunderstore.io/api/test?page=2" }), { status: 200 });
      },
    });
    await expect(client.getAllPages<number>("/api/test")).resolves.toEqual([1, 2]);
    expect(calls).toHaveLength(2);

    const unsafeClient = new ThunderstoreApiClient({
      fetchImpl: async () => new Response(JSON.stringify({ results: [], next: "https://evil.example/page" }), { status: 200 }),
    });
    await expect(unsafeClient.getAllPages("/api/test")).rejects.toBeInstanceOf(UnsafeInputError);
  });
});
