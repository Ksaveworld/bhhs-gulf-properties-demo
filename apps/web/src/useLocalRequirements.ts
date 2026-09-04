import { useEffect, useRef, useState } from 'react';
import type { Dataset } from '../../../shared/types';
import { loadLocalRequirements, requirementStorageKey, saveLocalRequirements, type LocalRequirementCopy, type StoredRequirements } from '../../../shared/local-requirements';
import { salesRequirementKey } from '../../../shared/sales-identity';

type Snapshot = { dataset: Dataset; salesId: string | null; store: StoredRequirements };
const failure = (error: unknown) => error instanceof Error ? error.message : 'Browser storage is unavailable. Imported records remain available.';

/** The imported dataset is immutable. Only independently identified browser copies enter this store. */
const EMPTY_COPIES: LocalRequirementCopy[] = [];

export function useLocalRequirements(dataset: Dataset | null, salesId: string | null = null) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const current = useRef<Snapshot | null>(null);
  const activeDataset = useRef(dataset);
  activeDataset.current = dataset;
  const activeSales = useRef(salesId);
  activeSales.current = salesId;

  useEffect(() => {
    let cancelled = false;
    current.current = null; setSnapshot(null); setError('');
    if (!dataset) { setLoading(false); return; }
    setLoading(true);
    requirementStorageKey(dataset).then(batchKey => {
      if (cancelled) return;
      const key = salesRequirementKey(batchKey, salesId);
      const next = { dataset, salesId, store: loadLocalRequirements(window.localStorage, key, dataset.client_requirements) };
      current.current = next; setSnapshot(next);
    }).catch(reason => { if (!cancelled) setError(failure(reason)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dataset, salesId, refresh]);

  useEffect(() => {
    function changed(event: StorageEvent) {
      const previous = current.current;
      if (!previous || previous.dataset !== activeDataset.current || previous.salesId !== activeSales.current || (event.key !== null && event.key !== previous.store.key)) return;
      try {
        const next = { ...previous, store: loadLocalRequirements(window.localStorage, previous.store.key, previous.dataset.client_requirements) };
        current.current = next; setSnapshot(next); setError('');
      } catch (reason) {
        current.current = null; setSnapshot(null); setError(failure(reason));
      }
    }
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);

  async function change(transform: (copies: LocalRequirementCopy[]) => LocalRequirementCopy[]) {
    const previous = current.current;
    setWriting(true);
    try {
      if (!previous || previous.dataset !== dataset || previous.salesId !== salesId) throw new Error('Local saving is unavailable. Retry local storage; imported requirements remain available.');
      const persist = () => {
        if (activeDataset.current !== previous.dataset || activeSales.current !== previous.salesId || current.current !== previous) throw new Error('This batch, sales identity or its local copies changed. Review the current data before saving again.');
        const store = saveLocalRequirements(window.localStorage, previous.store.key, transform(previous.store.copies), dataset!.client_requirements, previous.store.revision);
        const next = { dataset: previous.dataset, salesId: previous.salesId, store };
        current.current = next; setSnapshot(next); setError('');
      };
      // Serializes writes from this app across Chrome tabs; revision checks also reject stale writers.
      if (navigator.locks) await navigator.locks.request(previous.store.key, persist);
      else persist();
    } catch (reason) { setError(failure(reason)); throw new Error(failure(reason)); }
    finally { setWriting(false); }
  }

  const active = snapshot?.dataset === dataset && snapshot.salesId === salesId ? snapshot.store : null;
  return {
    copies: active?.copies ?? EMPTY_COPIES, key: active?.key ?? null,
    loading: loading || (!!dataset && !snapshot && !error), writing, error,
    retry: () => setRefresh(value => value + 1),
    save: (copy: LocalRequirementCopy) => change(copies => [...copies, copy]),
    remove: (id: string) => change(copies => copies.filter(copy => copy.requirement.requirement_id !== id)),
  };
}
