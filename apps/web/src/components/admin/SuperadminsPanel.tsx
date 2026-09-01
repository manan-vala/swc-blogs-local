"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, KeyRound, ShieldCheck, TicketX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/api";
import { EnrollmentDialog } from "./EnrollmentDialog";
import { ResetPasswordDialog } from "./ResetPasswordDialog";
import { ReissueBackupCodesDialog } from "./ReissueBackupCodesDialog";

export interface AdminSuperadmin {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  isSelf: boolean;
  lastLoginAt: string | null;
  totpEnabledAt: string | null;
  createdAt: string;
  unusedBackupCodes: number;
}

type Dialog =
  | { name: "create" }
  | { name: "reenroll"; target: AdminSuperadmin }
  | { name: "reset-password"; target: AdminSuperadmin }
  | { name: "reissue-codes"; target: AdminSuperadmin }
  | null;

export function SuperadminsPanel({ initialAdmins }: { initialAdmins: AdminSuperadmin[] }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  async function handleToggleActive(admin: AdminSuperadmin) {
    setTogglingId(admin.id);
    try {
      const res = await fetch(`${API_BASE}/admin/superadmins/${admin.id}/${admin.isActive ? "disable" : "enable"}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed.");
      toast({ title: admin.isActive ? `${admin.name} disabled.` : `${admin.name} re-enabled.` });
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't change account status",
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <>
      <div className="mt-6 flex justify-end">
        <Button onClick={() => setDialog({ name: "create" })}>
          <Plus className="h-4 w-4" /> New superadmin
        </Button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Backup codes left</th>
              <th className="px-4 py-2 font-medium">Last login</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {initialAdmins.map((admin) => (
              <tr key={admin.id}>
                <td className="px-4 py-2.5">
                  <div className="font-medium">
                    {admin.name}
                    {admin.isSelf && <span className="ml-1.5 text-xs text-neutral-400">(you)</span>}
                  </div>
                  <div className="text-xs text-neutral-500">{admin.email}</div>
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={admin.isActive ? "success" : "neutral"}>
                    {admin.isActive ? "Active" : "Disabled"}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">
                  <span className={admin.unusedBackupCodes === 0 ? "text-red-700" : ""}>
                    {admin.unusedBackupCodes}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-neutral-500">
                  {admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString() : "Never"}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      title="Re-enrol TOTP"
                      onClick={() => setDialog({ name: "reenroll", target: admin })}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      title="Reset password"
                      onClick={() => setDialog({ name: "reset-password", target: admin })}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      title="Reissue backup codes"
                      onClick={() => setDialog({ name: "reissue-codes", target: admin })}
                    >
                      <TicketX className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleActive(admin)}
                      disabled={admin.isSelf || togglingId === admin.id}
                      title={admin.isSelf ? "You can't disable your own account" : undefined}
                    >
                      {togglingId === admin.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : admin.isActive ? (
                        "Disable"
                      ) : (
                        "Enable"
                      )}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {initialAdmins.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                  No superadmins found — that shouldn&apos;t be possible while you&apos;re signed in as one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <EnrollmentDialog
        open={dialog?.name === "create"}
        onOpenChange={(open) => !open && setDialog(null)}
        mode="create"
      />
      {dialog?.name === "reenroll" && (
        <EnrollmentDialog
          key={dialog.target.id}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          mode="reenroll"
          target={dialog.target}
        />
      )}
      {dialog?.name === "reset-password" && (
        <ResetPasswordDialog
          key={dialog.target.id}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          target={dialog.target}
        />
      )}
      {dialog?.name === "reissue-codes" && (
        <ReissueBackupCodesDialog
          key={dialog.target.id}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          target={dialog.target}
        />
      )}
    </>
  );
}
