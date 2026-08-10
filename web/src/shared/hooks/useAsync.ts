import { useCallback, useEffect, useRef, useState } from 'react';

export function useAsync<T>(loader: () => Promise<T>, dependencyKey = '') {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const value = await loaderRef.current();
      setData(value);
      return value;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '데이터를 불러오지 못했습니다');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (dependencyKey !== undefined) reload();
  }, [dependencyKey, reload]);

  return { data, error, loading, reload };
}
