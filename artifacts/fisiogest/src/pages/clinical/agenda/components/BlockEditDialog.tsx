import { useState } from "react";
import { Loader2, Pencil, Repeat } from "lucide-react";
import { apiFetch } from "@/utils/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DatePickerPTBR, TimeInputPTBR } from "@/components/ui/date-picker-ptbr";
import { useToast } from "@/hooks/use-toast";
import type { BlockedSlot } from "../types";

export function BlockEditDialog({
  block,
  onClose,
  onSuccess,
}: {
  block: BlockedSlot;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    date: block.date,
    startTime: block.startTime,
    endTime: block.endTime,
    reason: block.reason ?? "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [showGroupChoice, setShowGroupChoice] = useState(false);

  const isRecurring = !!block.recurrenceGroupId;
  const dateChanged = form.date !== block.date;

  const doSave = async (updateGroup: boolean) => {
    if (form.startTime >= form.endTime) {
      toast({ variant: "destructive", title: "Horário inválido", description: "O início deve ser anterior ao término." });
      return;
    }
    setIsSaving(true);
    try {
      const res = await apiFetch(`/api/blocked-slots/${block.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          reason: form.reason || null,
          updateGroup,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: "Erro ao salvar", description: data.message ?? "Tente novamente." });
      } else {
        toast({ title: updateGroup ? "Série inteira atualizada." : "Bloqueio atualizado com sucesso." });
        onSuccess();
      }
    } catch {
      toast({ variant: "destructive", title: "Erro ao atualizar bloqueio." });
    } finally {
      setIsSaving(false);
      setShowGroupChoice(false);
    }
  };

  const handleSave = () => {
    if (isRecurring && !dateChanged) {
      setShowGroupChoice(true);
    } else {
      doSave(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[400px] border-none shadow-2xl rounded-3xl" aria-describedby={undefined}>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-slate-100">
                <Pencil className="w-4 h-4 text-slate-600" />
              </div>
              <div>
                <DialogTitle className="font-display text-xl">Editar Bloqueio</DialogTitle>
                {isRecurring && (
                  <p className="text-xs text-violet-600 font-medium mt-0.5 flex items-center gap-1">
                    <Repeat className="w-3 h-3" /> Bloqueio recorrente
                  </p>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Data</Label>
              <DatePickerPTBR
                value={form.date}
                onChange={(v) => setForm({ ...form, date: v })}
                className="h-10 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Início</Label>
                <TimeInputPTBR
                  value={form.startTime}
                  onChange={(v) => setForm({ ...form, startTime: v })}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Término</Label>
                <TimeInputPTBR
                  value={form.endTime}
                  onChange={(v) => setForm({ ...form, endTime: v })}
                  className="h-10 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Motivo</Label>
              <Input
                placeholder="Ex: Almoço, Reunião, Curso..."
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2">
            <Button variant="outline" className="rounded-xl flex-1" onClick={onClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button className="rounded-xl flex-1" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Pencil className="w-4 h-4 mr-1.5" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Choice dialog for recurring blocks */}
      {showGroupChoice && (
        <Dialog open onOpenChange={() => setShowGroupChoice(false)}>
          <DialogContent className="sm:max-w-[380px] border-none shadow-2xl rounded-2xl" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Editar bloqueio recorrente</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600">Este bloqueio faz parte de uma série recorrente. O que deseja atualizar?</p>
            <div className="flex flex-col gap-2 pt-2">
              <Button variant="outline" className="rounded-xl" onClick={() => doSave(false)} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                Apenas este bloqueio
              </Button>
              <Button className="rounded-xl" onClick={() => doSave(true)} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                Toda a série recorrente
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
