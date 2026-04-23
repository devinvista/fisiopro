import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { BookOpen, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Procedure } from "../types";

interface CatalogModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  catalogOptions: {
    clinicName: string;
    tagline: string;
    showPrices: boolean;
    selectedCategories: string[];
    clinicType: string;
    introText: string;
  };
  setCatalogOptions: React.Dispatch<React.SetStateAction<{
    clinicName: string;
    tagline: string;
    showPrices: boolean;
    selectedCategories: string[];
    clinicType: string;
    introText: string;
  }>>;
  onGenerate: () => void;
}

export function CatalogModal({
  isOpen,
  onOpenChange,
  catalogOptions,
  setCatalogOptions,
  onGenerate,
}: CatalogModalProps) {
  const CATEGORIES_LIST = ["Reabilitação", "Estética", "Pilates"];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Configurar Catálogo
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-0.5">Personalize o catálogo de serviços para impressão ou PDF.</p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Categorias no Catálogo</Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES_LIST.map(cat => {
                const isSelected = catalogOptions.selectedCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => setCatalogOptions(o => ({
                      ...o,
                      selectedCategories: isSelected
                        ? o.selectedCategories.filter(c => c !== cat)
                        : [...o.selectedCategories, cat]
                    }))}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-white text-slate-600 border-slate-200 hover:border-primary/30"
                    )}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Exibir preços</Label>
              <p className="text-[10px] text-slate-400">Mostrar valor dos procedimentos</p>
            </div>
            <Switch
              checked={catalogOptions.showPrices}
              onCheckedChange={v => setCatalogOptions(o => ({ ...o, showPrices: v }))}
            />
          </div>

          <div className={cn(
            "flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs",
            catalogOptions.showPrices
              ? "bg-blue-50 text-blue-700"
              : "bg-slate-50 text-slate-500"
          )}>
            <Printer className="w-3.5 h-3.5 shrink-0" />
            {catalogOptions.showPrices
              ? "O catálogo será aberto com os preços visíveis. Use Ctrl+P para salvar como PDF."
              : "O catálogo será aberto sem preços. Ideal para apresentação pública."}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="rounded-xl"
            onClick={onGenerate}
            disabled={catalogOptions.selectedCategories.length === 0}
          >
            <Printer className="mr-1.5 h-4 w-4" /> Abrir Catálogo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
