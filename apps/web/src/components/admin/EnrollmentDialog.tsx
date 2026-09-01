"use client";

import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/api";

type Step =
  | { name: "form" }
  | { name: "starting" }
  | { name: "qr"; enrollToken: string; qrDataUrl: string; secret: string }
  | { name: "success"; email: string; backupCodes: string[] | null };

interface EnrollmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "create" shows the email/name/password form first; "reenroll"
   *  starts the QR step immediately against an existing account. */
  mode: "create" | "reenroll";
  target?: { id: string; email: string };
}

/**
 * §7's mandatory live-code check, over HTTP instead of the CLI's
 * prompt loop: nothing is written to User until the code entered here
 * verifies against the secret this dialog just generated. Shared by
 * "New superadmin" and "Re-enrol TOTP" — see admin.routes.ts's
 * /superadmins and /superadmins/:id/reenroll-totp, both of which just
 * start the same enrolToken handshake this dialog drives to completion.
 */
export function EnrollmentDialog({ open, onOpenChange, mode, target }: EnrollmentDialogProps) {
  const [step, setStep] = useState<Step>(mode === "create" ? { name: "form" } : { name: "starting" });
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  // Reenroll has no form step of its own — kick off /reenroll-totp the
  // moment the dialog opens.
  useEffect(() => {
    if (mode === "reenroll" && open && step.name === "starting") {
      void startReenroll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, open]);

  async function startCreate() {
    setStep({ name: "starting" });
    try {
      const res = await fetch(`${API_BASE}/admin/superadmins`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, name, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't start enrolment.");
      setStep({ name: "qr", enrollToken: data.enrollToken, qrDataUrl: data.qrDataUrl, secret: data.secret });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't start enrolment",
        description: err instanceof Error ? err.message : "Try again.",
      });
      setStep({ name: "form" });
    }
  }

  async function startReenroll() {
    try {
      const res = await fetch(`${API_BASE}/admin/superadmins/${target!.id}/reenroll-totp`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't start re-enrolment.");
      setStep({ name: "qr", enrollToken: data.enrollToken, qrDataUrl: data.qrDataUrl, secret: data.secret });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't start re-enrolment",
        description: err instanceof Error ? err.message : "Try again.",
      });
      onOpenChange(false);
    }
  }

  async function verify() {
    if (step.name !== "qr") return;
    setVerifying(true);
    try {
      const res = await fetch(`${API_BASE}/admin/superadmins/enroll/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enrollToken: step.enrollToken, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That code didn't verify.");
      setStep({ name: "success", email: data.email, backupCodes: data.backupCodes ?? null });
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Code didn't verify",
        description: err instanceof Error ? err.message : "Check the time on your device and try the next one.",
      });
      setCode("");
    } finally {
      setVerifying(false);
    }
  }

  function handleClose(next: boolean) {
    if (next) return;
    onOpenChange(false);
    // Reset for next time this mounts fresh (it's keyed by caller anyway).
    setEmail("");
    setName("");
    setPassword("");
    setCode("");
    setCopied(false);
    setStep(mode === "create" ? { name: "form" } : { name: "starting" });
  }

  async function copyBackupCodes(codes: string[]) {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      // Clipboard access can be denied — the codes are still on screen to copy by hand.
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        {step.name === "form" && (
          <>
            <DialogHeader>
              <DialogTitle>New superadmin</DialogTitle>
              <DialogDescription>
                Password and TOTP are set up together — the account can&apos;t exist password-only.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label htmlFor="new-admin-email">Email</Label>
                <Input id="new-admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="new-admin-name">Name</Label>
                <Input id="new-admin-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="new-admin-password">Password</Label>
                <Input
                  id="new-admin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="mt-1 text-xs text-neutral-500">At least 12 characters.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={startCreate} disabled={!email || !name || password.length < 12}>
                Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {step.name === "starting" && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-neutral-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Generating a TOTP secret…
          </div>
        )}

        {step.name === "qr" && (
          <>
            <DialogHeader>
              <DialogTitle>Scan and confirm</DialogTitle>
              <DialogDescription>
                Scan with Google Authenticator, Authy, or similar, then enter the current code. Nothing is
                saved until this verifies.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable asset */}
              <img src={step.qrDataUrl} alt="TOTP enrolment QR code" className="h-44 w-44 rounded-md border border-neutral-200" />
              <details className="w-full text-xs text-neutral-500">
                <summary className="cursor-pointer">Can&apos;t scan? Enter manually</summary>
                <code className="mt-1 block break-all rounded bg-neutral-100 p-2 font-mono">{step.secret}</code>
              </details>
              <div className="w-full">
                <Label htmlFor="totp-code">6-digit code</Label>
                <Input
                  id="totp-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && code.length === 6 && !verifying && verify()}
                  placeholder="000000"
                  className="text-center text-lg tracking-[0.3em]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={verifying}>
                Cancel
              </Button>
              <Button onClick={verify} disabled={code.length !== 6 || verifying}>
                {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
                Verify
              </Button>
            </DialogFooter>
          </>
        )}

        {step.name === "success" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-600" />
                {mode === "create" ? "Superadmin created" : "TOTP re-enrolled"}
              </DialogTitle>
              <DialogDescription>{step.email}</DialogDescription>
            </DialogHeader>
            {step.backupCodes && (
              <div className="py-2">
                <p className="text-sm font-medium text-amber-800">
                  Backup codes — shown once, right now. Send these to {step.email} out of band.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-3 font-mono text-sm">
                  {step.backupCodes.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => copyBackupCodes(step.backupCodes!)}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy all"}
                </Button>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
