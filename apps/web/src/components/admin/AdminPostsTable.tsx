"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, RefreshCw, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/api";

export interface AdminPost {
  id: string;
  title: string;
  slug: string;
  clubName: string;
  clubId: string;
  authorName: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  lastError: string | null;
  lastSyncedAt: string | null;
  updatedAt: string;
}

type Busy = { id: string; action: "unpublish" | "resync" } | null;

export function AdminPostsTable({
  initialPosts,
  clubs,
  activeStatus,
  activeClubId,
}: {
  initialPosts: AdminPost[];
  clubs: { id: string; name: string }[];
  activeStatus?: string;
  activeClubId?: string;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const { toast } = useToast();
  const router = useRouter();

  function filterHref(next: { status?: string; clubId?: string }) {
    const params = new URLSearchParams();
    const status = next.status !== undefined ? next.status : activeStatus;
    const clubId = next.clubId !== undefined ? next.clubId : activeClubId;
    if (status) params.set("status", status);
    if (clubId) params.set("clubId", clubId);
    const qs = params.toString();
    return `/admin/posts${qs ? `?${qs}` : ""}`;
  }

  async function handleUnpublish(id: string) {
    setBusy({ id, action: "unpublish" });
    try {
      const res = await fetch(`${API_BASE}/admin/posts/${id}/unpublish`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed.");
      toast({ title: "Post archived." });
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't archive",
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleResync(id: string) {
    setBusy({ id, action: "resync" });
    try {
      const res = await fetch(`${API_BASE}/admin/posts/${id}/resync`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed.");
      toast({ title: "Re-synced from Notion." });
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Re-sync failed",
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-2">
        <FilterPill href={filterHref({ status: undefined })} active={!activeStatus} label="All statuses" />
        {(["DRAFT", "PUBLISHED", "ARCHIVED"] as const).map((s) => (
          <FilterPill key={s} href={filterHref({ status: s })} active={activeStatus === s} label={s} />
        ))}
        <span className="mx-1 self-center text-neutral-300">|</span>
        <FilterPill href={filterHref({ clubId: undefined })} active={!activeClubId} label="All clubs" />
        {clubs.map((c) => (
          <FilterPill key={c.id} href={filterHref({ clubId: c.id })} active={activeClubId === c.id} label={c.name} />
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Club</th>
              <th className="px-4 py-2 font-medium">Author</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Updated</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {initialPosts.map((post) => (
              <tr key={post.id}>
                <td className="max-w-xs truncate px-4 py-2.5 font-medium">
                  {post.status === "PUBLISHED" ? (
                    <Link href={`/${post.slug}`} target="_blank" className="hover:underline">
                      {post.title}
                    </Link>
                  ) : (
                    post.title
                  )}
                </td>
                <td className="px-4 py-2.5">{post.clubName}</td>
                <td className="px-4 py-2.5">{post.authorName}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={post.status} hasError={!!post.lastError} />
                  {post.lastError && <p className="mt-1 max-w-xs text-xs text-red-700">{post.lastError}</p>}
                </td>
                <td className="px-4 py-2.5 text-xs text-neutral-500">
                  {new Date(post.updatedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleResync(post.id)}
                      disabled={busy?.id === post.id}
                    >
                      {busy?.id === post.id && busy.action === "resync" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    {post.status !== "ARCHIVED" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnpublish(post.id)}
                        disabled={busy?.id === post.id}
                      >
                        {busy?.id === post.id && busy.action === "unpublish" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Archive className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {initialPosts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  No posts match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FilterPill({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        active ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
      }`}
    >
      {label}
    </Link>
  );
}
