import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerPTBRProps {
  value: string;       // ISO yyyy-MM-dd
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Converts ISO string (yyyy-MM-dd) to display format (dd/MM/yyyy).
 * Returns "" for empty/invalid.
 */
function isoToDisplay(iso: string): string {
  if (!iso) return "";
  const d = parse(iso, "yyyy-MM-dd", new Date());
  return isValid(d) ? format(d, "dd/MM/yyyy") : "";
}

/**
 * Converts a fully-typed display string (dd/MM/yyyy) to ISO.
 * Returns "" if not complete / invalid.
 */
function displayToISO(display: string): string {
  if (display.replace(/\D/g, "").length < 8) return "";
  const d = parse(display, "dd/MM/yyyy", new Date());
  return isValid(d) ? format(d, "yyyy-MM-dd") : "";
}

/**
 * Applies dd/MM/yyyy mask while the user types.
 * Digits only, auto-inserts "/" at positions 2 and 5.
 */
function applyDateMask(raw: string, prev: string): string {
  // Strip non-digits
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  let out = "";
  for (let i = 0; i < Math.min(digits.length, 8); i++) {
    if (i === 2 || i === 4) out += "/";
    out += digits[i];
  }
  return out;
}

export function DatePickerPTBR({
  value,
  onChange,
  className,
  placeholder = "dd/MM/aaaa",
  disabled,
}: DatePickerPTBRProps) {
  const [open, setOpen] = React.useState(false);

  // Display text (dd/MM/yyyy) — drives the input
  const [display, setDisplay] = React.useState<string>(() => isoToDisplay(value));

  // Sync display → external value when value prop changes externally
  React.useEffect(() => {
    const current = isoToDisplay(value);
    if (current !== display) {
      setDisplay(current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Parse ISO for calendar
  const calendarDate = React.useMemo<Date | undefined>(() => {
    if (!value) return undefined;
    const d = parse(value, "yyyy-MM-dd", new Date());
    return isValid(d) ? d : undefined;
  }, [value]);

  // Parse display for calendar month navigation while typing
  const displayAsDate = React.useMemo<Date | undefined>(() => {
    const iso = displayToISO(display);
    if (!iso) return undefined;
    const d = parse(iso, "yyyy-MM-dd", new Date());
    return isValid(d) ? d : undefined;
  }, [display]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const masked = applyDateMask(raw, display);
    setDisplay(masked);

    const iso = displayToISO(masked);
    onChange(iso); // calls with "" until 8 digits are typed
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Allow: backspace, delete, tab, escape, arrows, home, end
    const allowed = [
      "Backspace", "Delete", "Tab", "Escape",
      "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
      "Home", "End",
    ];
    if (allowed.includes(e.key)) return;
    // Block non-digit characters (slashes typed by hand are fine — mask handles them)
    if (!/^\d$/.test(e.key) && e.key !== "/") {
      e.preventDefault();
    }
  }

  function handleCalendarSelect(day: Date | undefined) {
    if (day) {
      const iso = format(day, "yyyy-MM-dd");
      const disp = format(day, "dd/MM/yyyy");
      setDisplay(disp);
      onChange(iso);
    } else {
      setDisplay("");
      onChange("");
    }
    setOpen(false);
  }

  const inputValid = display.length === 10 && !!displayAsDate;
  const inputError = display.length === 10 && !displayAsDate;

  return (
    <div className={cn("relative flex items-center", className)}>
      {/* Text input */}
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
        placeholder={placeholder}
        maxLength={10}
        disabled={disabled}
        className={cn(
          "flex h-full w-full rounded-md border bg-transparent px-3 pr-9 py-1 text-sm shadow-sm transition-colors",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          inputError
            ? "border-destructive focus-visible:ring-destructive"
            : "border-input",
        )}
      />

      {/* Calendar icon button */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2",
              "p-0.5 rounded text-slate-400 hover:text-primary transition-colors",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "disabled:pointer-events-none disabled:opacity-40",
            )}
            tabIndex={-1}
            aria-label="Abrir calendário"
          >
            <CalendarIcon className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={calendarDate}
            onSelect={handleCalendarSelect}
            month={displayAsDate ?? calendarDate}
            onMonthChange={() => {}}
            defaultMonth={calendarDate ?? new Date(2000, 0, 1)}
            locale={ptBR}
            captionLayout="dropdown-months"
            fromYear={1920}
            toYear={new Date().getFullYear()}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── TimeInputPTBR (unchanged) ────────────────────────────────────────────────

interface TimeInputPTBRProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  required?: boolean;
}

export function TimeInputPTBR({ value, onChange, className, required }: TimeInputPTBRProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.replace(/[^0-9:]/g, "");
    if (
      v.length === 2 &&
      !v.includes(":") &&
      e.nativeEvent instanceof InputEvent &&
      e.nativeEvent.inputType !== "deleteContentBackward"
    ) {
      v = v + ":";
    }
    if (v.length > 5) v = v.slice(0, 5);
    onChange(v);
  };

  return (
    <input
      type="text"
      value={value}
      onChange={handleChange}
      placeholder="HH:mm"
      maxLength={5}
      required={required}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
    />
  );
}
