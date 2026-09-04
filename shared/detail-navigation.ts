export type DetailTarget = { kind: 'client' | 'listing'; id: string };
export type WorkspaceRoute = { page: 'home' | 'properties' | 'clients'; details: DetailTarget[] };

/** Repeated detail parameters retain the order of nested views; legacy links still open. */
export function parseWorkspaceRoute(hash: string): WorkspaceRoute {
  const [path, query] = hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  const details = params.getAll('detail').flatMap(value => {
    const split = value.indexOf(':');
    const kind = value.slice(0, split);
    const id = value.slice(split + 1);
    return (kind === 'client' || kind === 'listing') && id ? [{ kind, id } as DetailTarget] : [];
  });
  if (!params.has('detail')) {
    for (const kind of ['client', 'listing'] as const) {
      const id = params.get(kind);
      if (id) details.push({ kind, id });
    }
  }
  return { page: path === 'clients' ? 'clients' : path === 'properties' || path === 'reports' ? 'properties' : 'home', details };
}

export function workspaceRouteHash(route: WorkspaceRoute): string {
  const params = new URLSearchParams();
  route.details.forEach(target => params.append('detail', `${target.kind}:${target.id}`));
  return `#/${route.page}${params.size ? `?${params}` : ''}`;
}

export function pushDetail(route: WorkspaceRoute, target: DetailTarget): WorkspaceRoute {
  const current = route.details.at(-1);
  return current?.kind === target.kind && current.id === target.id ? route : { ...route, details: [...route.details, target] };
}

export function popDetail(route: WorkspaceRoute): WorkspaceRoute {
  return { ...route, details: route.details.slice(0, -1) };
}
