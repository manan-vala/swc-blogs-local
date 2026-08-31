"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/api";

export interface WhitelistEntry {
  id: string;
  email: string;
  clubId: string;
  clubName: string;
  addedByName: string | null;
  addedAt: string;
  revokedAt: string | null;
}

export function WhitelistPanel({
  initialEntries,
  clubs,
}: {
  initialEntries: WhitelistEntry[];
  clubs: { id: string; name: string }[];
}) {
  const [emails, setEmails] = useState("");
  const [clubId, setClubId] = useState(clubs[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  // One line per email — the design doc's "bulk add for a new academic
  // year" note. The API only takes one entry per call, so this just
  // loops it; a partial failure (one bad address) still reports which.
  async function handleAdd() {
    const list = Array.from(
      new Set(
        emails
          .split(/[\n,]/)
          .map((e) => e.trim())
          .filter(Boolean)
      )
    );
    if (list.length === 0) {
      toast({ variant: "destructive", title: "Enter at least one email." });
      return;
    }
    if (!clubId) {
      toast({ variant: "destructive", title: "Pick a club first." });
      return;
    }

    setSubmitting(true);
    const failures: string[] = [];
    for (const email of list) {
      try {
        const res = await fetch(`${API_BASE}/admin/whitelist`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, clubId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          failures.push(`${email}: ${data.error ?? "failed"}`);
        }
      } catch {
        failures.push(`${email}: network error`);
      }
    }
    setSubmitting(false);

    if (failures.length > 0) {
      toast({
        variant: "destructive",
        title: `${list.length - failures.length}/${list.length} added`,
        description: failures.join("; "),
      });
    } else {
      toast({ title: `Added ${list.length} ${list.length === 1 ? "entry" : "entries"}.` });
      setEmails("");
    }
    router.refresh();
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      const res = await fetch(`${API_BASE}/admin/whitelist/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Revoke failed.");
      }
      toast({ title: "Entry revoked." });
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't revoke",
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <>
      <div className="mt-8 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Add secretaries</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
          <div>
            <Label htmlFor="emails">Emails</Label>
            <textarea
              id="emails"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="secy.robotics@iitg.ac.in&#10;secy.dramatics@iitg.ac.in"
              rows={3}
              className="mt-1 flex w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
            />
            <p className="mt-1 text-xs text-neutral-500">One per line, or comma-separated.</p>
          </div>
          <div>
            <Label htmlFor="club">Club</Label>
            <Select value={clubId} onValueChange={setClubId}>
              <SelectTrigger id="club">
                <SelectValue placeholder="Choose a club" />
              </SelectTrigger>
              <SelectContent>
                {clubs.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} disabled={submitting || clubs.length === 0}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Add
          </Button>
        </div>
        {clubs.length === 0 && (
          <p className="mt-2 text-xs text-amber-700">Create a club first — see the Clubs screen.</p>
        )}
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Club</th>
              <th className="px-4 py-2 font-medium">Added</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {initialEntries.map((entry) => (
              <tr key={entry.id} className={entry.revokedAt ? "text-neutral-400" : ""}>
                <td className="px-4 py-2.5">{entry.email}</td>
                <td className="px-4 py-2.5">{entry.clubName}</td>
                <td className="px-4 py-2.5 text-xs">
                  {new Date(entry.addedAt).toLocaleDateString()}
                  {entry.addedByName && <span className="text-neutral-400"> · {entry.addedByName}</span>}
                </td>
                <td className="px-4 py-2.5">
                  {entry.revokedAt ? (
                    <span className="text-xs">Revoked {new Date(entry.revokedAt).toLocaleDateString()}</span>
                  ) : (
                    <span className="text-xs font-medium text-green-700">Active</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {!entry.revokedAt && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRevoke(entry.id)}
                      disabled={revokingId === entry.id}
                    >
                      {revokingId === entry.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {initialEntries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                  No entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
