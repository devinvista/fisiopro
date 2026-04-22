import React from "react";
import { FileText, FileImage, File } from "lucide-react";

export function AttachmentTypeIcon({ contentType }: { contentType: string | null }) {
  if (!contentType) return <FileText className="w-5 h-5 text-indigo-400" />;
  if (contentType.startsWith("image/")) return <FileImage className="w-5 h-5 text-blue-500" />;
  if (contentType === "application/pdf") return <FileText className="w-5 h-5 text-red-500" />;
  return <File className="w-5 h-5 text-slate-400" />;
}
