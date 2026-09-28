import { type ReactNode } from "react";
import { clsx } from "clsx";
import {
  Baby, Briefcase, Car, Coffee, CreditCard as CreditCardIcon, Droplet, Fuel, Gift, GraduationCap, HeartPulse, Home,
  Package, PiggyBank, Plane, Repeat as RepeatIcon, Shield, Shirt, ShoppingCart, Smartphone, Smile, Sparkles, Tag, Tv,
  Utensils, Wifi, Zap, type LucideIcon,
} from "lucide-react";

export function money(v: number | string | null | undefined, currency = "USD") {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("rounded-[20px] border border-border bg-card p-4", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  type = "button",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md";
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";
  const sizes = size === "sm" ? "h-9 px-3 text-xs" : "h-11 px-4 text-sm";
  const variants: Record<string, string> = {
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    ghost: "text-foreground hover:bg-muted",
    outline: "border border-border bg-card hover:bg-muted",
    danger: "bg-destructive text-destructive-foreground hover:opacity-90",
  };
  return (
    <button
      type={type}
      className={clsx(base, sizes, variants[variant], className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

const inputBase =
  "w-full min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(inputBase, props.className)} />;
}

export function Select({ children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={clsx(inputBase, "pr-8", rest.className)}>
      {children}
    </select>
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx(inputBase, "min-h-[70px]", props.className)} />;
}

export function Table({
  head,
  children,
}: {
  head: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-[20px] border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={clsx("px-3 py-2 font-medium", className)}>{children}</th>;
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={clsx("px-3 py-2 align-middle", className)}>{children}</td>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[20px] border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function OverrideConfirm({
  count,
  months,
  busy,
  onOverwrite,
  onKeep,
  onCancel,
}: {
  count: number;
  months: string[];
  busy?: boolean;
  onOverwrite: () => void;
  onKeep: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="alertdialog" className="rounded-xl border border-primary/40 bg-card p-4 shadow-sm">
      <div className="text-sm font-medium">
        {count} upcoming month{count === 1 ? " has" : "s have"} a manually changed amount for this item
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{months.join(", ")}</div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="outline" size="sm" onClick={onKeep} disabled={busy}>Keep my changes</Button>
        <Button size="sm" onClick={onOverwrite} disabled={busy}>Overwrite them</Button>
      </div>
    </div>
  );
}

// ---------------- Category icons ----------------
// A curated set so the picker stays short; names are stored in categories.icon.
export const CATEGORY_ICONS = {
  "home": Home,
  "zap": Zap,
  "droplet": Droplet,
  "wifi": Wifi,
  "smartphone": Smartphone,
  "car": Car,
  "fuel": Fuel,
  "shield": Shield,
  "shopping-cart": ShoppingCart,
  "utensils": Utensils,
  "coffee": Coffee,
  "sparkles": Sparkles,
  "smile": Smile,
  "shirt": Shirt,
  "heart-pulse": HeartPulse,
  "graduation-cap": GraduationCap,
  "baby": Baby,
  "gift": Gift,
  "plane": Plane,
  "tv": Tv,
  "repeat": RepeatIcon,
  "credit-card": CreditCardIcon,
  "piggy-bank": PiggyBank,
  "briefcase": Briefcase,
  "package": Package,
  "tag": Tag,
} as const satisfies Record<string, LucideIcon>;
export type CategoryIconName = keyof typeof CATEGORY_ICONS;

/** Rounded tile with the category's icon on a light tint of its color; falls back to a color dot. */
export function CategoryIcon({ icon, color, size = 32 }: { icon: string | null | undefined; color: string; size?: number }) {
  const Icon = icon ? CATEGORY_ICONS[icon as CategoryIconName] : undefined;
  if (!Icon) {
    return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size / 2.5, height: size / 2.5, background: color }} />;
  }
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-lg"
      style={{ width: size, height: size, background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
    >
      <Icon size={Math.round(size * 0.55)} strokeWidth={2} />
    </span>
  );
}

/** Bottom sheet on phones, centered dialog on larger screens. */
export function Sheet({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1d2a33]/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          "max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-background px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-xl sm:rounded-[28px]",
          wide ? "sm:max-w-2xl" : "sm:max-w-md",
        )}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#d0c8bb] sm:hidden" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-2xl">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-lg">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Two or three way toggle, e.g. Calendar | List. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-1 rounded-full bg-secondary p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx("h-9 rounded-full px-3.5 text-[13px]", value === o.value ? "bg-card font-bold shadow-sm" : "font-semibold text-muted-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
