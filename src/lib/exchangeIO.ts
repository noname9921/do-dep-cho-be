import type { Cell, Grid } from "./exchange";

// Browser-only glue: read a spreadsheet file into a grid, write grids to .xlsx, trigger a download.
// Needs the "xlsx" package (SheetJS); it is loaded on demand so the admin page stays light.

export async function readGrid(file: File): Promise<Grid> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("File không có trang tính nào.");
  // raw: true keeps text cells as text (long product ids stay intact) and numbers as numbers
  return XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
}

export type Sheet = { name: string; grid: Grid; widths?: number[] };

export async function downloadXlsx(filename: string, sheets: Sheet[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.grid);
    if (s.widths) ws["!cols"] = s.widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  download(filename, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}

export function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const downloadText = (filename: string, text: string, mime: string) =>
  download(filename, new Blob([text], { type: `${mime};charset=utf-8` }));