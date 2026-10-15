import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Panel({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-md border bg-card", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold tracking-wide text-foreground">{title}</h2>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-xs font-medium text-muted-foreground", className)}>
      {label}
      {children}
    </label>
  );
}

const ctl = "h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

export function Sel(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(ctl, props.className)} />;
}
export function Inp(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(ctl, props.className)} />;
}

export function Btn({ variant = "default", className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "danger" | "ghost" }) {
  const v = {
    default: "border bg-background hover:bg-muted text-foreground",
    primary: "bg-primary text-primary-foreground hover:bg-primary/90 border border-primary",
    danger: "border border-destructive/40 text-destructive hover:bg-destructive/10 bg-background",
    ghost: "hover:bg-muted text-foreground",
  }[variant];
  return <button {...p} className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium disabled:opacity-50", v, className)} />;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; hint?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-w-24 rounded-md border px-4 py-2 text-left text-sm",
            value === o.value ? "border-primary bg-accent font-semibold text-accent-foreground ring-1 ring-primary" : "bg-background hover:bg-muted",
          )}
        >
          {o.label}
          {o.hint && <div className="text-xs font-normal text-muted-foreground">{o.hint}</div>}
        </button>
      ))}
    </div>
  );
}

export function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1 rounded-md border border-warning-foreground/30 bg-warning px-3 py-2 text-xs text-warning-foreground">
      {items.map((w, i) => (
        <li key={i}>⚠ {w}</li>
      ))}
    </ul>
  );
}

export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b pb-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {desc && <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

export function readAsDataUrl(file: File) {
  return new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
