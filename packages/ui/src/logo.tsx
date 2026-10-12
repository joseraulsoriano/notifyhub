import { cn } from './lib/cn';

/** Símbolo de NotifyHub: una ruta principal sólida y una de respaldo punteada que llegan al mismo destino. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn('size-8 text-foreground', className)}
      role="img"
      aria-label="NotifyHub"
    >
      <path
        d="M5 13 H17 C26 13 26 24 32 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M5 35 H17 C26 35 26 24 32 24"
        fill="none"
        stroke="#FF5A1F"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeDasharray="0.1 7.2"
      />
      <circle cx="37" cy="24" r="6.5" fill="currentColor" />
      <circle cx="5" cy="13" r="2.4" fill="currentColor" />
      <circle cx="5" cy="35" r="2.4" fill="#FF5A1F" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className="size-7" />
      <span className="font-heading text-lg font-extrabold leading-none tracking-tighter">notifyhub</span>
    </span>
  );
}
