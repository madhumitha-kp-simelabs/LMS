import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';

/**
 * The /admin/overview payload, plus the plumbing both admin screens need.
 *
 * `error` means the page would not load at all. `notice` is the outcome of the
 * last action — kept separate because a rejected allotment must not blank out a
 * page that is otherwise perfectly fine.
 */
export function useAdminOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  // Which control is mid-request, so only that one locks up.
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(
    () =>
      api('/admin/overview')
        .then(setData)
        .catch((err) => setError(err.message)),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Runs a mutation, refreshes the whole overview, then reports the outcome.
   * Resolves true on success, so a form knows whether to clear itself.
   */
  const run = useCallback(
    async (id, request, done) => {
      setBusyId(id);
      setNotice(null);
      try {
        await request();
        await load();
        setNotice({ tone: 'indigo', text: done });
        return true;
      } catch (err) {
        // A 422 carries the per-field reasons; "Validation failed" on its own
        // says nothing about which box is wrong.
        setNotice({
          tone: 'rose',
          text: err.details?.length
            ? err.details.map((d) => d.message).join(' · ')
            : err.message,
        });
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  return { data, error, notice, busyId, run };
}
