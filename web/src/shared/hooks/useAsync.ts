import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';

export function useAsync<T>(loader: () => Promise<T>, dependencies: DependencyList = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  const requestSequenceRef = useRef(0);
  loaderRef.current = loader;
  const dependencyKey = JSON.stringify(dependencies);

  const reload = useCallback(async () => {
    const requestSequence = ++requestSequenceRef.current;
    setLoading(true);
    setError('');
    try {
      const value = await loaderRef.current();
      if (requestSequence === requestSequenceRef.current) setData(value);
      return value;
    } catch (reason) {
      if (requestSequence === requestSequenceRef.current) {
        setError(reason instanceof Error ? reason.message : '데이터를 불러오지 못했습니다');
      }
      return null;
    } finally {
      if (requestSequence === requestSequenceRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    return () => { requestSequenceRef.current += 1; };
  }, [dependencyKey, reload]);

  return { data, error, loading, reload };
}
