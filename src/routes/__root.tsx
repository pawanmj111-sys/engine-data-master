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
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";
import { LayoutDashboard, LineChart, MonitorPlay, FileText, FileSearch } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

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
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
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
