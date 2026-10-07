import { request } from "node:https";
import { validateRemoteUrl } from "./security";

const HOSTS = ["thunderstore.io", "ccdn.thunderstore.io", "gcdn.thunderstore.io"];
interface ProbeResponse { status: number; location?: string }
type Probe = (url: string) => Promise<ProbeResponse>;

// Stop at the headers even when a server ignores Range. A wall-clock timeout
// also bounds DNS/TLS stalls, rather than only socket inactivity.
const probe: Probe = (url) => new Promise((resolve) => {
  const timer = setTimeout(() => { req.destroy(); resolve({ status: 0 }); }, 5000);
  const req = request(url, { method: "GET", headers: { Range: "bytes=0-0" } }, (res) => {
    clearTimeout(timer);
    resolve({ status: res.statusCode ?? 0, location: res.headers.location });
    res.destroy();
  });
  req.on("error", () => { clearTimeout(timer); resolve({ status: 0 }); });
  req.end();
});

export async function pickThunderstoreMirror(downloadUrl: string, probeImpl: Probe = probe): Promise<string> {
  async function follow(value: string): Promise<{ status: number; url: URL }> {
    let url = validateRemoteUrl(value, HOSTS);
    for (let hop = 0; hop <= 5; hop += 1) {
      const result = await probeImpl(url.href);
      if ([301, 302, 303, 307, 308].includes(result.status) && result.location !== undefined) {
        if (hop === 5) throw new Error("Download redirect limit exceeded");
        url = validateRemoteUrl(new URL(result.location, url).href, HOSTS);
      } else return { status: result.status, url };
    }
    throw new Error("Download redirect limit exceeded");
  }
  try {
    const first = await follow(downloadUrl);
    if (first.status !== 404 || first.url.hostname !== "ccdn.thunderstore.io") return downloadUrl;
    const mirror = new URL(first.url.href);
    mirror.hostname = "gcdn.thunderstore.io";
    const result = await follow(mirror.href);
    return result.status === 200 || result.status === 206 ? result.url.href : downloadUrl;
  } catch {
    return downloadUrl;
  }
}
