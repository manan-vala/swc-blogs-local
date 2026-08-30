import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  hasError: boolean;
}

/**
 * A failed sync takes priority over the status label itself — an author
 * needs to see "sync failed" before "draft," since that's the thing
 * blocking them. Pairs with the inline Post.lastError message (§9:
 * brief inline reason, not a log panel).
 */
export function StatusBadge({ status, hasError }: StatusBadgeProps) {
  if (hasError) return <Badge variant="critical">Sync failed</Badge>;
  if (status === "PUBLISHED") return <Badge variant="success">Published</Badge>;
  if (status === "ARCHIVED") return <Badge variant="neutral">Archived</Badge>;
  return <Badge variant="warning">Draft</Badge>;
}
