import { CATEGORIES, CATEGORY_CONFIG, formatCurrency, getMargin } from "../constants";
import { ProcedureCost, OverheadSchedule, OverheadAnalysis, Procedure, ViewMode } from "../types";
import { CardView, CategoryBadge, ListView } from "./";
import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/utils/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Trash2,
  Clock,
  LayoutGrid,
  LayoutList,
  Search,
  TrendingUp,
  Stethoscope,
  BookOpen,
  Printer,
  Globe,
  Power,
  PowerOff,
  DollarSign,
  Wrench,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/utils/utils";

export function MarginBadge({ margin }: { margin: number }) {
  const color = margin >= 60 ? "text-emerald-600" : margin >= 35 ? "text-amber-600" : "text-red-500";
  return <span className={cn("text-xs font-semibold tabular-nums", color)}>{margin.toFixed(0)}%</span>;
}

