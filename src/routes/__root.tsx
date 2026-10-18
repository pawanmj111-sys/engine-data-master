import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { LayoutDashboard, LineChart, MonitorPlay, FileText, FileSearch } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { LICENSE_STORAGE_KEY, verifyLicenseText, type LicenseState } from "../lib/license";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "EngineLab — Test Data Comparison & Cyclic Reports" },
      { name: "description", content: "Compare engine test datasets and generate cyclic emission summary reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/compare", label: "Excel Comparison", icon: LineChart },
  { to: "/present", label: "Presentation Mode", icon: MonitorPlay },
  { to: "/cyclic", label: "PDF Cyclic Summary", icon: FileSearch },
  { to: "/report", label: "Report Preview", icon: FileText },
] as const;

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const bare = path.startsWith("/present");
  const [licenseLoading, setLicenseLoading] = useState(true);
  const [licenseState, setLicenseState] = useState<LicenseState>({
    status: "missing",
    message: "A license file is required to unlock EngineLab.",
  });
  const [licenseText, setLicenseText] = useState("");
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [licenseScreenOpen, setLicenseScreenOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const readSavedLicense = async (initial = false) => {
      try {
        const saved = window.localStorage.getItem(LICENSE_STORAGE_KEY) ?? "";
        if (initial && alive) setLicenseText(saved);
        const state = await verifyLicenseText(saved);
        if (alive) setLicenseState(state);
      } catch {
        if (alive) setLicenseState({ status: "invalid", message: "Browser storage is unavailable. Please enable local storage and try again." });
      } finally {
        if (initial && alive) setLicenseLoading(false);
      }
    };
    void readSavedLicense(true);
    const timer = window.setInterval(() => { void readSavedLicense(); }, 60_000);
    const onStorage = () => { void readSavedLicense(); };
    window.addEventListener("storage", onStorage);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const activateLicense = async () => {
    setLicenseBusy(true);
    try {
      const state = await verifyLicenseText(licenseText);
      setLicenseState(state);
      if (state.status === "valid") {
        window.localStorage.setItem(LICENSE_STORAGE_KEY, licenseText.trim());
        setLicenseScreenOpen(false);
      }
    } catch {
      setLicenseState({ status: "invalid", message: "The license could not be saved. Please try again." });
    } finally {
      setLicenseBusy(false);
    }
  };

  if (licenseLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Checking EngineLab license…</div>;
  }

  if (licenseState.status !== "valid" || licenseScreenOpen) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
        <div className="w-full max-w-xl rounded-xl border bg-card p-6 shadow-sm md:p-8">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">EngineLab · License activation</div>
          <h1 className="text-2xl font-bold tracking-tight">Activate your license</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            EngineLab requires a valid signed license file. Your license is checked locally; uploaded data and PDF reports remain on this device.
          </p>
          {licenseState.status === "expired" && licenseState.license && (
            <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              License for <strong>{licenseState.license.customer}</strong> expired on {new Date(licenseState.license.expiresAt).toLocaleDateString()}.
            </p>
          )}
          <label className="mt-5 block text-sm font-medium" htmlFor="license-file">Select license JSON</label>
          <input
            id="license-file"
            type="file"
            accept=".json,application/json"
            className="mt-2 block w-full rounded-md border bg-background p-2 text-sm"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) setLicenseText(await file.text());
              event.target.value = "";
            }}
          />
          <label className="mt-4 block text-sm font-medium" htmlFor="license-json">Or paste license file content</label>
          <textarea
            id="license-json"
            value={licenseText}
            onChange={(event) => setLicenseText(event.target.value)}
            rows={5}
            spellCheck={false}
            placeholder='Paste the signed license JSON here'
            className="mt-2 w-full rounded-md border bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
          />
          <p role="status" className={`mt-3 text-sm ${licenseState.status === "invalid" || licenseState.status === "expired" ? "text-destructive" : "text-muted-foreground"}`}>
            {licenseState.status === "valid"
              ? `Current license: ${licenseState.license.customer} · expires ${new Date(licenseState.license.expiresAt).toLocaleDateString()}.`
              : licenseState.message}
          </p>
          <button
            type="button"
            disabled={licenseBusy || !licenseText.trim()}
            onClick={() => { void activateLicense(); }}
            className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {licenseBusy ? "Verifying…" : "Activate license"}
          </button>
          {licenseScreenOpen && licenseState.status === "valid" && (
            <button
              type="button"
              onClick={() => {
                setLicenseText(window.localStorage.getItem(LICENSE_STORAGE_KEY) ?? "");
                setLicenseScreenOpen(false);
              }}
              className="mt-4 ml-2 inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-semibold"
            >
              Back to EngineLab
            </button>
          )}
          <p className="mt-5 text-xs text-muted-foreground">Contact your EngineLab license administrator for a new or renewed license file.</p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-right" richColors />
      {bare ? (
        <Outlet />
      ) : (
        <div className="flex min-h-screen">
          <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
            <div className="border-b border-sidebar-border px-4 py-4">
              <div className="text-base font-bold tracking-tight">EngineLab</div>
              <div className="text-[11px] text-sidebar-foreground/60">Test data & emission reports</div>
              <div className="mt-2 text-[10px] text-sidebar-foreground/60">
                Licensed to {licenseState.license.customer}
                <br />
                Expires {new Date(licenseState.license.expiresAt).toLocaleDateString()}
                <button
                  type="button"
                  onClick={() => {
                    setLicenseText(window.localStorage.getItem(LICENSE_STORAGE_KEY) ?? "");
                    setLicenseScreenOpen(true);
                  }}
                  className="mt-1 block rounded border border-sidebar-border px-2 py-1 text-[10px] text-sidebar-foreground/80 hover:bg-sidebar-accent"
                >
                  Manage / renew license
                </button>
              </div>
            </div>
            <nav className="flex flex-col gap-0.5 p-2">
              {NAV.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  activeOptions={{ exact: n.to === "/" }}
                  className="flex items-center gap-2.5 rounded px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  activeProps={{ className: "bg-sidebar-accent !text-sidebar-accent-foreground font-medium" }}
                >
                  <n.icon className="h-4 w-4" />
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto p-4 text-[11px] text-sidebar-foreground/50">Files are processed locally in your browser and are not uploaded.</div>
          </aside>
          <div className="min-w-0 flex-1">
            <nav className="flex gap-1 overflow-x-auto border-b bg-sidebar p-2 md:hidden">
              <button
                type="button"
                onClick={() => {
                  setLicenseText(window.localStorage.getItem(LICENSE_STORAGE_KEY) ?? "");
                  setLicenseScreenOpen(true);
                }}
                className="whitespace-nowrap rounded border border-sidebar-border px-2 py-1 text-xs text-sidebar-foreground"
              >
                License
              </button>
              {NAV.map((n) => (
                <Link key={n.to} to={n.to} className="whitespace-nowrap rounded px-2 py-1 text-xs text-sidebar-foreground" activeProps={{ className: "bg-sidebar-accent" }}>
                  {n.label}
                </Link>
              ))}
            </nav>
            <main className="mx-auto max-w-[1500px] p-4 md:p-6">
              <Outlet />
            </main>
          </div>
        </div>
      )}
    </QueryClientProvider>
  );
}
