import { useState } from "react";
import { Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { apiFetchJson } from "@/utils/api";
import { fetchClinicForPrint } from "./_shared";
import { generateFullProntuarioHTML } from "./full-prontuario";

export function ExportProntuarioButton({ patientId, patient }: { patientId: number; patient: any }) {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const handleExport = async () => {
    setLoading(true);
    try {
      const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
      const [anamnesisRes, evaluationsRes, planRes, evolutionsRes, appointmentsRes, dischargeRes, clinicRes] = await Promise.all([
        safe(apiFetchJson<any>(`/api/patients/${patientId}/anamnesis`), null),
        safe(apiFetchJson<any[]>(`/api/patients/${patientId}/evaluations`), [] as any[]),
        safe(apiFetchJson<any>(`/api/patients/${patientId}/treatment-plan`), null),
        safe(apiFetchJson<any[]>(`/api/patients/${patientId}/evolutions`), [] as any[]),
        safe(apiFetchJson<any[]>(`/api/patients/${patientId}/appointments`), [] as any[]),
        safe(apiFetchJson<any>(`/api/patients/${patientId}/discharge-summary`), null),
        fetchClinicForPrint(),
      ]);

      const { html, css } = generateFullProntuarioHTML({
        patient,
        anamnesis: anamnesisRes,
        evaluations: evaluationsRes,
        treatmentPlan: planRes,
        evolutions: evolutionsRes,
        appointments: appointmentsRes,
        discharge: dischargeRes,
        professional: { name: (user as any)?.name },
        clinic: clinicRes,
      });

      const w = window.open("", "_blank", "width=960,height=800");
      if (!w) { alert("Permita pop-ups para gerar o prontuário."); return; }
      w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
        <meta charset="UTF-8"><title>Prontuário — ${patient.name}</title>
        <style>${css}</style>
      </head><body>${html}
        <script>window.onload=function(){setTimeout(function(){window.print();},600);}<\/script>
      </body></html>`);
      w.document.close();
    } catch (err) {
      console.error("Erro ao gerar prontuário:", err);
      alert("Não foi possível gerar o prontuário. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      className="w-full h-9 rounded-xl text-sm border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400"
      onClick={handleExport}
      disabled={loading}
    >
      {loading
        ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Gerando…</>
        : <><FileText className="w-3.5 h-3.5 mr-2" /> Exportar Prontuário PDF</>
      }
    </Button>
  );
}
