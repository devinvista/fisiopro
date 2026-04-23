import { useCallback, useRef, useState } from "react";
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

type ResolverRef = {
  resolve: (value: boolean) => void;
  options: ConfirmOptions;
} | null;

export function useConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<ResolverRef>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = { resolve, options: opts };
      setOptions(opts);
      setOpen(true);
    });
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && resolverRef.current) {
      resolverRef.current.resolve(false);
      resolverRef.current = null;
    }
  };

  const handleConfirm = () => {
    if (resolverRef.current) {
      resolverRef.current.resolve(true);
      resolverRef.current = null;
    }
    setOpen(false);
  };

  const dialog = (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title ?? "Confirmar"}</AlertDialogTitle>
          {options?.description && (
            <AlertDialogDescription>{options.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{options?.cancelLabel ?? "Cancelar"}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={
              options?.destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
          >
            {options?.confirmLabel ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, dialog } as const;
}
