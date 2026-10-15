import { createFileRoute, Link } from "@tanstack/react-router";
import { LineChart, FileSearch, MonitorPlay } from "lucide-react";
import { useApp } from "@/lib/store";
import { PageHeader } from "@/components/kit";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — EngineLab" },
      { name: "description", content: "Engine test data comparison and PDF cyclic emission summary reporting." },
      { property: "og:title", content: "Dashboard — EngineLab" },
      { property: "og:description", content: "Engine test data comparison and PDF cyclic emission summary reporting." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { datasets, graphs, cyclicRecords, cycle, cyclicCycle } = useApp();
  return (
    <div>
      <PageHeader title="Dashboard" desc="Two independent modules for calibration and emission test engineers." />
      <div className="grid gap-5 lg:grid-cols-2">
        <ModuleCard
          icon={<LineChart className="h-6 w-6" />}
          title="Module A — Excel Data Comparison"
          items={[
            "Cycles: FTP, NRTC, NRSC, RMC",
            "Triggered (mode-wise) data and 1 Hz time-series data",
            "Interactive overlay, difference and statistics",
            "Preview / Presentation Mode with live file replacement",
            "Report export to PDF and Word, graphs to PNG, data to Excel/CSV",
          ]}
          status={`Current cycle: ${cycle} · ${datasets.length} dataset(s) · ${graphs.length} graph(s)`}
          actions={
            <>
              <Link to="/compare" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Open comparison</Link>
              <Link to="/present" className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium"><MonitorPlay className="h-4 w-4" />Presentation Mode</Link>
            </>
          }
        />
        <ModuleCard
          icon={<FileSearch className="h-6 w-6" />}
          title="Module B — PDF Cyclic Summary"
          items={[
            "Cycles: NRTC, NRSC, RMC",
            "Upload emission report PDFs (text-based)",
            "Extract CO, NOx, HC, PM, PN, limits and remarks",
            "Review and correct every value before reporting",
            "Editable front page, export to PDF and Word",
          ]}
          status={`Current cycle: ${cyclicCycle} · ${cyclicRecords.length} report(s) extracted`}
          actions={<Link to="/cyclic" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Open cyclic summary</Link>}
        />
      </div>
    </div>
  );
}

function ModuleCard({ icon, title, items, status, actions }: { icon: React.ReactNode; title: string; items: string[]; status: string; actions: React.ReactNode }) {
  return (
    <section className="flex flex-col rounded-md border bg-card p-6">
      <div className="flex items-center gap-3 text-primary">
        {icon}
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>
      <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
        {items.map((i) => <li key={i}>{i}</li>)}
      </ul>
      <div className="mt-4 rounded bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">{status}</div>
      <div className="mt-5 flex flex-wrap gap-2">{actions}</div>
    </section>
  );
}
