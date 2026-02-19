export type AnalysisStatus = "pending" | "running" | "succeeded" | "failed";

export function getAnalysisStatusLabel(status: AnalysisStatus): string {
  if (status === "pending") return "待分析";
  if (status === "running") return "分析中";
  if (status === "succeeded") return "成功";
  return "失败";
}

export function getAnalysisStatusClassName(status: AnalysisStatus): string {
  if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "running") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "succeeded") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-red-200 bg-red-50 text-red-700";
}
