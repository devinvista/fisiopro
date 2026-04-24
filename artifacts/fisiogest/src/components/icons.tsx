import * as React from "react";

export type IconProps = React.SVGAttributes<SVGElement> & {
  size?: number | string;
  strokeWidth?: number;
};

type RawIconProps = IconProps & {
  label: string;
  children: React.ReactNode;
};

const Svg = React.forwardRef<SVGSVGElement, RawIconProps>(function Svg(
  { size = 24, strokeWidth = 1.8, label, children, className, ...rest },
  ref,
) {
  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label}
      className={className}
      {...rest}
    >
      {children}
    </svg>
  );
});

const dot = (cx: number, cy: number, r = 0.9) => (
  <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />
);

export const PatientIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Paciente" {...p}>
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
    <path d="M16.5 5.5l1.2 1.2 2.3-2.3" />
  </Svg>
));
PatientIcon.displayName = "PatientIcon";

export const CalendarIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Agenda" {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M3.5 10h17" />
    <path d="M8 3v4M16 3v4" />
    {dot(12, 14.5, 0.9)}
  </Svg>
));
CalendarIcon.displayName = "CalendarIcon";

export const AnamnesisIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Anamnese" {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4v2h6V4" />
    <path d="M9 11h6M9 14.5h6M9 18h4" />
  </Svg>
));
AnamnesisIcon.displayName = "AnamnesisIcon";

export const EvolutionIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Evolução" {...p}>
    <path d="M3 17l4-5 3 3 4-7 3 5 4-3" />
    {dot(7, 12)}
    {dot(14, 8)}
    {dot(17, 13)}
  </Svg>
));
EvolutionIcon.displayName = "EvolutionIcon";

export const TreatmentPlanIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Plano Terapêutico" {...p}>
    <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
    <path d="M16 4v3h3" />
    <path d="M8 12l2.5 2.5L16 9.5" />
  </Svg>
));
TreatmentPlanIcon.displayName = "TreatmentPlanIcon";

export const ExerciseIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Exercício" {...p}>
    <path d="M6 9v6M18 9v6" />
    <rect x="3" y="10" width="3" height="4" rx="0.6" />
    <rect x="18" y="10" width="3" height="4" rx="0.6" />
    <path d="M6 12h12" />
  </Svg>
));
ExerciseIcon.displayName = "ExerciseIcon";

export const SessionIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Sessão" {...p}>
    <circle cx="12" cy="13" r="7.5" />
    <path d="M12 13V8.5" />
    <path d="M12 13l3 2" />
    <path d="M10 3h4" />
  </Svg>
));
SessionIcon.displayName = "SessionIcon";

export const CertificateIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Atestado" {...p}>
    <rect x="4" y="4" width="16" height="13" rx="1.5" />
    <path d="M7 9h10M7 12h7" />
    <circle cx="16.5" cy="17.5" r="2.5" />
    <path d="M15.5 19.5l-1 2.5 2-1 2 1-1-2.5" />
  </Svg>
));
CertificateIcon.displayName = "CertificateIcon";

export const ReceiptIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Recibo" {...p}>
    <path d="M5 3v18l2-1.5L9 21l2-1.5L13 21l2-1.5L17 21l2-1.5V3z" />
    <path d="M8 8h8M8 11.5h8M8 15h5" />
  </Svg>
));
ReceiptIcon.displayName = "ReceiptIcon";

export const SignatureIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Assinatura Digital" {...p}>
    <path d="M3 18c2 0 3-3 5-3s3 2 5 0 2-5 4-5 2 3 4 3" />
    <path d="M3 21h18" />
  </Svg>
));
SignatureIcon.displayName = "SignatureIcon";

export const WalletIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Financeiro" {...p}>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18" />
    {dot(16.5, 14.5, 1.3)}
  </Svg>
));
WalletIcon.displayName = "WalletIcon";

export const FolderIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Prontuário" {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M8 13.5h8M8 16.5h5" />
  </Svg>
));
FolderIcon.displayName = "FolderIcon";

export const ProceduresIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Procedimentos" {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 9h10M7 13h10M7 17h6" />
    {dot(6, 9, 0.6)}
    {dot(6, 13, 0.6)}
    {dot(6, 17, 0.6)}
  </Svg>
));
ProceduresIcon.displayName = "ProceduresIcon";

export const ReportsIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Relatórios" {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
    <path d="M8 16V12M12 16V8M16 16v-6" />
  </Svg>
));
ReportsIcon.displayName = "ReportsIcon";

export const ClinicIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Clínica" {...p}>
    <path d="M3 21V11l9-6 9 6v10" />
    <path d="M9 21v-6h6v6" />
    <path d="M11 9h2M12 8v2" />
  </Svg>
));
ClinicIcon.displayName = "ClinicIcon";

export const TeamIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Equipe" {...p}>
    <circle cx="9" cy="9" r="2.6" />
    <circle cx="17" cy="10" r="2.2" />
    <path d="M3 19c0-2.8 2.5-5 6-5s6 2.2 6 5" />
    <path d="M14.5 14.5c1-.4 2-.5 2.5-.5 2.8 0 4 2 4 4" />
  </Svg>
));
TeamIcon.displayName = "TeamIcon";

export const BellIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Notificação" {...p}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </Svg>
));
BellIcon.displayName = "BellIcon";

export const QueueIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Fila de Espera" {...p}>
    <circle cx="6" cy="8" r="2" />
    <circle cx="12" cy="8" r="2" />
    <circle cx="18" cy="8" r="2" />
    <path d="M3 16c0-2 1.5-3 3-3s3 1 3 3" />
    <path d="M9 16c0-2 1.5-3 3-3s3 1 3 3" />
    <path d="M15 16c0-2 1.5-3 3-3s3 1 3 3" />
  </Svg>
));
QueueIcon.displayName = "QueueIcon";

export const StethoscopeIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Avaliação" {...p}>
    <path d="M5 4v6a4 4 0 0 0 8 0V4" />
    {dot(9, 14.5, 0.6)}
    <path d="M9 14.5v3a3 3 0 0 0 3 3 4 4 0 0 0 4-4v-2" />
    <circle cx="16" cy="11.5" r="2.2" />
  </Svg>
));
StethoscopeIcon.displayName = "StethoscopeIcon";

export const PilatesIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Pilates" {...p}>
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v4" />
    <path d="M6 13l6-2 6 2" />
    <path d="M9 21l3-7 3 7" />
    <path d="M9 21l-1.5 0" />
    <path d="M15 21l1.5 0" />
  </Svg>
));
PilatesIcon.displayName = "PilatesIcon";

export const RehabIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Reabilitação" {...p}>
    <circle cx="8" cy="5" r="2" />
    <path d="M8 7v5" />
    <path d="M5 16l3-4h4l4 5" />
    <path d="M8 12l-2 9" />
    <path d="M12 12l3 4 4-1" />
    {dot(20, 14, 0.8)}
  </Svg>
));
RehabIcon.displayName = "RehabIcon";

export const AestheticsIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Estética" {...p}>
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    <path d="M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
));
AestheticsIcon.displayName = "AestheticsIcon";

export const SettingsIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Configurações" {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
));
SettingsIcon.displayName = "SettingsIcon";

export const ShieldIcon = React.forwardRef<SVGSVGElement, IconProps>((p, ref) => (
  <Svg ref={ref} label="Superadmin" {...p}>
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </Svg>
));
ShieldIcon.displayName = "ShieldIcon";

export const Icons = {
  Patient: PatientIcon,
  Calendar: CalendarIcon,
  Anamnesis: AnamnesisIcon,
  Evolution: EvolutionIcon,
  TreatmentPlan: TreatmentPlanIcon,
  Exercise: ExerciseIcon,
  Session: SessionIcon,
  Certificate: CertificateIcon,
  Receipt: ReceiptIcon,
  Signature: SignatureIcon,
  Wallet: WalletIcon,
  Folder: FolderIcon,
  Procedures: ProceduresIcon,
  Reports: ReportsIcon,
  Clinic: ClinicIcon,
  Team: TeamIcon,
  Bell: BellIcon,
  Queue: QueueIcon,
  Stethoscope: StethoscopeIcon,
  Pilates: PilatesIcon,
  Rehab: RehabIcon,
  Aesthetics: AestheticsIcon,
  Settings: SettingsIcon,
  Shield: ShieldIcon,
};
