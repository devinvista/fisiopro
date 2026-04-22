import { useParams, useLocation } from "wouter";
import { apiFetch } from "@/utils/api";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetPatient,
  useCreateAnamnesis,
  useListEvaluations,
  useCreateEvaluation,
  useUpdateEvaluation,
  useDeleteEvaluation,
  useListEvolutions,
  useCreateEvolution,
  useUpdateEvolution,
  useDeleteEvolution,
  useGetDischarge,
  useSaveDischarge,
  useUpdatePatient,
  useDeletePatient,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Phone, Mail, Calendar, Activity, ClipboardList, TrendingUp,
  FileText, DollarSign, History, Plus, ChevronDown, ChevronUp, User,
  MapPin, Stethoscope, Target, CheckCircle, Clock, XCircle, AlertCircle,
  LogOut, Pencil, Trash2, ShieldAlert, UserCheck, Lock, Paperclip, Upload,
  FileImage, File, Download, ScrollText, Printer, BadgeCheck, CalendarDays,
  ClipboardCheck, PenLine, Package, Layers, RefreshCw, Info,
  Milestone, RotateCcw, Filter,
  Check, ArrowUpRight, Zap, X,
  Wallet, TrendingDown, ArrowDownRight,
  Sparkles, Leaf, Droplets, Sun, Dumbbell, Scale, Ruler, FlaskConical,
  ShieldCheck, Link2, Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceTextarea as Textarea } from "@/components/ui/voice-textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInYears, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DatePickerPTBR } from "@/components/ui/date-picker-ptbr";
import { useAuth } from "@/utils/use-auth";
import { PlanBadge } from "@/components/guards/plan-badge";
import { maskCpf, maskPhone, displayCpf } from "@/utils/masks";
import { PhotosTab } from "../../photos-tab";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── Print stack & shared formatters extraídos para _patient-detail/ ──────────
import type { PatientBasic, ClinicInfo, PkgOption, PlanProcedureItem } from "../types";
import {
  statusConfig,
  formatDate,
  formatDateTime,
  formatCurrency,
  fmtCur,
  todayBRTDate,
  InfoBlock,
} from "../utils/format";
import {
  ExportProntuarioButton,
  fetchClinicForPrint,
  printDocument,
  generateDischargeHTML,
  generateEvolutionsHTML,
  generatePlanHTML,
  generateContractHTML,
} from "../utils/print-html";

// ─── Extracted from patients/[id].tsx ──────────────────────────────────────

interface EvoTemplate {
  id: string;
  name: string;
  icon: string;
  category: string;
  color: string;
  description: string;
  patientResponse: string;
  clinicalNotes: string;
  complications: string;
  chips: {
    description: string[];
    patientResponse: string[];
    clinicalNotes: string[];
    complications: string[];
  };
}

type EvoFormState = typeof emptyEvoForm;

const emptyEvoForm = {
  appointmentId: "" as string | number,
  description: "", patientResponse: "", clinicalNotes: "", complications: "",
  painScale: null as number | null,
  sessionDuration: "" as string | number,
  techniquesUsed: "", homeExercises: "", nextSessionGoals: "",
};

const EVOLUTION_TEMPLATES: EvoTemplate[] = [
  {
    id: "ortopedica",
    name: "Fisioterapia Ortopédica",
    icon: "🦴",
    category: "Ortopedia",
    color: "bg-blue-50 border-blue-200 text-blue-700",
    description: "Realizada sessão de fisioterapia ortopédica com aplicação de recursos termoterápicos e cinesioterapia. Executados exercícios de fortalecimento muscular, alongamento e mobilização articular conforme plano terapêutico.",
    patientResponse: "Paciente apresentou boa tolerância aos exercícios propostos. Referiu melhora na amplitude de movimento e redução da sintomatologia dolorosa em relação à sessão anterior.",
    clinicalNotes: "Observada melhora progressiva da funcionalidade. Mantidas as condutas do plano terapêutico. Orientado sobre a importância da continuidade do tratamento e exercícios domiciliares.",
    complications: "",
    chips: {
      description: ["Eletroterapia (TENS/FES)", "Ultrassom terapêutico", "Crioterapia", "Termoterapia", "Exercícios de propriocepção", "Mobilização articular", "Massoterapia", "RPG"],
      patientResponse: ["Boa tolerância", "Refere melhora da dor", "Apresentou fadiga muscular", "Sem queixas adicionais", "Refere melhora funcional", "Dor durante o exercício"],
      clinicalNotes: ["Amplitude de movimento melhorada", "Força muscular progredindo", "Edema reduzido", "Marcha melhorada", "Orientações domiciliares fornecidas"],
      complications: ["Sem intercorrências", "Leve desconforto relatado", "Aumento temporário da dor", "Tontura durante exercício"],
    },
  },
  {
    id: "pilates",
    name: "Pilates Clínico",
    icon: "🧘",
    category: "Pilates",
    color: "bg-purple-50 border-purple-200 text-purple-700",
    description: "Sessão de Pilates clínico realizada no aparelho/solo. Trabalhados princípios de centralização, controle, precisão e respiração. Exercícios progressivos adaptados às necessidades e limitações do paciente.",
    patientResponse: "Paciente engajado e motivado durante a sessão. Demonstrou boa compreensão dos princípios do método e coordenação motora adequada na execução dos movimentos.",
    clinicalNotes: "Evolução positiva na estabilização do core e alinhamento postural. Exercícios com carga progressiva conforme tolerância. Coordenação respiratória em desenvolvimento.",
    complications: "",
    chips: {
      description: ["Exercícios no Reformer", "Exercícios no solo", "Cadillac", "Chair/Wunda", "Barrel/Tonnel", "Exercícios de respiração", "Ativação do core", "Fortalecimento global"],
      patientResponse: ["Ótima coordenação", "Dificuldade na respiração", "Boa estabilização", "Motivado e engajado", "Cansaço moderado", "Excelente execução"],
      clinicalNotes: ["Core estabilizado", "Postura melhorada", "Progressão de carga realizada", "Padrão respiratório melhorado", "Equilíbrio em desenvolvimento"],
      complications: ["Sem intercorrências", "Tensão lombar ao final", "Adaptação aos aparelhos"],
    },
  },
  {
    id: "neurologica",
    name: "Fisioterapia Neurológica",
    icon: "🧠",
    category: "Neurologia",
    color: "bg-indigo-50 border-indigo-200 text-indigo-700",
    description: "Sessão de fisioterapia neurológica com foco em reabilitação funcional. Aplicadas técnicas de facilitação neuromuscular proprioceptiva (FNP), estimulação sensório-motora e treino de atividades funcionais.",
    patientResponse: "Paciente colaborativo durante a sessão. Apresentou resposta adequada às estimulações propostas. Observada melhora na qualidade do movimento e controle motor.",
    clinicalNotes: "Evolução gradual do quadro motor e funcional. Mantida estimulação sensório-motora e treino de atividades de vida diária (AVDs). Família orientada sobre continuidade do tratamento.",
    complications: "",
    chips: {
      description: ["FNP (Kabat)", "Bobath / NDT", "Treino de marcha", "Equilíbrio e propriocepção", "Estimulação sensorial", "Treino de AVDs", "Eletroestimulação", "Treino cognitivo-motor"],
      patientResponse: ["Colaborativo", "Espasticidade aumentada", "Melhora no tônus", "Fadiga precoce", "Boa resposta às estimulações", "Agitação durante sessão"],
      clinicalNotes: ["Tônus muscular melhorado", "Controle motor progressivo", "Marcha com assistência", "Coordenação melhorada", "Família orientada"],
      complications: ["Sem intercorrências", "Espasmo durante exercício", "Cansaço excessivo", "Queda de pressão"],
    },
  },
  {
    id: "rpg",
    name: "RPG — Postural Global",
    icon: "🧍",
    category: "Postura",
    color: "bg-teal-50 border-teal-200 text-teal-700",
    description: "Sessão de Reeducação Postural Global (RPG) realizada. Trabalhadas posturas de fechamento/abertura em cadeia muscular posterior e anterior. Alongamentos globais e conscientização corporal.",
    patientResponse: "Paciente apresentou relaxamento muscular progressivo durante as posturas. Referiu sensação de alongamento e leveza após a sessão. Boa conscientização corporal.",
    clinicalNotes: "Melhora observada no alinhamento postural e flexibilidade das cadeias musculares. Paciente orientado sobre postura no cotidiano e ergonomia.",
    complications: "",
    chips: {
      description: ["Postura em pé fechamento", "Postura em pé abertura", "Postura sentado", "Postura deitada", "Cadeia posterior trabalhada", "Cadeia anterior trabalhada", "Trabalho respiratório"],
      patientResponse: ["Sensação de leveza", "Dor durante postura", "Boa conscientização", "Dificuldade de manter postura", "Relaxamento progressivo"],
      clinicalNotes: ["Lordose diminuída", "Cifose melhorada", "Escoliose monitorada", "Orientações ergonômicas fornecidas", "Flexibilidade aumentada"],
      complications: ["Sem intercorrências", "Desconforto lombar inicial", "Tensão cervical"],
    },
  },
  {
    id: "drenagem",
    name: "Drenagem Linfática",
    icon: "💆",
    category: "Estética / Linfático",
    color: "bg-pink-50 border-pink-200 text-pink-700",
    description: "Realizada sessão de drenagem linfática manual (DLM) com manobras de pressão leve e direcionamento do fluxo linfático. Técnica realizada de forma craniocaudal, respeitando os linfonodos regionais.",
    patientResponse: "Paciente bem tolerou os procedimentos, referindo relaxamento e sensação de leveza durante a sessão. Sem queixas de desconforto durante as manobras.",
    clinicalNotes: "Observada redução do edema na região tratada. Pele com melhor elasticidade e textura. Orientada sobre hidratação e hábitos de vida para potencializar os resultados.",
    complications: "",
    chips: {
      description: ["DLM clássico (Vodder)", "DLM pós-operatório", "DLM gestacional", "Região abdominal", "Membros inferiores", "Face e pescoço", "Manobras de chamada", "Manobras de reabsorção"],
      patientResponse: ["Sensação de leveza", "Relaxamento", "Sem desconforto", "Sonolência após sessão", "Redução da sensação de peso"],
      clinicalNotes: ["Edema reduzido", "Melhora da circulação", "Pele mais elástica", "Orientações nutricionais", "Hidratação recomendada"],
      complications: ["Sem intercorrências", "Vermelhidão transitória", "Sensibilidade aumentada"],
    },
  },
  {
    id: "pos-cirurgica",
    name: "Reabilitação Pós-Cirúrgica",
    icon: "🏥",
    category: "Pós-operatório",
    color: "bg-orange-50 border-orange-200 text-orange-700",
    description: "Sessão de fisioterapia pós-operatória realizada conforme protocolo estabelecido. Trabalhados mobilização precoce, controle do edema, cicatrização tecidual e recuperação funcional progressiva.",
    patientResponse: "Paciente colaborativo e motivado com a evolução do tratamento. Refere melhora em relação à sessão anterior. Tolerância ao exercício dentro do esperado para esta fase do protocolo.",
    clinicalNotes: "Evolução dentro do esperado para o período pós-operatório. Ferida cirúrgica em processo de cicatrização adequado. Amplitude de movimento progressiva conforme tolerância.",
    complications: "",
    chips: {
      description: ["Fase 1 — controle de edema", "Fase 2 — ganho de ADM", "Fase 3 — fortalecimento", "Fase 4 — retorno esportivo", "Crioterapia pós-exercício", "Mobilização precoce", "Descarga de peso progressiva"],
      patientResponse: ["Boa tolerância ao protocolo", "Dor controlada", "Melhora gradual", "Referiu cansaço", "Ansioso para progredir"],
      clinicalNotes: ["Cicatrização adequada", "Edema reduzido", "ADM aumentada", "Força muscular em progressão", "Gait sem compensações"],
      complications: ["Sem intercorrências", "Aumento do edema após exercício", "Dor além do esperado", "Vermelhidão na cicatriz"],
    },
  },
  {
    id: "eletroterapia",
    name: "Eletroterapia / TENS",
    icon: "⚡",
    category: "Recursos Físicos",
    color: "bg-yellow-50 border-yellow-200 text-yellow-700",
    description: "Aplicação de eletroterapia com corrente TENS (Estimulação Elétrica Nervosa Transcutânea) na região afetada. Parâmetros utilizados: modo convencional, frequência 80-100 Hz, duração de pulso 50-100µs, intensidade abaixo do limiar motor.",
    patientResponse: "Paciente referiu sensação de parestesia (formigamento) confortável durante a aplicação. Relatou alívio da dor ao término da sessão.",
    clinicalNotes: "Boa resposta analgésica ao TENS. Complementada com cinesioterapia e orientações ao paciente. Eletrodos posicionados adequadamente na região de dor referida.",
    complications: "",
    chips: {
      description: ["TENS modo convencional", "TENS acupuntura", "FES (estimulação muscular)", "Corrente interferencial", "Microcorrente (MENS)", "Ultrassom terapêutico", "Laser de baixa potência", "Ondas de choque"],
      patientResponse: ["Sensação de formigamento", "Alívio imediato da dor", "Contrações musculares toleradas", "Sem desconforto", "Leve ardência"],
      clinicalNotes: ["Analgesia obtida", "Eletrodos bem fixados", "Parâmetros ajustados", "Boa condutividade", "Sem reações cutâneas"],
      complications: ["Sem intercorrências", "Irritação cutânea leve", "Intolerância à intensidade", "Sensação desagradável"],
    },
  },
  {
    id: "respiratoria",
    name: "Fisioterapia Respiratória",
    icon: "🫁",
    category: "Cardiopulmonar",
    color: "bg-cyan-50 border-cyan-200 text-cyan-700",
    description: "Sessão de fisioterapia respiratória com aplicação de técnicas de higiene brônquica, reexpansão pulmonar e fortalecimento da musculatura respiratória. Realizada avaliação da ausculta pulmonar antes e após as técnicas.",
    patientResponse: "Paciente colaborativo durante as manobras. Apresentou melhora da saturação de O₂ após as técnicas. Referiu sensação de maior facilidade respiratória ao término da sessão.",
    clinicalNotes: "Ausculta pulmonar melhorada após as manobras. SpO₂ dentro dos parâmetros aceitáveis. Orientado sobre posicionamento e exercícios respiratórios domiciliares.",
    complications: "",
    chips: {
      description: ["Drenagem postural", "Vibrocompressão", "Huffing e tosse assistida", "Incentivador inspiratório", "IPPB", "Nebulização + fisioterapia", "Treino muscular inspiratório", "Respiração diafragmática"],
      patientResponse: ["Melhora da SpO₂", "Expectoração aumentada", "Dispneia reduzida", "Boa colaboração", "Cansaço após exercícios"],
      clinicalNotes: ["Ausculta melhorada", "Secreção mobilizada", "Expansibilidade aumentada", "FreqRES normalizada", "Orientações domiciliares"],
      complications: ["Sem intercorrências", "Broncoespasmo leve", "Queda transitória de SpO₂", "Tosse produtiva intensa"],
    },
  },
  {
    id: "sessao-inicial",
    name: "Primeira Sessão",
    icon: "🌟",
    category: "Especial",
    color: "bg-emerald-50 border-emerald-200 text-emerald-700",
    description: "Primeira sessão de fisioterapia realizada. Apresentação da clínica, explicação do plano terapêutico e objetivos do tratamento ao paciente. Iniciados exercícios introdutórios com carga leve para adaptação e avaliação da capacidade funcional.",
    patientResponse: "Paciente receptivo e motivado para iniciar o tratamento. Demonstrou interesse no plano terapêutico apresentado. Sem relatos de intolerância nas atividades iniciais.",
    clinicalNotes: "Sessão inicial de adaptação realizada com sucesso. Paciente orientado sobre frequência, duração e expectativas do tratamento. Condutas iniciais estabelecidas conforme avaliação funcional.",
    complications: "",
    chips: {
      description: ["Apresentação do plano terapêutico", "Avaliação funcional inicial", "Exercícios de adaptação", "Estabelecimento de metas", "Educação em dor", "Orientações gerais"],
      patientResponse: ["Motivado para o tratamento", "Receptivo às orientações", "Ansioso com as expectativas", "Dúvidas esclarecidas", "Comprometido com a frequência"],
      clinicalNotes: ["Metas terapêuticas definidas", "Plano de tratamento apresentado", "Capacidade funcional avaliada", "Exercícios domiciliares prescritos"],
      complications: ["Sem intercorrências", "Fadiga na avaliação inicial"],
    },
  },
  {
    id: "hidroterapia",
    name: "Hidroterapia",
    icon: "💧",
    category: "Aquático",
    color: "bg-sky-50 border-sky-200 text-sky-700",
    description: "Sessão de hidroterapia realizada em piscina terapêutica aquecida (32-34°C). Trabalhados exercícios de fortalecimento, alongamento e coordenação motora aproveitando as propriedades físicas da água.",
    patientResponse: "Paciente relatou bem-estar e alívio da dor durante a atividade aquática. Boa tolerância aos exercícios propostos no ambiente aquático. Motivado com a modalidade.",
    clinicalNotes: "Aproveitamento adequado das propriedades físicas da água (flutuação, resistência, hidrodinâmica). Exercícios progressivos conforme adaptação e tolerância do paciente.",
    complications: "",
    chips: {
      description: ["Exercícios de flutuação", "Caminhada aquática", "Fortalecimento resistido", "Propriocepção aquática", "Relaxamento Watsu", "Bad Ragaz rings", "Exercícios de equilíbrio"],
      patientResponse: ["Alívio da dor na água", "Boa flutuação", "Motivado", "Cansaço ao término", "Sensação de bem-estar"],
      clinicalNotes: ["Temperatura da água adequada", "Progressão de exercícios realizada", "Orientações de segurança", "Hidratação recomendada"],
      complications: ["Sem intercorrências", "Tonturas após saída da água", "Arranhão de borda", "Intolerância à temperatura"],
    },
  },
  {
    id: "pilates-grupo",
    name: "Pilates em Grupo",
    icon: "👥",
    category: "Pilates",
    color: "bg-violet-50 border-violet-200 text-violet-700",
    description: "Sessão de Pilates em grupo realizada com turma reduzida. Trabalhados princípios do método com adaptações para o formato coletivo: centralização, controle, precisão e respiração. Exercícios de solo e/ou pequenos acessórios.",
    patientResponse: "Grupo demonstrou boa participação e engajamento durante a sessão. Pacientes motivados com a dinâmica em grupo. Boa interação e execução dos movimentos propostos.",
    clinicalNotes: "Turma com progresso homogêneo. Exercícios individualizados quando necessário para adaptação às limitações de cada participante. Ambiente favorável à prática coletiva.",
    complications: "",
    chips: {
      description: ["Exercícios de solo", "Acessórios (bola, faixa, anel)", "Sequência standing", "Aquecimento em grupo", "Exercícios de respiração coletiva", "Alongamento final em grupo", "Ativação do core em grupo"],
      patientResponse: ["Boa integração ao grupo", "Motivados pela dinâmica coletiva", "Solicitaram progressão", "Cansaço moderado", "Excelente colaboração", "Dificuldade em acompanhar ritmo"],
      clinicalNotes: ["Turma nivelada", "Adaptação individual realizada", "Progressão coletiva realizada", "Orientações individualizadas", "Nível intermediário atingido"],
      complications: ["Sem intercorrências", "Participante com limitação específica", "Cansaço excessivo de um participante"],
    },
  },
  {
    id: "massoterapia",
    name: "Massagem / Massoterapia",
    icon: "🤲",
    category: "Estética / Relaxamento",
    color: "bg-rose-50 border-rose-200 text-rose-700",
    description: "Sessão de massoterapia/massagem terapêutica realizada com manobras de deslizamento, amassamento, fricção e percussão. Técnica adaptada às necessidades e preferências do paciente, com foco nas regiões de maior tensão muscular.",
    patientResponse: "Paciente relatou relaxamento progressivo durante a sessão. Referiu alívio das tensões musculares e sensação de bem-estar ao término. Boa tolerância à pressão aplicada.",
    clinicalNotes: "Identificadas regiões de maior tensão muscular e pontos-gatilho. Manobras direcionadas às áreas de maior contração. Paciente orientado sobre hidratação pós-sessão.",
    complications: "",
    chips: {
      description: ["Massagem relaxante", "Massagem desportiva", "Massagem terapêutica profunda", "Liberação miofascial", "Pontos-gatilho (trigger points)", "Região cervical e ombros", "Região lombar", "Membros inferiores", "Corpo inteiro"],
      patientResponse: ["Relaxamento profundo", "Alívio imediato das tensões", "Sonolência após sessão", "Dor à pressão nos pontos-gatilho", "Sensação de leveza muscular"],
      clinicalNotes: ["Tensão muscular reduzida", "Pontos-gatilho tratados", "Circulação local melhorada", "Orientação de hidratação", "Presença de nódulos miofasciais"],
      complications: ["Sem intercorrências", "Sensibilidade elevada na região", "Vermelhidão local transitória", "Hematoma superficial"],
    },
  },
  {
    id: "radiofrequencia",
    name: "Radiofrequência",
    icon: "📡",
    category: "Estética",
    color: "bg-amber-50 border-amber-200 text-amber-700",
    description: "Sessão de radiofrequência realizada para remodelamento tissular e estimulação do colágeno. Aplicação com cabeçote deslizante na região tratada, mantendo temperatura terapêutica entre 40-42°C durante o tempo de exposição.",
    patientResponse: "Paciente relatou sensação de calor confortável durante a aplicação. Boa tolerância ao procedimento. Sem queixas de desconforto excessivo durante a sessão.",
    clinicalNotes: "Temperatura monitorada durante toda a aplicação. Pele hidratada e com melhora de elasticidade observada. Orientada sobre cuidados pós-sessão: hidratação e fotoproteção.",
    complications: "",
    chips: {
      description: ["Radiofrequência facial", "Radiofrequência corporal", "Radiofrequência abdominal", "Radiofrequência em flacidez", "Radiofrequência fracionada", "Região de papada", "Região de coxa e glúteo", "Região de braços"],
      patientResponse: ["Calor agradável", "Boa tolerância", "Sensação de firmeza imediata", "Leve vermelhidão transitória", "Sem desconforto"],
      clinicalNotes: ["Temperatura monitorada (40-42°C)", "Pele com maior elasticidade", "Colágeno estimulado", "Fotoproteção orientada", "Hidratação recomendada"],
      complications: ["Sem intercorrências", "Vermelhidão persistente", "Queimação leve", "Bolha ou eritema intenso"],
    },
  },
  {
    id: "ultrassom",
    name: "Ultrassom Terapêutico",
    icon: "🔊",
    category: "Recursos Físicos",
    color: "bg-slate-50 border-slate-300 text-slate-700",
    description: "Aplicação de ultrassom terapêutico na região afetada. Modo contínuo para efeito térmico (aquecimento profundo) ou pulsado para efeito mecânico (anti-inflamatório). Frequência e intensidade ajustadas conforme a patologia e profundidade do tecido-alvo.",
    patientResponse: "Paciente relatou sensação de calor leve e profundo durante a aplicação (modo contínuo) / sem sensação significativa (modo pulsado). Boa tolerância ao procedimento.",
    clinicalNotes: "Gel condutor utilizado em quantidade adequada. Cabeçote mantido em movimento constante durante a aplicação. Parâmetros ajustados conforme fase do processo inflamatório.",
    complications: "",
    chips: {
      description: ["Modo contínuo (térmico)", "Modo pulsado (anti-inflamatório)", "Frequência 1 MHz (tecidos profundos)", "Frequência 3 MHz (tecidos superficiais)", "Articulação do ombro", "Região lombossacral", "Joelho", "Tendões e ligamentos"],
      patientResponse: ["Calor leve e agradável", "Sem sensação térmica (pulsado)", "Boa tolerância", "Alívio após aplicação"],
      clinicalNotes: ["Gel condutor adequado", "Cabeçote em movimento constante", "Parâmetros: frequência/intensidade/tempo registrados", "Redução do processo inflamatório esperada"],
      complications: ["Sem intercorrências", "Queimação local", "Dor ao toque na região", "Dermatite de contato com gel"],
    },
  },
  {
    id: "acupuntura",
    name: "Acupuntura",
    icon: "🪡",
    category: "Acupuntura",
    color: "bg-green-50 border-green-200 text-green-700",
    description: "Sessão de acupuntura sistêmica/auricular realizada com inserção de agulhas filiformes estéreis nos pontos selecionados conforme diagnóstico energético. Agulhas mantidas por 20-30 minutos. Pontos selecionados de acordo com o quadro clínico.",
    patientResponse: "Paciente relatou sensação de deqi (peso, formigamento, distensão) nos pontos inseridos, indicando correta estimulação energética. Boa tolerância às agulhas. Referiu relaxamento durante a sessão.",
    clinicalNotes: "Agulhas descartáveis e estéreis utilizadas. Pontos selecionados conforme diagnóstico TCM e queixa principal. Verificada contraindicação antes da aplicação. Paciente em posição confortável durante todo o procedimento.",
    complications: "",
    chips: {
      description: ["Acupuntura sistêmica", "Auriculoterapia", "Eletroacupuntura", "Moxabustão", "Acupuntura para dor aguda", "Acupuntura para dor crônica", "Pontos locais e distais", "Acupuntura para ansiedade/insônia"],
      patientResponse: ["Sensação de deqi", "Relaxamento profundo", "Sonolência durante sessão", "Boa tolerância", "Sensação de alívio imediato", "Leve sangramento pontual"],
      clinicalNotes: ["Agulhas estéreis descartáveis", "Verificada contraindicação", "Pontos selecionados registrados", "Tempo de retenção: 20-30 min", "Resposta ao tratamento positiva"],
      complications: ["Sem intercorrências", "Hematoma pontual", "Tontura leve pós-sessão", "Síncope vagal (lipotimia)", "Agulha quebrada (rara)"],
    },
  },
  {
    id: "kinesio-taping",
    name: "Kinesio Taping",
    icon: "🩹",
    category: "Bandagem",
    color: "bg-lime-50 border-lime-200 text-lime-700",
    description: "Aplicação de bandagem funcional elástica (Kinesio Taping) na região afetada. Técnica selecionada conforme objetivo terapêutico: analgésica, linfática, muscular ou corretiva. Pele limpa e seca para adequada aderência da bandagem.",
    patientResponse: "Paciente tolerou bem a aplicação. Referiu sensação de suporte e leveza na região bandageada. Orientado sobre duração (3-5 dias), cuidados com água e sinais de retirada imediata.",
    clinicalNotes: "Bandagem aplicada com tensão adequada conforme técnica selecionada. Pele avaliada antes da aplicação — sem feridas, eczema ou irritações. Orientado sobre manutenção da bandagem e retorno em caso de reação adversa.",
    complications: "",
    chips: {
      description: ["Técnica inibitória (muscular)", "Técnica facilitatória (muscular)", "Técnica linfática", "Técnica corretiva postural", "Técnica analgésica em Y", "Ombro", "Coluna cervical", "Joelho / patelofemoral", "Tornozelo / fascite plantar", "Região lombar"],
      patientResponse: ["Sensação de suporte", "Alívio da dor ao movimentar", "Boa aderência", "Leve coceira inicial", "Sem desconforto com a bandagem"],
      clinicalNotes: ["Pele íntegra antes da aplicação", "Tensão adequada aplicada", "Direção e tensão registrados", "Duração: 3-5 dias orientada", "Reação alérgica descartada"],
      complications: ["Sem intercorrências", "Reação alérgica ao adesivo", "Maceração da pele", "Bandagem descolou precocemente"],
    },
  },
];

// ─── Quick-fill Chip Component ────────────────────────────────────────────────
function QuickChip({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700 border border-slate-200 hover:border-indigo-300 transition-all"
    >
      <Plus className="w-2.5 h-2.5" />
      {label}
    </button>
  );
}

// ─── Template Selector ────────────────────────────────────────────────────────
function TemplateSelector({
  selected,
  onSelect,
  onClear,
}: {
  selected: EvoTemplate | null;
  onSelect: (t: EvoTemplate) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (selected) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-indigo-50 border border-indigo-200">
        <span className="text-xl">{selected.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide">{selected.category}</p>
          <p className="text-sm font-semibold text-slate-800 truncate">{selected.name}</p>
        </div>
        <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide shrink-0">Template ativo</span>
        <button type="button" onClick={onClear} className="text-slate-400 hover:text-red-500 transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 transition-all text-left group"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 group-hover:border-indigo-200 flex items-center justify-center text-base shadow-sm">
            📋
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 group-hover:text-indigo-700">Usar um template de evolução</p>
            <p className="text-xs text-slate-400">Pré-preencha os campos automaticamente</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Escolha o tipo de sessão</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 p-3 max-h-72 overflow-y-auto">
            {EVOLUTION_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { onSelect(t); setOpen(false); }}
                className={`flex flex-col items-start gap-1.5 p-3 rounded-xl border-2 text-left hover:shadow-md transition-all ${t.color}`}
              >
                <span className="text-2xl">{t.icon}</span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{t.category}</p>
                  <p className="text-xs font-semibold leading-tight">{t.name}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Evolution Form Progress ──────────────────────────────────────────────────
function FormProgress({ form }: { form: EvoFormState }) {
  const fields = [form.description, form.patientResponse, form.clinicalNotes, form.techniquesUsed];
  const extras = [form.homeExercises, form.nextSessionGoals, form.painScale !== null ? "x" : ""];
  const allFields = [...fields, ...extras];
  const filled = allFields.filter(f => f !== null && f !== undefined && String(f).trim().length > 0).length;
  const total = allFields.length;
  const pct = Math.round((filled / total) * 100);
  const color = pct === 100 ? "bg-emerald-500" : pct >= 66 ? "bg-indigo-500" : pct >= 33 ? "bg-amber-400" : "bg-slate-300";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-slate-400 font-medium shrink-0">{filled}/{total} campos</span>
    </div>
  );
}

interface EvoFormProps {
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  title: string;
  form: EvoFormState;
  setForm: React.Dispatch<React.SetStateAction<EvoFormState>>;
  appointments: any[];
}

function EvoForm({ onSave, onCancel, saving, title, form, setForm, appointments }: EvoFormProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<EvoTemplate | null>(null);

  const applyTemplate = (t: EvoTemplate) => {
    setSelectedTemplate(t);
    setForm(prev => ({
      ...prev,
      description: t.description,
      patientResponse: t.patientResponse,
      clinicalNotes: t.clinicalNotes,
      complications: t.complications,
    }));
  };

  const clearTemplate = () => {
    setSelectedTemplate(null);
    setForm(prev => ({ ...prev, description: "", patientResponse: "", clinicalNotes: "", complications: "" }));
  };

  const appendChip = (field: keyof EvoFormState, chip: string) => {
    setForm(prev => {
      const current = (prev[field] as string) || "";
      const sep = current && !current.endsWith(" ") && !current.endsWith("\n") ? ". " : "";
      return { ...prev, [field]: current + sep + chip };
    });
  };

  const chips = selectedTemplate?.chips;

  return (
    <Card className="border-2 border-indigo-100 shadow-md">
      <CardHeader className="pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <FormProgress form={form} />
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-4">

        {/* Template Selector */}
        <TemplateSelector selected={selectedTemplate} onSelect={applyTemplate} onClear={clearTemplate} />

        {/* Consulta + Duração */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Consulta Vinculada <span className="text-slate-400 font-normal">(opcional)</span></Label>
            <Select
              value={String(form.appointmentId || "")}
              onValueChange={v => setForm({ ...form, appointmentId: v === "none" ? "" : v })}
            >
              <SelectTrigger className="bg-slate-50 border-slate-200">
                <SelectValue placeholder="Selecionar consulta..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma consulta vinculada</SelectItem>
                {appointments.map((appt: any) => (
                  <SelectItem key={appt.id} value={String(appt.id)}>
                    {formatDate(appt.date)} — {appt.startTime} — {appt.procedure?.name || "Consulta"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">Duração <span className="text-slate-400 font-normal">(min)</span></Label>
            <Input
              type="number" min="1" max="480"
              className="bg-slate-50 border-slate-200"
              value={form.sessionDuration === "" ? "" : String(form.sessionDuration)}
              onChange={e => setForm({ ...form, sessionDuration: e.target.value === "" ? "" : Number(e.target.value) })}
              placeholder="Ex: 60" />
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold text-slate-700">Descrição da Sessão</Label>
            {form.description.length > 0 && (
              <span className="text-[10px] text-slate-400">{form.description.length} caracteres</span>
            )}
          </div>
          <Textarea className="min-h-[90px] bg-slate-50 border-slate-200 resize-none text-sm"
            value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="O que foi realizado na sessão de hoje..." />
          {chips && chips.description.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {chips.description.map(c => (
                <QuickChip key={c} label={c} onAdd={() => appendChip("description", c)} />
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Patient Response */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">Resposta do Paciente</Label>
            <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 resize-none text-sm"
              value={form.patientResponse} onChange={e => setForm({ ...form, patientResponse: e.target.value })}
              placeholder="Como o paciente respondeu ao tratamento..." />
            {chips && chips.patientResponse.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {chips.patientResponse.map(c => (
                  <QuickChip key={c} label={c} onAdd={() => appendChip("patientResponse", c)} />
                ))}
              </div>
            )}
          </div>

          {/* Clinical Notes */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">Notas Clínicas</Label>
            <Textarea className="min-h-[80px] bg-slate-50 border-slate-200 resize-none text-sm"
              value={form.clinicalNotes} onChange={e => setForm({ ...form, clinicalNotes: e.target.value })}
              placeholder="Observações clínicas relevantes..." />
            {chips && chips.clinicalNotes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {chips.clinicalNotes.map(c => (
                  <QuickChip key={c} label={c} onAdd={() => appendChip("clinicalNotes", c)} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Techniques Used */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700">Técnicas e Recursos Utilizados</Label>
          <Textarea className="min-h-[65px] bg-slate-50 border-slate-200 resize-none text-sm"
            value={form.techniquesUsed} onChange={e => setForm({ ...form, techniquesUsed: e.target.value })}
            placeholder="Ex: TENS (80Hz, 10min), Ultrassom terapêutico (1MHz, modo pulsado), Cinesioterapia ativa..." />
          {chips && chips.description.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {chips.description.map(c => (
                <QuickChip key={c} label={c} onAdd={() => appendChip("techniquesUsed", c)} />
              ))}
            </div>
          )}
        </div>

        {/* Complications */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700">Intercorrências</Label>
          <Textarea className="min-h-[60px] bg-slate-50 border-slate-200 resize-none text-sm"
            value={form.complications} onChange={e => setForm({ ...form, complications: e.target.value })}
            placeholder="Alguma intercorrência ou evento adverso... (deixe em branco se não houve)" />
          {chips && chips.complications.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {chips.complications.map(c => (
                <QuickChip key={c} label={c} onAdd={() => appendChip("complications", c)} />
              ))}
            </div>
          )}
        </div>

        {/* Home exercises + Next session goals */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />Exercícios Domiciliares Prescritos
            </Label>
            <Textarea className="min-h-[75px] bg-slate-50 border-slate-200 resize-none text-sm"
              value={form.homeExercises} onChange={e => setForm({ ...form, homeExercises: e.target.value })}
              placeholder="Exercícios para o paciente realizar em casa, frequência e repetições..." />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-indigo-500" />Objetivos Próxima Sessão
            </Label>
            <Textarea className="min-h-[75px] bg-slate-50 border-slate-200 resize-none text-sm"
              value={form.nextSessionGoals} onChange={e => setForm({ ...form, nextSessionGoals: e.target.value })}
              placeholder="O que será trabalhado na próxima sessão? Progressões planejadas..." />
          </div>
        </div>

        {/* EVA Pain Scale */}
        <div className="space-y-3 bg-slate-50 rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-semibold text-slate-700">Escala de Dor (EVA)</Label>
              <p className="text-xs text-slate-400 mt-0.5">Escala Visual Analógica — 0 (sem dor) a 10 (dor máxima)</p>
            </div>
            {form.painScale !== null ? (
              <div className={`flex items-center justify-center w-12 h-12 rounded-full font-bold text-xl text-white shadow-md ${
                form.painScale >= 7 ? "bg-red-500" : form.painScale >= 4 ? "bg-orange-400" : "bg-green-500"
              }`}>
                {form.painScale}
              </div>
            ) : (
              <span className="text-xs text-slate-400 italic">não avaliada</span>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            {[null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
              <button
                key={v === null ? "none" : v}
                type="button"
                onClick={() => setForm({ ...form, painScale: v })}
                className={`w-9 h-9 rounded-lg text-sm font-semibold border-2 transition-all ${
                  form.painScale === v
                    ? v === null
                      ? "bg-slate-200 border-slate-400 text-slate-700"
                      : v >= 7
                        ? "bg-red-500 border-red-600 text-white"
                        : v >= 4
                          ? "bg-orange-400 border-orange-500 text-white"
                          : "bg-green-500 border-green-600 text-white"
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
                }`}
              >
                {v === null ? "—" : v}
              </button>
            ))}
          </div>

          {form.painScale !== null && (
            <p className="text-xs font-medium mt-1 flex items-center gap-1.5">
              <span className={`inline-block w-2 h-2 rounded-full ${
                form.painScale >= 7 ? "bg-red-500" : form.painScale >= 4 ? "bg-orange-400" : "bg-green-500"
              }`} />
              <span className={form.painScale >= 7 ? "text-red-600" : form.painScale >= 4 ? "text-orange-600" : "text-green-600"}>
                {form.painScale === 0 ? "Sem dor"
                  : form.painScale <= 3 ? "Dor leve"
                  : form.painScale <= 6 ? "Dor moderada"
                  : form.painScale <= 9 ? "Dor intensa"
                  : "Dor insuportável"}
              </span>
            </p>
          )}
        </div>

        <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
          <Button variant="outline" onClick={onCancel} className="rounded-xl">Cancelar</Button>
          <Button onClick={onSave} className="rounded-xl gap-2" disabled={saving || !form.description.trim()}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar Evolução
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function EvolutionsTab({ patientId, patient }: { patientId: number; patient?: PatientBasic }) {
  const { data: evolutions = [], isLoading } = useListEvolutions(patientId);
  const createMutation = useCreateEvolution();
  const updateMutation = useUpdateEvolution();
  const deleteMutation = useDeleteEvolution();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: clinic } = useQuery<ClinicInfo | null>({ queryKey: ["clinic-current"], queryFn: fetchClinicForPrint, staleTime: 60000 });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyEvoForm);

  const { data: appointments = [] } = useQuery<any[]>({
    queryKey: [`/api/patients/${patientId}/appointments`],
    queryFn: () => fetch(`/api/patients/${patientId}/appointments`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("fisiogest_token")}` }
    }).then(r => r.json()),
    enabled: !!patientId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/evolutions`] });

  const sortedApptsByDate = [...appointments].sort((a: any, b: any) =>
    new Date(a.date + "T" + (a.startTime || "00:00")).getTime() -
    new Date(b.date + "T" + (b.startTime || "00:00")).getTime()
  );

  const getSessionNumber = (ev: any, fallbackIdx: number): number => {
    if (ev.appointmentId) {
      const pos = sortedApptsByDate.findIndex((a: any) => a.id === ev.appointmentId);
      if (pos !== -1) return pos + 1;
    }
    return evolutions.length - fallbackIdx;
  };

  const buildPayload = () => ({
    ...form,
    appointmentId: form.appointmentId ? Number(form.appointmentId) : undefined,
    painScale: form.painScale ?? undefined,
    sessionDuration: form.sessionDuration !== "" ? Number(form.sessionDuration) : undefined,
    techniquesUsed: form.techniquesUsed || undefined,
    homeExercises: form.homeExercises || undefined,
    nextSessionGoals: form.nextSessionGoals || undefined,
  });

  const handleCreate = () => {
    createMutation.mutate({ patientId, data: buildPayload() }, {
      onSuccess: () => {
        toast({ title: "Evolução registrada", description: "Anotação de evolução salva com sucesso." });
        invalidate();
        setForm(emptyEvoForm);
        setShowForm(false);
      },
      onError: () => toast({ title: "Erro", description: "Não foi possível salvar.", variant: "destructive" }),
    });
  };

  const handleUpdate = (id: number) => {
    updateMutation.mutate({ patientId, evolutionId: id, data: buildPayload() }, {
      onSuccess: () => {
        toast({ title: "Evolução atualizada", description: "Alterações salvas com sucesso." });
        invalidate();
        setEditingId(null);
        setForm(emptyEvoForm);
      },
      onError: () => toast({ title: "Erro", description: "Não foi possível atualizar.", variant: "destructive" }),
    });
  };

  const handleDelete = (id: number) => {
    if (!window.confirm("Excluir esta evolução permanentemente?")) return;
    deleteMutation.mutate({ patientId, evolutionId: id }, {
      onSuccess: () => { toast({ title: "Evolução excluída" }); invalidate(); },
      onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }),
    });
  };

  const startEdit = (ev: any) => {
    setEditingId(ev.id);
    setShowForm(false);
    setForm({
      appointmentId: ev.appointmentId || "",
      description: ev.description || "",
      patientResponse: ev.patientResponse || "",
      clinicalNotes: ev.clinicalNotes || "",
      complications: ev.complications || "",
      painScale: ev.painScale ?? null,
      sessionDuration: ev.sessionDuration ?? "",
      techniquesUsed: ev.techniquesUsed || "",
      homeExercises: ev.homeExercises || "",
      nextSessionGoals: ev.nextSessionGoals || "",
    });
  };

  if (isLoading) return <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Evoluções de Sessão</h3>
          <p className="text-sm text-slate-500">{evolutions.length} evolução(ões) registrada(s)</p>
        </div>
        <div className="flex items-center gap-2">
          {patient && evolutions.length > 0 && (
            <Button variant="outline" size="sm" className="h-9 px-3 rounded-xl text-xs gap-1.5"
              onClick={() => printDocument(generateEvolutionsHTML(patient, evolutions, appointments, clinic), `Evoluções — ${patient.name}`)}>
              <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
            </Button>
          )}
          <Button onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(emptyEvoForm); }} className="h-10 px-5 rounded-xl">
            <Plus className="w-4 h-4 mr-2" /> Nova Evolução
          </Button>
        </div>
      </div>

      {showForm && !editingId && (
        <EvoForm
          title="Registrar Evolução de Sessão"
          onSave={handleCreate}
          onCancel={() => { setShowForm(false); setForm(emptyEvoForm); }}
          saving={createMutation.isPending}
          form={form}
          setForm={setForm}
          appointments={appointments}
        />
      )}

      {/* Pain Trend Mini-Chart */}
      {evolutions.length >= 2 && (() => {
        const withPain = [...evolutions].reverse().filter(e => e.painScale !== null && e.painScale !== undefined);
        if (withPain.length < 2) return null;
        const chartData = withPain.map((e, i) => ({
          sessao: `S${i + 1}`,
          dor: e.painScale,
          data: format(new Date(e.createdAt), "dd/MM", { locale: ptBR }),
        }));
        const first = chartData[0]?.dor ?? 0;
        const last = chartData[chartData.length - 1]?.dor ?? 0;
        const diff = last - first;
        const trend = diff < 0 ? "melhora" : diff > 0 ? "piora" : "estável";
        const trendColor = diff < 0 ? "text-emerald-600" : diff > 0 ? "text-red-500" : "text-slate-500";
        const trendBg = diff < 0 ? "bg-emerald-50 border-emerald-200" : diff > 0 ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200";
        return (
          <div className={`rounded-xl border p-4 ${trendBg}`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-bold text-slate-700">Tendência de Dor (EVA)</p>
                <p className="text-xs text-slate-500">{withPain.length} sessões com EVA registrado</p>
              </div>
              <div className={`text-sm font-bold ${trendColor} flex items-center gap-1.5`}>
                {diff < 0 ? <TrendingUp className="w-4 h-4 rotate-180" /> : diff > 0 ? <TrendingUp className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                {trend === "melhora" ? `↓${Math.abs(diff)} pts — Melhora` : trend === "piora" ? `↑${diff} pts — Piora` : "Estável"}
              </div>
            </div>
            <div className="flex items-end gap-1.5 h-16">
              {chartData.map((d, i) => {
                const pct = ((d.dor as number) / 10) * 100;
                const col = (d.dor as number) >= 7 ? "bg-red-400" : (d.dor as number) >= 4 ? "bg-orange-400" : "bg-emerald-400";
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] text-slate-500 font-semibold">{d.dor}</span>
                    <div className="w-full flex flex-col justify-end" style={{ height: "40px" }}>
                      <div className={`w-full rounded-t-sm ${col} transition-all`} style={{ height: `${Math.max(4, pct * 0.4)}px` }} />
                    </div>
                    <span className="text-[8px] text-slate-400">{d.sessao}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {evolutions.length === 0 && !showForm ? (
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="p-12 text-center text-slate-400">
            <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhuma evolução registrada</p>
            <p className="text-sm mt-1">Registre evoluções após cada sessão.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-slate-200" />
          <div className="space-y-4">
            {evolutions.map((ev, idx) => {
              const linkedAppt = appointments.find((a: any) => a.id === ev.appointmentId);
              const sessionNum = getSessionNumber(ev, idx);
              return (
                <div key={ev.id} className="relative flex gap-4 pl-10">
                  <div className="absolute left-0 w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shadow-md z-10">
                    {sessionNum}
                  </div>
                  {editingId === ev.id ? (
                    <div className="flex-1">
                      <EvoForm
                        title={`Editar Sessão #${sessionNum}`}
                        onSave={() => handleUpdate(ev.id)}
                        onCancel={() => { setEditingId(null); setForm(emptyEvoForm); }}
                        saving={updateMutation.isPending}
                        form={form}
                        setForm={setForm}
                        appointments={appointments}
                      />
                    </div>
                  ) : (
                    <Card className="flex-1 border border-slate-200 shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="text-xs text-slate-400 font-medium">{formatDateTime(ev.createdAt)}</p>
                            {linkedAppt && (
                              <p className="text-xs text-primary font-medium mt-0.5">
                                📅 Consulta: {formatDate(linkedAppt.date)} — {linkedAppt.startTime} — {linkedAppt.procedure?.name || "Consulta"}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0 ml-2">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-primary"
                              onClick={() => startEdit(ev)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                              onClick={() => handleDelete(ev.id)} disabled={deleteMutation.isPending}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mb-3 flex-wrap">
                          {ev.painScale !== null && ev.painScale !== undefined && (
                            <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100 flex-1">
                              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">EVA</span>
                              <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${ev.painScale >= 7 ? "bg-red-500" : ev.painScale >= 4 ? "bg-orange-400" : "bg-green-500"}`}
                                  style={{ width: `${(ev.painScale / 10) * 100}%` }}
                                />
                              </div>
                              <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm text-white shrink-0 ${
                                ev.painScale >= 7 ? "bg-red-500" : ev.painScale >= 4 ? "bg-orange-400" : "bg-green-500"
                              }`}>{ev.painScale}</div>
                              <span className={`text-xs font-medium shrink-0 ${ev.painScale >= 7 ? "text-red-600" : ev.painScale >= 4 ? "text-orange-500" : "text-green-600"}`}>
                                {ev.painScale === 0 ? "Sem dor" : ev.painScale <= 3 ? "Leve" : ev.painScale <= 6 ? "Moderada" : ev.painScale <= 9 ? "Intensa" : "Insuportável"}
                              </span>
                            </div>
                          )}
                          {(ev as any).sessionDuration && (
                            <div className="flex items-center gap-1.5 bg-blue-50 rounded-xl px-3 py-2 border border-blue-100">
                              <Clock className="w-3.5 h-3.5 text-blue-500" />
                              <span className="text-xs font-semibold text-blue-700">{(ev as any).sessionDuration} min</span>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {ev.description && <InfoBlock label="Descrição da Sessão" value={ev.description} className="md:col-span-2" />}
                          {(ev as any).techniquesUsed && <InfoBlock label="Técnicas Utilizadas" value={(ev as any).techniquesUsed} className="md:col-span-2" />}
                          {ev.patientResponse && <InfoBlock label="Resposta do Paciente" value={ev.patientResponse} />}
                          {ev.clinicalNotes && <InfoBlock label="Notas Clínicas" value={ev.clinicalNotes} />}
                          {(ev as any).homeExercises && <InfoBlock label="Exercícios Domiciliares" value={(ev as any).homeExercises} />}
                          {(ev as any).nextSessionGoals && <InfoBlock label="Próxima Sessão" value={(ev as any).nextSessionGoals} />}
                          {ev.complications && <InfoBlock label="Intercorrências" value={ev.complications} className="md:col-span-2" />}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Audit Log Section ───────────────────────────────────────────────────────────

