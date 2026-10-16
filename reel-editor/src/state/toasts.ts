import { create } from 'zustand';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

let next = 1;

export const useToasts = create<{ toasts: Toast[]; dismiss: (id: number) => void }>((set) => ({
  toasts: [],
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function notify(text: string, kind: Toast['kind'] = 'info', ms = 4000) {
  const id = next++;
  useToasts.setState((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
  setTimeout(() => useToasts.getState().dismiss(id), ms);
}
