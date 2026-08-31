"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/api";

/**
 * Superadmin sign-in — design doc §7. Two steps against the API's own
 * two-step handshake: password first, then TOTP (or a backup code if
 * the device is lost). Generic failure copy throughout — never which
 * half of a check was wrong — because that's what the API itself
 * returns; this form never invents its own wording for a failure.
 */

type Step =
  | { name: "credentials" }
  | { name: "second-factor"; pendingToken: string; mode: "totp" | "backup" };

type Submitting = boolean;

async function postJson(path: string, body: unknown) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { res, data };
}

export function AdminLoginForm() {
  const [step, setStep] = useState<Step>({ name: "credentials" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState<Submitting>(false);
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setLockedMessage(null);
    try {
      const { res, data } = await postJson("/auth/admin/login", { email, password });
      if (res.status === 423) {
        setLockedMessage(String(data.error ?? "Account temporarily locked. Try again later."));
        return;
      }
      if (!res.ok || typeof data.pendingToken !== "string") {
        toast({ variant: "destructive", title: String(data.error ?? "Sign-in failed.") });
        return;
      }
      setStep({ name: "second-factor", pendingToken: data.pendingToken, mode: "totp" });
      setCode("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSecondFactor(e: React.FormEvent, pendingToken: string, mode: "totp" | "backup") {
    e.preventDefault();
    await submitCode(pendingToken, mode, code);
  }

  async function submitCode(pendingToken: string, mode: "totp" | "backup", codeValue: string) {
    setSubmitting(true);
    setLockedMessage(null);
    try {
      const path = mode === "totp" ? "/auth/admin/verify-totp" : "/auth/admin/verify-backup-code";
      const { res, data } = await postJson(path, { pendingToken, code: codeValue });

      if (res.status === 423) {
        setLockedMessage(String(data.error ?? "Account temporarily locked. Try again later."));
        return;
      }
      if (!res.ok) {
        // A pendingToken that's expired or otherwise no longer valid —
        // the only recovery is signing in again from the top.
        if (String(data.error).toLowerCase().includes("session expired")) {
          setStep({ name: "credentials" });
          setPassword("");
          toast({ title: String(data.error) });
          return;
        }
        toast({ variant: "destructive", title: String(data.error ?? "That code didn't work.") });
        setCode("");
        return;
      }

      router.push("/admin");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  function handleCodeChange(pendingToken: string, mode: "totp" | "backup", value: string) {
    const cleaned = mode === "totp" ? value.replace(/\D/g, "").slice(0, 6) : value.trim();
    setCode(cleaned);
    // Auto-submit once a full 6-digit TOTP code is entered — one less
    // click for the common case; backup codes stay explicit-submit
    // since their length isn't fixed enough to detect completion.
    if (mode === "totp" && cleaned.length === 6 && !submitting) {
      void submitCode(pendingToken, mode, cleaned);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <AnimatePresence mode="wait" initial={false}>
        {step.name === "credentials" ? (
          <motion.form
            key="credentials"
            onSubmit={handleCredentials}
            initial={reduceMotion ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, x: 8 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {lockedMessage && <LockedBanner message={lockedMessage} />}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Continue
            </Button>
          </motion.form>
        ) : (
          <motion.form
            key="second-factor"
            onSubmit={(e) => handleSecondFactor(e, step.pendingToken, step.mode)}
            initial={reduceMotion ? false : { opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, x: -8 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="code">{step.mode === "totp" ? "Authenticator code" : "Backup code"}</Label>
              <Input
                id="code"
                inputMode={step.mode === "totp" ? "numeric" : "text"}
                autoComplete="one-time-code"
                autoFocus
                placeholder={step.mode === "totp" ? "123456" : "a1b2c3d4e5"}
                value={code}
                onChange={(e) => handleCodeChange(step.pendingToken, step.mode, e.target.value)}
              />
            </div>
            {lockedMessage && <LockedBanner message={lockedMessage} />}
            <Button type="submit" className="w-full" disabled={submitting || code.length === 0}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Verify
            </Button>
            <button
              type="button"
              className="block w-full text-center text-xs text-neutral-500 underline-offset-2 hover:underline"
              onClick={() => {
                setStep({ ...step, mode: step.mode === "totp" ? "backup" : "totp" });
                setCode("");
                setLockedMessage(null);
              }}
            >
              {step.mode === "totp" ? "Use a backup code instead" : "Use your authenticator instead"}
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

function LockedBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
