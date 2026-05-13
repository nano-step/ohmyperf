import { useEffect, useState } from 'react';

export function useDelayed(active: boolean, delayMs = 200): boolean {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!active) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(t);
  }, [active, delayMs]);

  return show;
}
