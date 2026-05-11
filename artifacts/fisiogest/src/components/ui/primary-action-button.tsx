import * as React from "react"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"

interface PrimaryActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  mobileLabel?: string
  icon?: React.ReactNode
  asChild?: boolean
}

export const PrimaryActionButton = React.forwardRef<HTMLButtonElement, PrimaryActionButtonProps>(
  ({ label, mobileLabel, icon, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center h-9 rounded-full overflow-hidden shrink-0 select-none",
          "bg-primary text-primary-foreground",
          "shadow-md shadow-primary/25",
          "transition-all duration-200",
          "hover:shadow-lg hover:shadow-primary/35 hover:-translate-y-px",
          "active:translate-y-0 active:shadow-md",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1",
          "disabled:opacity-50 disabled:pointer-events-none",
          className
        )}
        {...props}
      >
        <span className="flex items-center justify-center w-9 h-9 shrink-0 bg-white/[0.15] border-r border-white/20">
          {icon ?? <Plus className="w-4 h-4" />}
        </span>
        {mobileLabel ? (
          <>
            <span className="px-4 text-sm font-semibold hidden sm:block">{label}</span>
            <span className="px-3 text-sm font-semibold sm:hidden">{mobileLabel}</span>
          </>
        ) : (
          <span className="px-4 text-sm font-semibold">{label}</span>
        )}
      </button>
    )
  }
)
PrimaryActionButton.displayName = "PrimaryActionButton"
