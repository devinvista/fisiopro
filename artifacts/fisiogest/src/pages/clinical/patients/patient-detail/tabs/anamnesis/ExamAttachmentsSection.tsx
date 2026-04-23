import React, { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  Paperclip, FileText, Upload, Loader2, Download, Trash2, 
  ChevronUp, ChevronDown 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { VoiceTextarea as Textarea } from "@/components/ui/voice-textarea";
import { useToast } from "@/lib/toast";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "../../utils/format";
import { ExamAttachment } from "./types";
import { ACCEPTED_MIME } from "./constants";
import { formatFileSize } from "./utils";
import { AttachmentTypeIcon } from "./AttachmentTypeIcon";

interface ExamAttachmentsSectionProps {
  patientId: number;
}

export function ExamAttachmentsSection({ patientId }: ExamAttachmentsSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [addMode, setAddMode] = useState<null | "text" | "file">(null);
  const [uploading, setUploading] = useState(false);
  const [savingText, setSavingText] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [textForm, setTextForm] = useState({ examTitle: "", resultText: "" });

  const { data: attachments = [], isLoading } = useQuery<ExamAttachment[]>({
    queryKey: [`/api/patients/${patientId}/attachments`],
    queryFn: async () => {
      const res = await apiFetch(`/api/patients/${patientId}/attachments`);
      if (!res.ok) throw new Error("Falha ao carregar anexos");
      return res.json();
    },
  });

  const handleSaveText = async () => {
    if (!textForm.resultText.trim()) {
      toast({ title: "Resultado obrigatório", description: "Digite o resultado do exame.", variant: "destructive" });
      return;
    }
    setSavingText(true);
    try {
      const res = await apiFetch(`/api/patients/${patientId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examTitle: textForm.examTitle || null, resultText: textForm.resultText }),
      });
      if (!res.ok) throw new Error("Falha ao salvar resultado");
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/attachments`] });
      toast({ title: "Resultado salvo" });
      setTextForm({ examTitle: "", resultText: "" });
      setAddMode(null);
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setSavingText(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    if (!ACCEPTED_MIME.includes(file.type)) {
      toast({ title: "Tipo não suportado", description: "Aceitos: PDF, DOCX, JPG, PNG, WebP.", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Tamanho máximo: 20 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    setAddMode(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "fisiogest/attachments");

      const uploadRes = await apiFetch("/api/storage/uploads/proxy", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        const data = await uploadRes.json().catch(() => ({}));
        throw new Error(data?.message || data?.error || `Falha ao enviar arquivo (HTTP ${uploadRes.status})`);
      }
      const uploadData = await uploadRes.json();
      const objectPath: string = uploadData.secure_url;

      const metaRes = await apiFetch(`/api/patients/${patientId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalFilename: file.name, contentType: file.type, fileSize: file.size, objectPath }),
      });
      if (!metaRes.ok) throw new Error("Falha ao registrar anexo");

      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/attachments`] });
      toast({ title: "Arquivo enviado", description: file.name });
    } catch (err: any) {
      toast({ title: "Erro no upload", description: err?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (att: ExamAttachment) => {
    if (!att.objectPath || !att.originalFilename) return;
    try {
      const res = await fetch(att.objectPath);
      if (!res.ok) throw new Error("Falha ao baixar arquivo");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.originalFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Erro ao baixar", description: "Não foi possível baixar o arquivo.", variant: "destructive" });
    }
  };

  const handleDelete = async (att: ExamAttachment) => {
    setDeletingId(att.id);
    try {
      const res = await apiFetch(`/api/patients/${patientId}/attachments/${att.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/attachments`] });
      toast({ title: "Registro removido" });
    } catch {
      toast({ title: "Erro ao remover", description: "Não foi possível remover o registro.", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-3 pt-4 border-t border-slate-100">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Anexos e Exames Complementares</span>
          {attachments.length > 0 && (
            <span className="bg-slate-100 text-slate-500 text-xs font-medium px-2 py-0.5 rounded-full">
              {attachments.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant={addMode === "text" ? "default" : "outline"}
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={uploading}
            onClick={() => setAddMode(addMode === "text" ? null : "text")}
          >
            <FileText className="w-3.5 h-3.5" />
            Digitar resultado
          </Button>
          <Button
            variant={uploading ? "default" : "outline"}
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={uploading}
            onClick={() => { setAddMode(null); fileInputRef.current?.click(); }}
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? "Enviando..." : "Anexar arquivo"}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_MIME.join(",")}
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {addMode === "text" && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Novo resultado de exame</p>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Nome do exame</Label>
            <Input
              className="h-8 text-sm bg-white border-slate-200"
              placeholder="Ex: Hemograma Completo, Raio-X Coluna..."
              value={textForm.examTitle}
              onChange={e => setTextForm(f => ({ ...f, examTitle: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Resultado <span className="text-red-400">*</span></Label>
            <Textarea
              className="min-h-[100px] text-sm bg-white border-slate-200 resize-none"
              placeholder="Digite o resultado do exame, laudos, observações..."
              value={textForm.resultText}
              onChange={e => setTextForm(f => ({ ...f, resultText: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setAddMode(null); setTextForm({ examTitle: "", resultText: "" }); }}>
              Cancelar
            </Button>
            <Button size="sm" className="h-8 text-xs" disabled={savingText} onClick={handleSaveText}>
              {savingText && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
              Salvar resultado
            </Button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
        </div>
      )}

      {!isLoading && attachments.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
          <Paperclip className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm font-medium">Nenhum exame registrado</p>
          <p className="text-xs mt-0.5">Digite o resultado ou anexe um arquivo</p>
        </div>
      )}

      {!isLoading && attachments.length > 0 && (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 overflow-hidden">
          {attachments.map((att) => {
            const isText = !att.objectPath && att.resultText;
            const isExpanded = expandedId === att.id;
            const title = att.examTitle || att.originalFilename || "Sem título";
            return (
              <div key={att.id} className="bg-white hover:bg-slate-50/60 transition-colors">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <AttachmentTypeIcon contentType={att.contentType} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{title}</p>
                    <p className="text-xs text-slate-400">
                      {isText
                        ? `Resultado digitado · ${formatDateTime(att.uploadedAt)}`
                        : `${att.fileSize ? formatFileSize(att.fileSize) : ""} · ${formatDateTime(att.uploadedAt)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {att.resultText && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-indigo-500"
                        title={isExpanded ? "Recolher" : "Ver resultado"}
                        onClick={() => setExpandedId(isExpanded ? null : att.id)}
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </Button>
                    )}
                    {att.objectPath && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-primary"
                        title="Baixar arquivo"
                        onClick={() => handleDownload(att)}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-red-500"
                      title="Remover"
                      disabled={deletingId === att.id}
                      onClick={() => handleDelete(att)}
                    >
                      {deletingId === att.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
                {isExpanded && att.resultText && (
                  <div className="px-11 pb-3">
                    <div className="rounded-lg bg-indigo-50/60 border border-indigo-100 px-3 py-2.5 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {att.resultText}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
