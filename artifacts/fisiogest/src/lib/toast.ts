import { toast as sonnerToast } from "sonner";
import type { ReactNode } from "react";

type ToastVariant = "default" | "destructive";

interface ToastOptions {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  action?: ReactNode;
}

export function toast({ title, description, variant }: ToastOptions): void {
  const message = title ?? "";
  const opts = description ? { description } : undefined;

  if (variant === "destructive") {
    sonnerToast.error(message, opts);
  } else {
    sonnerToast.success(message, opts);
  }
}

export function useToast() {
  return { toast };
}
