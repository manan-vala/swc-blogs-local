"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/api";

/** Confirm, then generate — the old set is voided the instant this
 *  succeeds (§7), so this asks before doing something irreversible. */
export function ReissueBackupCodesDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: { id: string; email: string };
}) {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/admin/superadmins/${target.id}/reissue-backup-codes`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Reissue failed.");
      setCodes(data.backupCodes);
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't reissue backup codes",
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function copyCodes() {
    if (!codes) return;
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      // Clipboard access can be denied — the codes stay on screen either way.
    }
  }

  function handleClose(next: boolean) {
    if (next) return onOpenChange(true);
    onOpenChange(false);
    setCodes(null);
    setCopied(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        {!codes ? (
          <>
            <DialogHeader>
              <DialogTitle>Reissue backup codes</DialogTitle>
              <DialogDescription>{target.email}</DialogDescription>
            </DialogHeader>
            <p className="py-2 text-sm text-neutral-600">
              Their current backup codes stop working the moment this runs. Only do this if they&apos;ve
              actually lost them.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleConfirm} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Reissue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New backup codes</DialogTitle>
              <DialogDescription>
                Shown once, right now — send these to {target.email} out of band.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-3 font-mono text-sm">
              {codes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <Button variant="outline" size="sm" className="mt-2 w-fit" onClick={copyCodes}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy all"}
            </Button>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
