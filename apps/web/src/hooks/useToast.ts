import { useCallback, useEffect, useRef, useState } from "react";

export type ToastVariant = "info" | "success" | "error";

export type ToastMessage = {
  id: number;
  message: string;
  variant: ToastVariant;
  detail?: string;
};

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);
  const toastTimeoutsRef = useRef<Record<number, number>>({});

  const dismissToast = useCallback((id: number) => {
    const handle = toastTimeoutsRef.current[id];
    if (handle) {
      window.clearTimeout(handle);
      delete toastTimeoutsRef.current[id];
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (input: { message: string; variant?: ToastVariant; detail?: string }) => {
      const id = ++toastIdRef.current;
      const toast: ToastMessage = {
        id,
        message: input.message,
        variant: input.variant ?? "info",
        detail: input.detail
      };
      setToasts((prev) => [...prev, toast]);
      const timeout = window.setTimeout(() => dismissToast(id), 5000);
      toastTimeoutsRef.current[id] = timeout;
    },
    [dismissToast]
  );

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(toastTimeoutsRef.current).forEach((handle) => window.clearTimeout(handle));
      toastTimeoutsRef.current = {};
    };
  }, []);

  return { toasts, showToast, dismissToast };
}
