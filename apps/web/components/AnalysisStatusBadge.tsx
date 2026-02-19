import { AnalysisStatus, getAnalysisStatusClassName, getAnalysisStatusLabel } from "../lib/analysis-status";
import { cn } from "../lib/utils";
import { Badge, BadgeProps } from "./ui/badge";

type AnalysisStatusBadgeProps = BadgeProps & {
  status: AnalysisStatus;
};

export default function AnalysisStatusBadge({ status, className, ...props }: AnalysisStatusBadgeProps) {
  return (
    <Badge className={cn(getAnalysisStatusClassName(status), className)} {...props}>
      {getAnalysisStatusLabel(status)}
    </Badge>
  );
}
