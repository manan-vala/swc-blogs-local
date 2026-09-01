"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/api";

/**
 * §7: "no public password reset by design." This is the web equivalent
 * of the CLI's reset path — the value typed here has to be relayed to
 * the target out of band by whoever's running this dialog, same as the
 * CLI's operator would relay it themselves.
 */
export function ResetPasswordDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: { id: string; email: string };
}) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/admin/superadmins/${target.id}/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Reset failed.");

      toast({ title: `Password reset for ${target.email}.`, description: "Relay the new password to them yourself." });
      setPassword("");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't reset password",
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>{target.email}</DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor="reset-password-value">New password</Label>
          <Input
            id="reset-password-value"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-1 text-xs text-neutral-500">
            At least 12 characters. You&apos;ll need to send this to them yourself — there&apos;s no email flow.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || password.length < 12}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Reset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
