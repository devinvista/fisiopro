import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  Loader2, Plus, Info, Activity, TrendingUp, TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerPTBR } from "@/components/ui/date-picker-ptbr";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { VoiceTextarea as Textarea } from "@/components/ui/voice-textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type BodyMeasurementPoint = {
  id: number; date: string;
  weight: number | null; height: number | null;
  waist: number | null; abdomen: number | null; hips: number | null;
  thighRight: number | null; thighLeft: number | null;
  armRight: number | null; armLeft: number | null;
  calfRight: number | null; calfLeft: number | null;
  bodyFat: number | null; celluliteGrade: string | null; notes: string | null;
};

type IndicatorsResponse = {
  eva: { date: string; value: number; source: string; label: string }[];
  body: { weight?: string | null; height?: string | null; updatedAt: string } | null;
  reab: { cid10?: string | null; painLocation?: string | null; updatedAt: string } | null;
  bodyMeasurements: BodyMeasurementPoint[];
};

const emptyMeasForm = {
  measuredAt: format(new Date(), "yyyy-MM-dd"),
  weight: "", height: "",
  waist: "", abdomen: "", hips: "",
  thighRight: "", thighLeft: "",
  armRight: "", armLeft: "",
  calfRight: "", calfLeft: "",
  bodyFat: "", celluliteGrade: "", notes: "",
};

function MeasField({ label, value, unit = "cm", onChange }: { label: string; value: string; unit?: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-slate-500">{label} <span className="text-slate-400">({unit})</span></Label>
      <Input type="number" step="0.1" placeholder="—" value={value}
        onChange={e => onChange(e.target.value)} className="h-8 text-sm" />
    </div>
  );
}

export function IndicatorsPanel({ patientId }: { patientId: number }) {
  const token = localStorage.getItem("fisiogest_token");
  const indicatorHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const [showAdd, setShowAdd] = useState(false);
  const [measForm, setMeasForm] = useState({ ...emptyMeasForm });
  const [savingMeas, setSavingMeas] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: indicators, isLoading } = useQuery<IndicatorsResponse>({
    queryKey: [`/api/patients/${patientId}/indicators`],
    queryFn: () =>
      fetch(`/api/patients/${patientId}/indicators`, { headers: indicatorHeaders })
        .then(r => r.ok ? r.json() : { eva: [], body: null, reab: null, bodyMeasurements: [] }),
    enabled: !!patientId,
  });

  if (isLoading) return null;
  if (!indicators) return null;

  const eva = indicators.eva ?? [];
  const bm = indicators.bodyMeasurements ?? [];
  const evaColor = (v: number) => v >= 7 ? "#dc2626" : v >= 4 ? "#f97316" : "#16a34a";

  const latestEva = eva[eva.length - 1];
  const firstEva = eva[0];
  const evaTrend = latestEva && firstEva && eva.length > 1 ? latestEva.value - firstEva.value : null;

  const evaChartData = eva.map(p => ({
    value: p.value,
    date: format(new Date(p.date), "dd/MM/yy", { locale: ptBR }),
  }));

  const firstBm = bm[0];
  const latestBm = bm[bm.length - 1];

  const bmiCalc = (w: number | null, h: number | null) => {
    if (!w || !h || h <= 0) return null;
    const v = w / ((h / 100) ** 2);
    return { val: v.toFixed(1), cat: v < 18.5 ? "Abaixo do peso" : v < 25 ? "Normal" : v < 30 ? "Sobrepeso" : "Obesidade" };
  };
  const currentBmi = latestBm ? bmiCalc(latestBm.weight, latestBm.height) : null;
  const weightDelta = firstBm?.weight && latestBm?.weight && firstBm.id !== latestBm.id
    ? (latestBm.weight - firstBm.weight) : null;

  const bmChartData = bm.map(m => ({
    date: format(new Date(m.date), "dd/MM/yy", { locale: ptBR }),
    peso: m.weight,
    cintura: m.waist,
    abdomen: m.abdomen,
    quadril: m.hips,
    coxaD: m.thighRight,
  }));

  const perimCards = [
    { label: "Cintura", first: firstBm?.waist, last: latestBm?.waist },
    { label: "Abdômen", first: firstBm?.abdomen, last: latestBm?.abdomen },
    { label: "Quadril", first: firstBm?.hips, last: latestBm?.hips },
    { label: "Coxa D", first: firstBm?.thighRight, last: latestBm?.thighRight },
    { label: "Coxa E", first: firstBm?.thighLeft, last: latestBm?.thighLeft },
    { label: "Braço D", first: firstBm?.armRight, last: latestBm?.armRight },
    { label: "Braço E", first: firstBm?.armLeft, last: latestBm?.armLeft },
  ].filter(c => c.first != null || c.last != null);

  const mf = (field: keyof typeof emptyMeasForm) => measForm[field];
  const sf = (field: keyof typeof emptyMeasForm) => (v: string) => setMeasForm(f => ({ ...f, [field]: v }));

  const handleSaveMeasurement = async () => {
    setSavingMeas(true);
    try {
      const body: Record<string, any> = { measuredAt: measForm.measuredAt };
      const numFields = ["weight","height","waist","abdomen","hips","thighRight","thighLeft","armRight","armLeft","calfRight","calfLeft","bodyFat"] as const;
      for (const f of numFields) {
        if (measForm[f] !== "") body[f] = parseFloat(measForm[f]);
      }
      if (measForm.celluliteGrade) body.celluliteGrade = measForm.celluliteGrade;
      if (measForm.notes) body.notes = measForm.notes;
      const res = await fetch(`/api/patients/${patientId}/body-measurements`, {
        method: "POST",
        headers: { ...(indicatorHeaders as Record<string, string>), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Medição registrada!", description: "Dados corporais salvos com sucesso." });
      setShowAdd(false);
      setMeasForm({ ...emptyMeasForm, measuredAt: format(new Date(), "yyyy-MM-dd") });
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/indicators`] });
    } catch {
      toast({ title: "Erro ao salvar medição", variant: "destructive" });
    } finally {
      setSavingMeas(false);
    }
  };

  const hasAnyData = eva.length > 0 || bm.length > 0;

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
              <Activity className="w-4 h-4 text-violet-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Indicadores de Acompanhamento</p>
              <p className="text-[11px] text-slate-400">
                {[eva.length > 0 && `${eva.length} registro(s) EVA`, bm.length > 0 && `${bm.length} medição(ões) corporais`].filter(Boolean).join(" · ") || "Nenhum registro ainda"}
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setShowAdd(true)}>
            <Plus className="w-3.5 h-3.5" />
            Adicionar Medição
          </Button>
        </div>

        {!hasAnyData && (
          <div className="flex items-center gap-2 text-xs text-slate-400 italic py-1">
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            Clique em "Adicionar Medição" para iniciar o acompanhamento evolutivo do paciente.
          </div>
        )}

        {/* EVA Section */}
        {eva.length > 0 && (
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Dor — Escala EVA</p>
              <div className="flex items-center gap-2">
                {latestEva && (
                  <span className="text-lg font-bold" style={{ color: evaColor(latestEva.value) }}>{latestEva.value}/10</span>
                )}
                {evaTrend !== null && (
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    evaTrend < 0 ? "bg-green-50 text-green-700" : evaTrend > 0 ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600"
                  }`}>
                    {evaTrend < 0 ? <TrendingDown className="w-3 h-3" /> : evaTrend > 0 ? <TrendingUp className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
                    {evaTrend < 0 ? `${Math.abs(evaTrend)}pts melhora` : evaTrend > 0 ? `${evaTrend}pts piora` : "Estável"}
                  </div>
                )}
              </div>
            </div>
            {eva.length >= 2 ? (
              <div className="h-[110px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={evaChartData} margin={{ top: 4, right: 8, left: -22, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                    <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 9, fill: "#94a3b8" }} />
                    <ReferenceLine y={7} stroke="#dc2626" strokeDasharray="4 4" strokeOpacity={0.35} />
                    <ReferenceLine y={4} stroke="#f97316" strokeDasharray="4 4" strokeOpacity={0.35} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      formatter={(v: number) => [`${v}/10`, "EVA"]} />
                    <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2}
                      dot={(props: any) => <circle key={props.key} cx={props.cx} cy={props.cy} r={4} fill={evaColor(props.payload.value)} stroke="#fff" strokeWidth={1.5} />}
                      activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 italic">Registre mais sessões com EVA para ver o gráfico de evolução da dor.</p>
            )}
          </div>
        )}

        {/* Peso & Composição */}
        {bm.length > 0 && (
          <>
            <div className="border-t border-slate-100 pt-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Peso & Composição Corporal</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {latestBm.weight && (
                    <span className="text-base font-bold text-slate-800">{latestBm.weight} kg</span>
                  )}
                  {weightDelta !== null && (
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      weightDelta < 0 ? "bg-green-50 text-green-700" : weightDelta > 0 ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"
                    }`}>
                      {weightDelta < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                      {weightDelta > 0 ? "+" : ""}{weightDelta.toFixed(1)} kg
                    </div>
                  )}
                  {currentBmi && (
                    <span className="text-[11px] text-slate-500">IMC {currentBmi.val} <span className="text-slate-400">({currentBmi.cat})</span></span>
                  )}
                </div>
              </div>
              {bm.length >= 2 && (
                <div className="h-[100px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={bmChartData} margin={{ top: 4, right: 8, left: -22, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
                        formatter={(v: number) => [`${v} kg`, "Peso"]} />
                      <Line type="monotone" dataKey="peso" stroke="#8b5cf6" strokeWidth={2}
                        dot={{ fill: "#8b5cf6", r: 3 }} activeDot={{ r: 5 }} name="Peso" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {latestBm.bodyFat && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500">% Gordura:</span>
                  <span className="font-semibold text-slate-700">{latestBm.bodyFat}%</span>
                  {firstBm?.bodyFat && firstBm.id !== latestBm.id && (
                    <span className={`font-medium text-[11px] ${latestBm.bodyFat < firstBm.bodyFat ? "text-green-600" : "text-amber-600"}`}>
                      ({latestBm.bodyFat > firstBm.bodyFat ? "+" : ""}{(latestBm.bodyFat - firstBm.bodyFat).toFixed(1)}%)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Perimetria */}
            {perimCards.length > 0 && (
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Perimetria Corporal</p>
                <div className="flex flex-wrap gap-2">
                  {perimCards.map(c => {
                    const delta = c.first != null && c.last != null && c.first !== c.last
                      ? c.last - c.first : null;
                    return (
                      <div key={c.label} className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5">
                        <span className="text-[11px] text-slate-500">{c.label}:</span>
                        <span className="text-xs font-bold text-slate-800">{c.last ?? c.first} cm</span>
                        {delta !== null && (
                          <span className={`text-[10px] font-semibold ${delta < 0 ? "text-green-600" : "text-amber-600"}`}>
                            ({delta > 0 ? "+" : ""}{delta.toFixed(1)})
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {bm.length >= 2 && bmChartData.some(d => d.cintura || d.abdomen || d.quadril) && (
                  <div className="h-[110px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={bmChartData} margin={{ top: 4, right: 8, left: -22, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                        <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} />
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
                          formatter={(v: number, name: string) => [`${v} cm`, name]} />
                        {bmChartData.some(d => d.cintura) && (
                          <Line type="monotone" dataKey="cintura" stroke="#ec4899" strokeWidth={2} dot={{ fill: "#ec4899", r: 3 }} name="Cintura" />
                        )}
                        {bmChartData.some(d => d.abdomen) && (
                          <Line type="monotone" dataKey="abdomen" stroke="#f97316" strokeWidth={2} dot={{ fill: "#f97316", r: 3 }} name="Abdômen" />
                        )}
                        {bmChartData.some(d => d.quadril) && (
                          <Line type="monotone" dataKey="quadril" stroke="#a855f7" strokeWidth={2} dot={{ fill: "#a855f7", r: 3 }} name="Quadril" />
                        )}
                        {bmChartData.some(d => d.coxaD) && (
                          <Line type="monotone" dataKey="coxaD" stroke="#14b8a6" strokeWidth={1.5} strokeDasharray="4 2" dot={{ fill: "#14b8a6", r: 2.5 }} name="Coxa D" />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {latestBm.celluliteGrade && (
                  <div className="text-xs flex items-center gap-1.5">
                    <span className="text-slate-500">Grau de celulite:</span>
                    <Badge variant="secondary" className="text-[11px] h-5">Grau {latestBm.celluliteGrade}</Badge>
                    {firstBm?.celluliteGrade && firstBm.id !== latestBm.id && firstBm.celluliteGrade !== latestBm.celluliteGrade && (
                      <span className="text-slate-400">(era Grau {firstBm.celluliteGrade})</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Measurement Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar Medição Corporal</DialogTitle>
            <DialogDescription>Registre as medidas do paciente para acompanhar a evolução ao longo do tratamento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1">
              <Label className="text-[11px] text-slate-500">Data da medição</Label>
              <DatePickerPTBR value={measForm.measuredAt}
                onChange={(v) => setMeasForm(f => ({ ...f, measuredAt: v }))} className="h-8 text-sm" />
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Biometria</p>
              <div className="grid grid-cols-2 gap-3">
                <MeasField label="Peso" value={mf("weight")} unit="kg" onChange={sf("weight")} />
                <MeasField label="Altura" value={mf("height")} unit="cm" onChange={sf("height")} />
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Perimetria (cm)</p>
              <div className="grid grid-cols-3 gap-2">
                <MeasField label="Cintura" value={mf("waist")} onChange={sf("waist")} />
                <MeasField label="Abdômen" value={mf("abdomen")} onChange={sf("abdomen")} />
                <MeasField label="Quadril" value={mf("hips")} onChange={sf("hips")} />
                <MeasField label="Coxa D" value={mf("thighRight")} onChange={sf("thighRight")} />
                <MeasField label="Coxa E" value={mf("thighLeft")} onChange={sf("thighLeft")} />
                <MeasField label="Braço D" value={mf("armRight")} onChange={sf("armRight")} />
                <MeasField label="Braço E" value={mf("armLeft")} onChange={sf("armLeft")} />
                <MeasField label="Pant. D" value={mf("calfRight")} onChange={sf("calfRight")} />
                <MeasField label="Pant. E" value={mf("calfLeft")} onChange={sf("calfLeft")} />
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Composição & Qualidade</p>
              <div className="grid grid-cols-2 gap-3">
                <MeasField label="% Gordura Corporal" value={mf("bodyFat")} unit="%" onChange={sf("bodyFat")} />
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">Grau de Celulite</Label>
                  <Select value={measForm.celluliteGrade} onValueChange={v => setMeasForm(f => ({ ...f, celluliteGrade: v }))}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="I">Grau I — Leve</SelectItem>
                      <SelectItem value="II">Grau II — Moderada</SelectItem>
                      <SelectItem value="III">Grau III — Intensa</SelectItem>
                      <SelectItem value="IV">Grau IV — Muito intensa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-slate-500">Observações clínicas</Label>
              <Textarea rows={2} placeholder="Notas adicionais..." value={measForm.notes}
                onChange={e => setMeasForm(f => ({ ...f, notes: e.target.value }))} className="text-sm resize-none" />
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleSaveMeasurement} disabled={savingMeas}>
                {savingMeas && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
                Salvar Medição
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
