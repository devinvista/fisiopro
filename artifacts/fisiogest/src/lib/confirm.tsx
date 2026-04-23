import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmState = {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
} | null;

let current: ConfirmState = null;
const listeners = new Set<(state: ConfirmState) => void>();

function notify() {
  listeners.forEach((l) => l(current));
}

export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    current = { options, resolve };
    notify();
  });
}

export function ConfirmRoot() {
  const [state, setState] = useState<ConfirmState>(current);

  useEffect(() => {
    const listener = (s: ConfirmState) => setState(s);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const handleOpenChange = (open: boolean) => {
    if (!open && state) {
      state.resolve(false);
      current = null;
      notify();
    }
  };

  const handleConfirm = () => {
    if (state) {
      state.resolve(true);
      current = null;
      notify();
    }
  };

  if (!state) return null;
  const { options } = state;

  return (
    <AlertDialog open onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options.title}</AlertDialogTitle>
          {options.description && (
            <AlertDialogDescription>{options.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{options.cancelLabel ?? "Cancelar"}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={
              options.destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive"
                : undefined
            }
          >
            {options.confirmLabel ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
