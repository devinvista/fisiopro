import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function CreditsSection({ patientId }: { patientId: number }) {
  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` });
  const { data, isLoading } = useQuery<{ credits: any[]; totalAvailable: number }>({
    queryKey: [`/api/financial/patients/${patientId}/credits`],
    queryFn: () => fetch(`/api/financial/patients/${patientId}/credits`, { headers: authHeader() }).then(r => r.json()),
    enabled: !!patientId,
  });

  const credits = data?.credits ?? [];
  const totalAvailable = data?.totalAvailable ?? 0;
  const creditsWithBalance = credits.filter((c: any) => c.availableCount > 0);

  if (isLoading) return <div className="p-4 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-primary" /></div>;
  if (credits.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-base font-semibold text-slate-800">Créditos de Sessão</h4>
        <Badge className={`${totalAvailable > 0 ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-500"} border-none text-xs font-semibold`}>
          {totalAvailable} crédito{totalAvailable !== 1 ? "s" : ""} disponível{totalAvailable !== 1 ? "eis" : ""}
        </Badge>
      </div>
      {creditsWithBalance.length === 0 ? (
        <p className="text-xs text-slate-400">Nenhum crédito disponível no momento.</p>
      ) : (
        <div className="space-y-1.5">
          {creditsWithBalance.map((credit: any) => (
            <div key={credit.id} className="flex items-center justify-between p-3 rounded-xl bg-teal-50 border border-teal-100">
              <div>
                <p className="text-sm font-semibold text-teal-800">{credit.procedure?.name ?? "Procedimento"}</p>
                <p className="text-xs text-teal-600">{credit.notes}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-teal-700">{credit.availableCount}</p>
                <p className="text-[10px] text-teal-500">crédito{credit.availableCount !== 1 ? "s" : ""}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
