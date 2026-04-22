import { Checkbox } from "@/components/ui/checkbox";
import { ALL_ROLES } from "../constants";

export function RoleCheckboxes({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (roles: string[]) => void;
}) {
  const toggle = (role: string) => {
    if (selected.includes(role)) {
      const next = selected.filter((r) => r !== role);
      if (next.length > 0) onChange(next);
    } else {
      onChange([...selected, role]);
    }
  };

  return (
    <div className="flex flex-wrap gap-3">
      {ALL_ROLES.map(({ value, label }) => (
        <label
          key={value}
          className={`flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border transition-colors ${
            selected.includes(value)
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/40 bg-background"
          }`}
        >
          <Checkbox
            checked={selected.includes(value)}
            onCheckedChange={() => toggle(value)}
          />
          <span className="text-sm font-medium">{label}</span>
        </label>
      ))}
    </div>
  );
}
