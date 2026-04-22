import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Search, Package, Layers, RefreshCw, FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/utils/utils";
import type { Procedure, PackageItem } from "./types";
import { apiFetch, EMPTY_FORM, buildPackagePayload } from "./helpers";
import { PackageCard } from "./PackageCard";
import { PackageFormModal } from "./PackageFormModal";

export default function Pacotes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "sessoes" | "mensal" | "faturaConsolidada">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<PackageItem | null>(null);
  const [deletingPackage, setDeletingPackage] = useState<PackageItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: packages = [], isLoading } = useQuery<PackageItem[]>({
    queryKey: ["packages"],
    queryFn: () => apiFetch<PackageItem[]>("/api/packages?includeInactive=true"),
  });

  const { data: procedures = [] } = useQuery<Procedure[]>({
    queryKey: ["procedures-active"],
    queryFn: () => apiFetch<Procedure[]>("/api/procedures"),
  });

  const filtered = packages.filter((pkg) => {
    const matchesSearch = search.trim() === "" ||
      pkg.name.toLowerCase().includes(search.toLowerCase()) ||
      pkg.procedureName.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || pkg.packageType === typeFilter;
    return matchesSearch && matchesType;
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiFetch<PackageItem>("/api/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPackagePayload(data)),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packages"] });
      toast({ title: "Pacote criado com sucesso!" });
      closeModal();
    },
    onError: (err: Error) => toast({ title: "Erro ao criar pacote", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof form }) =>
      apiFetch<PackageItem>(`/api/packages/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPackagePayload(data)),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packages"] });
      toast({ title: "Pacote atualizado com sucesso!" });
      closeModal();
    },
    onError: (err: Error) => toast({ title: "Erro ao atualizar pacote", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/packages/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packages"] });
      toast({ title: "Pacote removido." });
      setDeletingPackage(null);
    },
    onError: (err: Error) => toast({ title: "Erro ao remover pacote", description: err.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditingPackage(null);
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  }

  function openEdit(pkg: PackageItem) {
    setEditingPackage(pkg);
    setForm({
      name: pkg.name,
      description: pkg.description ?? "",
      procedureId: String(pkg.procedureId),
      packageType: pkg.packageType,
      totalSessions: pkg.totalSessions ?? 8,
      sessionsPerWeek: pkg.sessionsPerWeek,
      validityDays: pkg.validityDays ?? 30,
      price: String(pkg.price),
      monthlyPrice: pkg.monthlyPrice ? String(pkg.monthlyPrice) : "",
      billingDay: pkg.billingDay ?? 5,
      absenceCreditLimit: pkg.absenceCreditLimit ?? 1,
    });
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingPackage(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit() {
    if (!form.name || !form.procedureId) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    if (form.packageType === "sessoes" && !form.price) {
      toast({ title: "Informe o preço total do pacote", variant: "destructive" });
      return;
    }
    if (form.packageType !== "sessoes" && !form.monthlyPrice) {
      toast({ title: "Informe o valor da cobrança", variant: "destructive" });
      return;
    }
    if (editingPackage) {
      updateMutation.mutate({ id: editingPackage.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const sessoesPkg = packages.filter(p => p.packageType === "sessoes").length;
  const mensaisPkg = packages.filter(p => p.packageType === "mensal").length;
  const faturasPkg = packages.filter(p => p.packageType === "faturaConsolidada").length;

  return (
    <AppLayout title="Pacotes">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Pacotes de Serviços</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Configure pacotes por sessões ou mensalidades com regras de frequência e falta
            </p>
          </div>
          {isAdmin && (
            <Button onClick={openCreate} className="gap-2 shrink-0">
              <Plus className="h-4 w-4" />
              Novo Pacote
            </Button>
          )}
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard icon={<Package className="h-5 w-5 text-primary" />} bg="bg-primary/10" value={packages.length} label="Total de pacotes" />
          <MetricCard icon={<Layers className="h-5 w-5 text-blue-600" />} bg="bg-blue-100" value={sessoesPkg} label="Por sessões" />
          <MetricCard icon={<RefreshCw className="h-5 w-5 text-emerald-600" />} bg="bg-emerald-100" value={mensaisPkg} label="Mensalidades" />
          <MetricCard icon={<FileText className="h-5 w-5 text-violet-600" />} bg="bg-violet-100" value={faturasPkg} label="Faturas" />
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar pacote ou procedimento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5 p-1 bg-muted rounded-xl">
            {([
              { v: "all", label: "Todos" },
              { v: "sessoes", label: "Por Sessões" },
              { v: "mensal", label: "Mensalidade" },
              { v: "faturaConsolidada", label: `Fatura (${faturasPkg})` },
            ] as const).map(opt => (
              <button
                key={opt.v}
                onClick={() => setTypeFilter(opt.v)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                  typeFilter === opt.v
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-card border rounded-xl p-5 animate-pulse space-y-3">
                <div className="h-4 bg-muted rounded w-2/3" />
                <div className="h-3 bg-muted rounded w-1/2" />
                <div className="h-10 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-card border rounded-xl">
            <Package className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="font-medium text-foreground">Nenhum pacote encontrado</p>
            <p className="text-sm text-muted-foreground mt-1">
              {search || typeFilter !== "all" ? "Tente outros filtros" : "Crie o primeiro pacote clicando em \"Novo Pacote\""}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((pkg) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                isAdmin={isAdmin}
                onEdit={openEdit}
                onDelete={setDeletingPackage}
              />
            ))}
          </div>
        )}
      </div>

      <PackageFormModal
        open={isModalOpen}
        editingPackage={editingPackage}
        form={form}
        setForm={setForm}
        procedures={procedures}
        onClose={closeModal}
        onSubmit={handleSubmit}
        saving={createMutation.isPending || updateMutation.isPending}
      />

      <AlertDialog open={!!deletingPackage} onOpenChange={(open) => { if (!open) setDeletingPackage(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover pacote</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o pacote <strong>{deletingPackage?.name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingPackage && deleteMutation.mutate(deletingPackage.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

function MetricCard({ icon, bg, value, label }: { icon: React.ReactNode; bg: string; value: number; label: string }) {
  return (
    <div className="bg-card border rounded-xl p-4 flex items-center gap-3">
      <div className={cn("p-2.5 rounded-lg", bg)}>{icon}</div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
