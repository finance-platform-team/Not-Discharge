import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastTone = 'success' | 'warning' | 'error';

export function useToast() {
  const [message, setMessage] = useState<string>();
  const [tone, setTone] = useState<ToastTone>('success');
  const [on, setOn] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((m: string, t: ToastTone = 'success') => {
    setMessage(m);
    setTone(t);
    setOn(true);
    window.clearTimeout(timer.current);
    // Problems stay a little longer so they can be read.
    timer.current = window.setTimeout(() => setOn(false), t === 'success' ? 2600 : 4500);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { message, tone, on, show };
}
