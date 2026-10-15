import { Btn, Field, Inp, readAsDataUrl } from "./kit";
import { uid, type FrontPage, type FtpFront } from "@/lib/store";

export function FtpFrontEditor({ value, onChange }: { value: FtpFront; onChange: (v: FtpFront) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Date">
        <Inp type="date" value={value.date} onChange={(e) => onChange({ ...value, date: e.target.value })} />
      </Field>
      <Field label="Engine Model">
        <Inp value={value.engineModel} onChange={(e) => onChange({ ...value, engineModel: e.target.value })} />
      </Field>
      <Field label="FTP File Name">
        <Inp value={value.ftpFileName} onChange={(e) => onChange({ ...value, ftpFileName: e.target.value })} />
      </Field>
    </div>
  );
}

export function FrontEditor({ value, onChange }: { value: FrontPage; onChange: (v: FrontPage) => void }) {
  const setField = (id: string, p: Partial<FrontPage["fields"][number]>) =>
    onChange({ ...value, fields: value.fields.map((f) => (f.id === id ? { ...f, ...p } : f)) });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Report title" className="min-w-72 flex-1">
          <Inp value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} />
        </Field>
        <Field label="Company logo">
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="text-xs"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) onChange({ ...value, logo: await readAsDataUrl(f) });
              e.target.value = "";
            }}
          />
        </Field>
        {value.logo && (
          <div className="flex items-center gap-2">
            <img src={value.logo} alt="Logo" className="h-8 border bg-background" />
            <Btn variant="ghost" onClick={() => onChange({ ...value, logo: "" })}>Remove logo</Btn>
          </div>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="w-56 pb-1 font-medium">Field label</th>
            <th className="pb-1 font-medium">Value</th>
            <th className="w-36 pb-1 font-medium">Show</th>
          </tr>
        </thead>
        <tbody>
          {value.fields.map((f) => (
            <tr key={f.id} className={f.hidden ? "opacity-50" : ""}>
              <td className="py-1 pr-2">
                <Inp className="w-full" value={f.label} disabled={f.required} onChange={(e) => setField(f.id, { label: e.target.value })} />
              </td>
              <td className="py-1 pr-2">
                <Inp className="w-full" type={f.required ? "date" : "text"} value={f.value} onChange={(e) => setField(f.id, { value: e.target.value })} />
              </td>
              <td className="py-1">
                {f.required ? (
                  <span className="text-xs text-muted-foreground">Always shown</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={!f.hidden} onChange={(e) => setField(f.id, { hidden: !e.target.checked })} />
                    {f.custom && (
                      <button className="text-xs text-destructive" onClick={() => onChange({ ...value, fields: value.fields.filter((x) => x.id !== f.id) })}>
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Btn onClick={() => onChange({ ...value, fields: [...value.fields, { id: uid(), label: "New field", value: "", hidden: false, custom: true }] })}>
        + Add field
      </Btn>
    </div>
  );
}
