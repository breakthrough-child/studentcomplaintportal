// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import Link from "next/link";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 text-sm font-semibold text-brand-700 hover:underline">
        ← Student Complaint Portal
      </Link>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="mt-1.5 text-sm text-slate-600">{description}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
      {footer ? <div className="mt-4 text-center text-sm text-slate-600">{footer}</div> : null}
    </main>
  );
}

export function Notice({ tone, children }: { tone: "error" | "success" | "info"; children: React.ReactNode }) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-brand-100 bg-brand-50 text-brand-800",
  } as const;
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`mb-4 rounded-md border px-3 py-2 text-sm ${styles[tone]}`}>
      {children}
    </p>
  );
}
