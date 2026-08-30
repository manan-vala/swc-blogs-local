"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ExternalLink, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { PublishDialog } from "./PublishDialog";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/api";

export interface DashboardPost {
  id: string;
  title: string;
  notionPageId: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  accentColor: string | null;
  pattern: string | null;
  lastError: string | null;
  lastSyncedAt: string | null; // serialized from the server component
}

export function PostCard({ post }: { post: DashboardPost }) {
  const [previewLoading, setPreviewLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const reduceMotion = useReducedMotion();
  const notionUrl = `https://notion.so/${post.notionPageId.replace(/-/g, "")}`;

  async function handlePreview() {
    setPreviewLoading(true);
    try {
      const res = await fetch(`${API_BASE}/posts/${post.id}/preview`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed.");
      window.open(data.previewUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      // §9's "Error reporting to authors": short, specific, actionable —
      // never a raw stack trace surfaced to a club secretary.
      toast({
        variant: "destructive",
        title: "Preview failed",
        description: err instanceof Error ? err.message : "Try again, or contact SWC if it persists.",
      });
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <motion.div
      whileHover={reduceMotion ? undefined : { y: -2 }}
      transition={{ duration: 0.15 }}
      className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{post.title}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusBadge status={post.status} hasError={!!post.lastError} />
            {post.lastSyncedAt && (
              <span className="text-xs text-neutral-500">
                synced {new Date(post.lastSyncedAt).toLocaleString()}
              </span>
            )}
          </div>
          {/* Brief inline reason, not a log panel — §9 decision. Full
              SyncLog history stays in the admin view. */}
          {post.lastError && <p className="mt-2 text-sm text-red-700">{post.lastError}</p>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={notionUrl} target="_blank" rel="noopener noreferrer">
            Continue in Notion <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
        <Button variant="outline" size="sm" onClick={handlePreview} disabled={previewLoading}>
          {previewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          Preview
        </Button>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          {post.status === "DRAFT" ? "Publish" : "Update"}
        </Button>
      </div>

      <PublishDialog post={post} open={dialogOpen} onOpenChange={setDialogOpen} />
    </motion.div>
  );
}
