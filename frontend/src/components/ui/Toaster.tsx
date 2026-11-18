'use client';

import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { dismissToast, showToast, type Toast } from '@/store/slices/ui.slice';

export function useToast() {
  const dispatch = useAppDispatch();
  return useCallback(
    (message: string, kind: Toast['kind'] = 'info') => {
      dispatch(showToast(message, kind));
    },
    [dispatch],
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    const t = setTimeout(() => dispatch(dismissToast(toast.id)), 3200);
    return () => clearTimeout(t);
  }, [dispatch, toast.id]);
  return <div className={`toast ${toast.kind}`}>{toast.message}</div>;
}

export function Toaster() {
  const toasts = useAppSelector((s) => s.ui.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
