import { BrandLink } from "./brand";
import { ThemeToggle } from "./theme-toggle";

/**
 * Layout for sign-in, sign-up, password and status pages. Phones: a navy band with the brand above the
 * card. Tablets and desktops: a navy brand panel beside the form.
 */
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
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="relative overflow-hidden bg-navy-700 text-snow dark:bg-navy-900 md:flex md:w-[42%] md:max-w-xl md:flex-col md:justify-between md:p-10 lg:p-14">
        <div className="flex items-center justify-between gap-3 px-4 py-4 md:p-0">
          <BrandLink />
          <ThemeToggle className="text-snow hover:bg-snow/10 md:hidden" />
        </div>
        <div className="hidden md:block">
          <p className="text-3xl font-bold leading-tight lg:text-4xl">
            Raise it. Track it. <span className="text-gold-400">Get it resolved.</span>
          </p>
          <p className="mt-4 max-w-sm text-navy-100">
            A private channel between students and the lecturers who can help, with every step on record.
          </p>
        </div>
        <p className="hidden text-xs text-navy-200 md:block">Private and confidential.</p>
        {/* Yellow accent stripe */}
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-gold-500 md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-1.5" />
      </aside>

      <main id="main" className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6 md:py-12">
        <div className="mb-4 hidden w-full max-w-md justify-end md:flex">
          <ThemeToggle className="text-slate-600 hover:bg-slate-100" />
        </div>
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-navy-900/5 sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {description ? <p className="mt-1.5 text-sm text-slate-600">{description}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <div className="mt-5 w-full max-w-md text-center text-sm text-slate-600">{footer}</div> : null}
      </main>
    </div>
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
