import { useState, useEffect, useRef } from 'react';
import api from '../utils/axios';

export function useProjects() {
  const [projects,    setProjects]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const hasFetched = useRef(false);

  const fetchProjectList = async () => {
    try {
      const res = await api.get('/api/admin/projects?activeOnly=true');
      setProjects(Array.isArray(res.data) ? res.data : []);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[useProjects] Error:', err.message);
      setError(err.message);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch once on mount — no auto-retry loop
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchProjectList();
  }, []);

  return {
    projects,
    loading,
    error,
    lastUpdated,
    lastFetched:  lastUpdated,  // backward-compat alias for Dashboard
    isRefreshing: false,        // backward-compat — Dashboard has its own state
    refetch: fetchProjectList
  };
}

// Default export keeps existing `import useProjects, { useProjectLiveData }` working
export default useProjects;

// Module-level cache so we only fetch the interval once per session.
let _refreshIntervalMs = null;

async function getRefreshIntervalMs() {
  if (_refreshIntervalMs) return _refreshIntervalMs;
  try {
    const res = await api.get('/api/auth/refresh-interval');
    _refreshIntervalMs = (res.data.dataRefreshIntervalMinutes || 30) * 60 * 1000;
  } catch {
    _refreshIntervalMs = 30 * 60 * 1000;
  }
  return _refreshIntervalMs;
}

// Per-project live data — auto-refreshes at the admin-configured interval.
// Uses databaseId as the dep so re-fetches when the selected project changes.
export function useProjectLiveData(databaseId) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const fetchLiveData = async () => {
    if (!databaseId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/projects/live/${databaseId}`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!databaseId) return;
    let intervalId;
    fetchLiveData();
    getRefreshIntervalMs().then(ms => {
      intervalId = setInterval(fetchLiveData, ms);
    });
    return () => clearInterval(intervalId);
  }, [databaseId]);

  return { data, loading, error, refetch: fetchLiveData };
}
