/**
 * Sprint Financeiro 11 (P5) — CRUD versionado das cláusulas contratuais.
 *
 * Cada clínica monta a sua biblioteca de cláusulas (texto livre) que serão
 * apresentadas no aceite do plano de tratamento. Cláusulas marcadas como
 * "obrigatórias" exigem checkbox marcado para o paciente concluir o aceite.
 *
 * Endpoints:
 *   GET    /api/clinics/current/contract-clauses?includeInactive=true
 *   POST   /api/clinics/current/contract-clauses              (cria/versiona)
 *   PATCH  /api/clinics/current/contract-clauses/:id          (metadados)
 *   DELETE /api/clinics/current/contract-clauses/:id          (soft/hard)
 *   POST   /api/clinics/current/contract-clauses/seed-defaults
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FileText, Plus, Pencil, Trash2, Loader2, Sparkles, ShieldAlert, BadgeCheck,
} from "lucide-react";
import { apiFetchJson, apiSendJson, API_BASE } from "@/lib/api";
import { useToast } from "@/lib/toast";

const ENDPOINT = `${API_BASE}/api/clinics/current/contract-clauses`;

export interface ContractClause {
  id: number;
  clinicId: number;
  code: string;
  title: string;
  body: string;
  version: number;
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const CODE_RE = /^[A-Z][A-Z0-9_]{1,63}$/;

interface FormState {
  code: string;
  title: string;
  body: string;
  isRequired: boolean;
  sortOrder: string;
}

const EMPTY_FORM: FormState = {
  code: "",
  title: "",
  body: "",
  isRequired: true,
  sortOrder: "0",
};

export function ClausulasSection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [openForm, setOpenForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState<ContractClause | null>(null);

  const { data, isLoading } = useQuery<ContractClause[]>({
    queryKey: ["contract-clauses", includeInactive],
    queryFn: () =>
      apiFetchJson<ContractClause[]>(
        `${ENDPOINT}${includeInactive ? "?includeInactive=true" : ""}`,
      ),
  });

  const createMut = useMutation({
    mutationFn: () => {
      const sortOrder = parseInt(form.sortOrder);
      return apiSendJson<ContractClause>(ENDPOINT, "POST", {
        code: form.code.trim().toUpperCase(),
        title: form.title.trim(),
        body: form.body.trim(),
        isRequired: form.isRequired,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-clauses"] });
      toast({ title: "Cláusula salva", description: "Versão registrada." });
      setOpenForm(false);
      setForm(EMPTY_FORM);
    },
    onError: (err: any) =>
      toast({
        title: "Não foi possível salvar",
        description: err?.message ?? "Erro desconhecido",
        variant: "destructive",
      }),
  });

  const patchMut = useMutation({
    mutationFn: (args: { id: number; payload: Partial<ContractClause> }) =>
      apiSendJson<ContractClause>(`${ENDPOINT}/${args.id}`, "PATCH", args.payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract-clauses"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      apiSendJson<{ deleted: boolean; deactivated: boolean }>(
        `${ENDPOINT}/${id}`,
        "DELETE",
      ),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["contract-clauses"] });
      toast({
        title: res.deleted ? "Cláusula apagada" : "Cláusula desativada",
        description: res.deactivated
          ? "A cláusula já foi referenciada em algum aceite, então preservamos o histórico."
          : undefined,
      });
      setConfirmDelete(null);
    },
    onError: (err: any) =>
      toast({
        title: "Não foi possível remover",
        description: err?.message ?? "Erro desconhecido",
        variant: "destructive",
      }),
  });

  const seedMut = useMutation({
    mutationFn: () => apiSendJson<{ created: number }>(`${ENDPOINT}/seed-defaults`, "POST"),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["contract-clauses"] });
      toast({
        title: res.created > 0 ? `${res.created} cláusulas criadas` : "Nada a criar",
        description:
          res.created === 0
            ? "Sua clínica já tem cláusulas configuradas — nenhuma alteração."
            : "REAGENDAMENTO_INTRAMENSAL, PRECO_DIFERENCIADO e TITULO_EXECUTIVO foram adicionadas.",
      });
    },
    onError: (err: any) =>
      toast({
        title: "Não foi possível criar as cláusulas",
        description: err?.message ?? "Erro desconhecido",
        variant: "destructive",
      }),
  });

  const codeValid = CODE_RE.test(form.code.trim().toUpperCase());
  const formValid = codeValid && form.title.trim().length > 0 && form.body.trim().length > 10;

  const clauses = data ?? [];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Cláusulas contratuais</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={seedMut.isPending}
                onClick={() => seedMut.mutate()}
              >
                {seedMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Inserir padrão
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setOpenForm(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nova cláusula
              </Button>
            </div>
          </div>
          <CardDescription>
            Trechos de texto que aparecem no aceite do plano de tratamento. Cláusulas
            marcadas como <strong>obrigatórias</strong> exigem o paciente marcar antes
            de assinar. Editar o corpo cria uma nova versão (a anterior fica no
            histórico).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={includeInactive}
              onCheckedChange={(v) => setIncludeInactive(!!v)}
            />
            Mostrar versões antigas/desativadas
          </label>

          <Separator />

          {isLoading ? (
            <div className="py-8 flex justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : clauses.length === 0 ? (
            <div className="py-10 text-center space-y-2 text-sm text-muted-foreground">
              <ShieldAlert className="h-6 w-6 mx-auto text-amber-500" />
              <p>Nenhuma cláusula cadastrada ainda.</p>
              <p className="text-xs">
                Use <strong>"Inserir padrão"</strong> para começar com 3 cláusulas
                típicas (reagendamento intramensal, preço diferenciado e título
                executivo extrajudicial).
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {clauses.map((c) => (
                <li
                  key={c.id}
                  className={`rounded-xl border p-3.5 ${
                    c.isActive ? "bg-card" : "bg-muted/40 border-dashed"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-sm truncate">{c.title}</span>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {c.code} v{c.version}
                        </Badge>
                        {c.isRequired && (
                          <Badge className="text-[10px] gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100">
                            <ShieldAlert className="h-2.5 w-2.5" /> obrigatória
                          </Badge>
                        )}
                        {!c.isActive && (
                          <Badge variant="outline" className="text-[10px]">
                            desativada
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-3">{c.body}</p>
                    </div>
                    <div className="flex items-start gap-1 shrink-0">
                      {c.isActive && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Editar metadados"
                          onClick={() =>
                            patchMut.mutate({
                              id: c.id,
                              payload: { isRequired: !c.isRequired },
                            })
                          }
                          disabled={patchMut.isPending}
                        >
                          {c.isRequired ? (
                            <BadgeCheck className="h-3.5 w-3.5 text-amber-600" />
                          ) : (
                            <BadgeCheck className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Nova versão (re-edita o corpo)"
                        onClick={() => {
                          setForm({
                            code: c.code,
                            title: c.title,
                            body: c.body,
                            isRequired: c.isRequired,
                            sortOrder: String(c.sortOrder),
                          });
                          setOpenForm(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Remover"
                        onClick={() => setConfirmDelete(c)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Formulário de criação/versionamento ── */}
      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cláusula contratual</DialogTitle>
            <DialogDescription>
              Reusar um <strong>código</strong> já existente cria uma nova versão e
              desativa as anteriores automaticamente — preservando o histórico de
              aceites passados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cls-code">Código</Label>
              <Input
                id="cls-code"
                placeholder="Ex.: REAGENDAMENTO_INTRAMENSAL"
                value={form.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value.toUpperCase() })
                }
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Apenas A-Z, 0-9 e <code>_</code>. Deve começar com uma letra.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cls-title">Título</Label>
              <Input
                id="cls-title"
                placeholder="Ex.: Reagendamento dentro do mês"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cls-body">Corpo da cláusula</Label>
              <Textarea
                id="cls-body"
                rows={6}
                placeholder="Texto completo que será exibido ao paciente no aceite."
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">
                {form.body.length} caracteres
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cls-order">Ordem</Label>
                <Input
                  id="cls-order"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <Switch
                  checked={form.isRequired}
                  onCheckedChange={(v) => setForm({ ...form, isRequired: !!v })}
                />
                Obrigatória
              </label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpenForm(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={!formValid || createMut.isPending}
            >
              {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmação de remoção ── */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta cláusula?</AlertDialogTitle>
            <AlertDialogDescription>
              Se ela já foi referenciada em algum aceite passado, a remoção física é
              bloqueada — vamos apenas <strong>desativá-la</strong> para preservar a
              trilha probatória. Caso contrário, ela é removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => confirmDelete && deleteMut.mutate(confirmDelete.id)}
            >
              {deleteMut.isPending ? "Removendo…" : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
