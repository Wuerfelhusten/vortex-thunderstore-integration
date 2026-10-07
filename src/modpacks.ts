import { DependencyResolver } from "./dependencies";
import { packageIdentity, packageKey } from "./identity";
import { ThunderstoreVersionRecord } from "./types";

export interface ModpackPlan {
  records: ThunderstoreVersionRecord[];
  overrides: string[];
}

// Match r2modman's modpack policy: reserve all direct pins before traversing
// their dependencies. Already selected packages keep their exact version.
// Unlike ordinary strict dependency planning, transitive pins cannot replace
// a modpack's explicit choices. Never silently upgrade to the latest release.
export async function planModpack(root: ThunderstoreVersionRecord, resolver: DependencyResolver): Promise<ModpackPlan> {
  const records = new Map<string, ThunderstoreVersionRecord>([[packageKey(root.identity.package), root]]);
  const overrides = new Set<string>();
  const expanded = new Set<string>();
  const direct = new Map<string, string>();
  for (const dependency of root.dependencies) {
    const key = packageKey(packageIdentity(dependency.namespace, dependency.packageName));
    const previous = direct.get(key);
    if (previous !== undefined && previous !== dependency.version) {
      throw new Error(`Modpack enthält widersprüchliche direkte Versionen: ${dependency.namespace}/${dependency.packageName} ${previous} und ${dependency.version}`);
    }
    direct.set(key, dependency.version);
  }
  async function expand(record: ThunderstoreVersionRecord): Promise<void> {
    const key = packageKey(record.identity.package);
    if (expanded.has(key)) return;
    if (!record.isActive || !record.dependenciesComplete) throw new Error(`Unvollständiges oder inaktives Paket: ${key}`);
    expanded.add(key);
    const children: ThunderstoreVersionRecord[] = [];
    // Reserve siblings first, so direct pins win over transitive requirements.
    for (const dependency of record.dependencies) {
      const childKey = packageKey(packageIdentity(dependency.namespace, dependency.packageName));
      let child = records.get(childKey);
      if (child === undefined) {
        if (records.size >= 2000) throw new Error("Modpack überschreitet das Paketlimit (2000)");
        child = await resolver.getVersion(dependency, dependency.community ?? record.listing.community);
        if (child === undefined || !child.isActive || child.identity.version !== dependency.version
          || packageKey(child.identity.package) !== childKey) {
          throw new Error(`Abhängigkeit fehlt oder ist ungültig: ${dependency.raw}`);
        }
        records.set(childKey, child);
      } else if (child.identity.version !== dependency.version) {
        overrides.add(`${dependency.namespace}/${dependency.packageName}: ${dependency.version} → ${child.identity.version}`);
      }
      children.push(child);
    }
    for (const child of children) await expand(child);
  }
  await expand(root);
  const ordered: ThunderstoreVersionRecord[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function order(record: ThunderstoreVersionRecord): void {
    const key = packageKey(record.identity.package);
    if (visiting.has(key)) throw new Error(`Zyklische Modpack-Abhängigkeit: ${key}`);
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of record.dependencies) order(records.get(packageKey(packageIdentity(dependency.namespace, dependency.packageName)))!);
    visiting.delete(key);
    visited.add(key);
    ordered.push(record);
  }
  order(root);
  return { records: ordered, overrides: [...overrides] };
}
