import { packageIdentity, packageKey } from "./identity";
import { DependencyDeclaration, DependencyNode, DependencyPlan, PackageIdentity, ThunderstoreVersionRecord } from "./types";

export class DependencyPlanError extends Error {
  constructor(readonly code: "INVALID_DEPENDENCY" | "INCOMPLETE_DEPENDENCIES" | "DEPENDENCY_CONFLICT") {
    super(code);
    this.name = "DependencyPlanError";
  }
}

export function parseDependency(raw: string, community?: string): DependencyDeclaration {
  const value = raw.trim();
  const parts = value.split("-");
  if (parts.length < 3 || parts.some((part) => part.length === 0)) {
    throw new DependencyPlanError("INVALID_DEPENDENCY");
  }
  const namespace = parts.shift()!;
  const version = parts.pop()!;
  const packageName = parts.join("-");
  if (!packageName || version === "latest") throw new DependencyPlanError("INVALID_DEPENDENCY");
  return { raw, namespace, packageName, version, ...(community === undefined ? {} : { community }) };
}

export interface DependencyResolver {
  getVersion(dependency: DependencyDeclaration, community: string): Promise<ThunderstoreVersionRecord | undefined>;
}

export async function planDependencies(
  root: ThunderstoreVersionRecord,
  resolver: DependencyResolver,
): Promise<DependencyPlan> {
  const nodes = new Map<string, DependencyNode>();
  const edges: DependencyPlan["edges"] = [];
  const missing: DependencyDeclaration[] = [];
  const conflicts = new Map<string, { identity: PackageIdentity; versions: Set<string>; parents: Set<string> }>();
  const cycles: string[][] = [];
  const visiting: string[] = [];

  const visit = async (record: ThunderstoreVersionRecord, parentKey?: string): Promise<void> => {
    const recordKey = packageKey(record.identity.package);
    if (parentKey !== undefined) {
      const cycleAt = visiting.indexOf(recordKey);
      if (cycleAt >= 0) {
        cycles.push([...visiting.slice(cycleAt), recordKey]);
        return;
      }
    }
    if (!record.dependenciesComplete) throw new DependencyPlanError("INCOMPLETE_DEPENDENCIES");
    const node: DependencyNode = nodes.get(recordKey) ?? {
      key: recordKey,
      identity: record.identity.package,
      version: record.identity.version,
      community: record.listing.community,
      parents: [],
    };
    if (parentKey !== undefined && !node.parents.includes(parentKey)) node.parents.push(parentKey);
    nodes.set(recordKey, node);
    visiting.push(recordKey);
    for (const declaration of record.dependencies) {
      const community = declaration.community ?? record.listing.community;
      const dependencyIdentity = packageIdentity(declaration.namespace, declaration.packageName);
      const dependencyKey = packageKey(dependencyIdentity);
      edges.push({ from: recordKey, to: dependencyKey, raw: declaration.raw });
      const existing = nodes.get(dependencyKey);
      if (existing !== undefined && existing.version !== declaration.version) {
        const conflict = conflicts.get(dependencyKey) ?? {
          identity: dependencyIdentity,
          versions: new Set<string>([existing.version]),
          parents: new Set<string>(existing.parents),
        };
        conflict.versions.add(declaration.version);
        conflict.parents.add(recordKey);
        conflicts.set(dependencyKey, conflict);
        continue;
      }
      const dependency = await resolver.getVersion(declaration, community);
      if (dependency === undefined || !dependency.isActive) {
        missing.push(declaration);
        continue;
      }
      if (dependency.identity.version !== declaration.version) {
        const conflict = conflicts.get(dependencyKey) ?? {
          identity: dependencyIdentity,
          versions: new Set<string>(),
          parents: new Set<string>(),
        };
        conflict.versions.add(declaration.version);
        conflict.versions.add(dependency.identity.version);
        conflict.parents.add(recordKey);
        conflicts.set(dependencyKey, conflict);
        continue;
      }
      await visit(dependency, recordKey);
    }
    visiting.pop();
  };

  await visit(root);
  return {
    complete: missing.length === 0 && conflicts.size === 0 && cycles.length === 0,
    nodes: [...nodes.values()],
    edges,
    missing,
    conflicts: [...conflicts.values()].map((conflict) => ({
      identity: conflict.identity,
      versions: [...conflict.versions],
      parents: [...conflict.parents],
    })),
    cycles,
  };
}
