"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/api";

export function SignOutButton() {
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setSubmitting(true);
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
    } finally {
      router.push("/admin/login");
      router.refresh();
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={submitting}>
      {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      Sign out
    </Button>
  );
}
