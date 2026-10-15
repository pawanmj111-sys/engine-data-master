import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, PageBreak,
  PageNumber, PageOrientation, Packer, Paragraph, ShadingType, Table, TableCell, TableRow,
  TextRun, WidthType,
} from "docx";

export type Block =
  | { type: "heading"; text: string }
  | { type: "text"; text: string; small?: boolean }
  | { type: "image"; src: string; caption?: string; aspect: number }
  | { type: "table"; head: string[]; body: string[][]; small?: boolean }
  | { type: "pagebreak" };

export interface ReportDoc {
  title: string;
  subtitle: string;
  logo: string;
  fields: [string, string][];
  footer: string;
  blocks: Block[];
}

const PRIMARY: [number, number, number] = [31, 78, 140];

function imgFormat(src: string) {
  return /^data:image\/jpe?g/i.test(src) ? "JPEG" : "PNG";
}

async function imgSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
    i.onerror = () => res({ w: 1, h: 1 });
    i.src = src;
  });
}

export async function exportPdf(doc: ReportDoc, filename: string) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = 297, H = 210, M = 15, CW = W - 2 * M;
  // Front page
  pdf.setDrawColor(...PRIMARY);
  pdf.setLineWidth(0.8);
  pdf.rect(8, 8, W - 16, H - 16);
  pdf.setLineWidth(0.2);
  pdf.rect(10, 10, W - 20, H - 20);
  if (doc.logo) {
    const s = await imgSize(doc.logo);
    const h = 18, w = Math.min(60, (s.w / s.h) * h);
    pdf.addImage(doc.logo, imgFormat(doc.logo), W - M - w - 3, M + 2, w, h);
  }
  pdf.setTextColor(...PRIMARY);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.text(doc.title, W / 2, 55, { align: "center", maxWidth: CW - 20 });
  if (doc.subtitle) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(13);
    pdf.setTextColor(80, 90, 105);
    pdf.text(doc.subtitle, W / 2, 66, { align: "center" });
  }
  autoTable(pdf, {
    startY: 80,
    margin: { left: 60, right: 60 },
    body: doc.fields.map(([k, v]) => [k, v || ""]),
    theme: "grid",
    styles: { fontSize: 12, cellPadding: 3.2, lineColor: [200, 208, 220], textColor: [30, 41, 59] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 60, fillColor: [238, 243, 250] } },
  });
  // Body
  let y = M;
  const newPage = () => { pdf.addPage(); y = M + 8; };
  newPage();
  for (const b of doc.blocks) {
    if (b.type === "pagebreak") { newPage(); continue; }
    if (b.type === "heading") {
      if (y > H - 50) newPage();
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(14); pdf.setTextColor(...PRIMARY);
      pdf.text(b.text, M, y + 5);
      pdf.setDrawColor(...PRIMARY); pdf.line(M, y + 7, W - M, y + 7);
      y += 12;
    } else if (b.type === "text") {
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(b.small ? 8.5 : 10); pdf.setTextColor(50, 60, 75);
      const lines = pdf.splitTextToSize(b.text, CW) as string[];
      for (const ln of lines) {
        if (y > H - 18) newPage();
        pdf.text(ln, M, y + 4); y += b.small ? 4 : 5;
      }
      y += 2;
    } else if (b.type === "image") {
      let w = CW, h = w / b.aspect;
      const maxH = H - 2 * M - 22;
      if (h > maxH) { h = maxH; w = h * b.aspect; }
      if (y + h > H - 18) newPage();
      pdf.addImage(b.src, imgFormat(b.src), M + (CW - w) / 2, y, w, h);
      y += h + 3;
      if (b.caption) {
        pdf.setFontSize(9); pdf.setTextColor(90, 100, 115);
        pdf.text(b.caption, W / 2, y + 2, { align: "center" }); y += 7;
      }
    } else if (b.type === "table") {
      if (y > H - 40) newPage();
      autoTable(pdf, {
        startY: y,
        margin: { left: M, right: M, top: M + 8, bottom: 18 },
        head: [b.head],
        body: b.body,
        theme: "grid",
        showHead: "everyPage",
        rowPageBreak: "avoid",
        styles: { fontSize: b.small ? 7.5 : 9, cellPadding: 1.8, overflow: "linebreak", lineColor: [200, 208, 220], textColor: [30, 41, 59] },
        headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: "bold", halign: "center", valign: "middle" },
        alternateRowStyles: { fillColor: [246, 248, 251] },
      });
      y = (pdf as any).lastAutoTable.finalY + 6;
    }
  }
  const total = pdf.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(110, 120, 135);
    if (p > 1) {
      pdf.text(doc.title, M, 10);
      pdf.setDrawColor(210, 215, 225); pdf.line(M, 11.5, W - M, 11.5);
    }
    pdf.text(doc.footer, M, H - 7);
    pdf.text(`Page ${p} of ${total}`, W - M, H - 7, { align: "right" });
  }
  pdf.save(filename);
}

function dataUrlBytes(src: string) {
  const b64 = src.split(",")[1] ?? "";
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

const CONTENT_W = 16838 - 2 * 1000; // landscape A4 DXA content width
const border = { style: BorderStyle.SINGLE, size: 4, color: "C8D0DC" };
const borders = { top: border, bottom: border, left: border, right: border };

function docxTable(head: string[] | null, body: string[][], size: number, widths?: number[]) {
  const n = (head ?? body[0] ?? [""]).length;
  const cw = widths ?? Array.from({ length: n }, () => Math.floor(CONTENT_W / n));
  const total = cw.reduce((a, b) => a + b, 0);
  const cell = (t: string, i: number, isHead: boolean) =>
    new TableCell({
      borders,
      width: { size: cw[i], type: WidthType.DXA },
      shading: isHead ? { fill: "1F4E8C", type: ShadingType.CLEAR, color: "auto" } : undefined,
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
      children: [new Paragraph({ children: [new TextRun({ text: t ?? "", bold: isHead, color: isHead ? "FFFFFF" : "1E293B", size })] })],
    });
  const rows: TableRow[] = [];
  if (head) rows.push(new TableRow({ tableHeader: true, cantSplit: true, children: head.map((h, i) => cell(h, i, true)) }));
  body.forEach((r) => rows.push(new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false)) })));
  return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: cw, rows });
}

export async function exportDocx(doc: ReportDoc, filename: string) {
  const front: (Paragraph | Table)[] = [];
  if (doc.logo) {
    const s = await imgSize(doc.logo);
    front.push(new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new ImageRun({
        type: imgFormat(doc.logo) === "JPEG" ? "jpg" : "png",
        data: dataUrlBytes(doc.logo),
        transformation: { width: Math.round((s.w / s.h) * 60), height: 60 },
        altText: { title: "Logo", description: "Company logo", name: "logo" },
      })],
    }));
  }
  front.push(new Paragraph({ spacing: { before: 1400, after: 200 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: doc.title, bold: true, size: 48, color: "1F4E8C" })] }));
  if (doc.subtitle) front.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: doc.subtitle, size: 26, color: "505A69" })] }));
  front.push(docxTable(null, doc.fields.map(([k, v]) => [k, v || ""]), 24, [3200, 6400]));
  front.push(new Paragraph({ children: [new PageBreak()] }));

  const body: (Paragraph | Table)[] = [];
  for (const b of doc.blocks) {
    if (b.type === "pagebreak") body.push(new Paragraph({ children: [new PageBreak()] }));
    else if (b.type === "heading") body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, spacing: { before: 240, after: 120 }, children: [new TextRun({ text: b.text, bold: true, size: 28, color: "1F4E8C" })] }));
    else if (b.type === "text") b.text.split("\n").forEach((t) => body.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: t, size: b.small ? 16 : 20 })] })));
    else if (b.type === "image") {
      const w = 900, h = Math.round(w / b.aspect);
      body.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: !!b.caption, children: [new ImageRun({ type: "png", data: dataUrlBytes(b.src), transformation: { width: w, height: Math.min(h, 520) }, altText: { title: b.caption ?? "Graph", description: b.caption ?? "Graph", name: "graph" } })] }));
      if (b.caption) body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: b.caption, italics: true, size: 18, color: "5A6473" })] }));
    } else if (b.type === "table") {
      body.push(docxTable(b.head, b.body, b.small ? 15 : 18));
      body.push(new Paragraph({ children: [] }));
    }
  }
  const page = {
    size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
    margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
  };
  const footer = new Footer({
    children: [new Paragraph({
      children: [
        new TextRun({ text: `${doc.footer}    |    Page `, size: 16, color: "6E7887" }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "6E7887" }),
        new TextRun({ text: " of ", size: 16, color: "6E7887" }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "6E7887" }),
      ],
    })],
  });
  const d = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
    sections: [
      { properties: { page }, footers: { default: footer }, children: front },
      {
        properties: { page },
        headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: doc.title, size: 16, color: "6E7887" })] })] }) },
        footers: { default: footer },
        children: body,
      },
    ],
  });
  const blob = await Packer.toBlob(d);
  downloadBlob(blob, filename);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function downloadDataUrl(src: string, filename: string) {
  const a = document.createElement("a");
  a.href = src; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}
