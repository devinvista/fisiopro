export default function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="FisioGest Pro"
    >
      <rect width="36" height="36" rx="10" fill="currentColor" className="text-primary" />
      <path
        d="M18 8v20M8 18h20"
        stroke="white"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle cx="18" cy="18" r="6" stroke="white" strokeWidth="2" fill="none" opacity="0.6" />
    </svg>
  );
}
