"use client";

import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClubFormDialog } from "./ClubFormDialog";

export interface AdminClub {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  description: string | null;
  accentColor: string | null;
  pattern: string | null;
}

export function ClubsPanel({ initialClubs }: { initialClubs: AdminClub[] }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminClub | null>(null);

  return (
    <>
      <div className="mt-6 flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New club
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {initialClubs.map((club) => (
          <div key={club.id} className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{club.name}</h3>
                <p className="text-xs text-neutral-500">/club/{club.slug}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditing(club)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
            {club.description && <p className="mt-2 text-sm text-neutral-600">{club.description}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {club.category && <Badge variant="neutral">{club.category}</Badge>}
              {club.accentColor && <Badge variant="neutral">{club.accentColor}</Badge>}
              {club.pattern && club.pattern !== "none" && <Badge variant="neutral">{club.pattern}</Badge>}
            </div>
          </div>
        ))}
        {initialClubs.length === 0 && (
          <p className="col-span-2 py-6 text-center text-sm text-neutral-500">No clubs yet.</p>
        )}
      </div>

      <ClubFormDialog open={creating} onOpenChange={setCreating} />
      {/* Keyed by club id: ClubFormDialog seeds its form state from
          `club` only once, on mount — without this key, switching which
          club you're editing would leave the previous club's values in
          the form since the component instance never remounts. */}
      {editing && (
        <ClubFormDialog
          key={editing.id}
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
          club={editing}
        />
      )}
    </>
  );
}
