import { useEffect, useState } from 'react';

// Delays updating the returned value until `value` stops changing for
// `delayMs`. Used on search inputs so typing doesn't fire one Supabase
// query per keystroke — a real performance cost on a metered mobile
// connection, not just a nicety.
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}