"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ACCENT_TOKENS, ACCENT_SWATCHES, PATTERN_TOKENS, type AccentToken, type PatternToken } from "@swc-blogs/shared";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/api";
import type { AdminClub } from "./ClubsPanel";

interface ClubFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  club?: AdminClub; // present => edit, absent => create
}

/** Create-or-edit form for a club — design doc §7's Clubs screen. Slug
 *  is only ever entered on create; editing omits it entirely, matching
 *  updateClubSchema on the API side. */
export function ClubFormDialog({ open, onOpenChange, club }: ClubFormDialogProps) {
  const isEdit = !!club;
  const [name, setName] = useState(club?.name ?? "");
  const [slug, setSlug] = useState(club?.slug ?? "");
  const [category, setCategory] = useState(club?.category ?? "");
  const [description, setDescription] = useState(club?.description ?? "");
  const [accent, setAccent] = useState<AccentToken | "">((club?.accentColor as AccentToken) ?? "");
  const [pattern, setPattern] = useState<PatternToken | "">((club?.pattern as PatternToken) ?? "");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const body = isEdit
        ? { name, category: category || undefined, description: description || undefined, accentColor: accent || undefined, pattern: pattern || undefined }
        : { name, slug, category: category || undefined, description: description || undefined, accentColor: accent || undefined, pattern: pattern || undefined };

      const res = await fetch(`${API_BASE}/admin/clubs${club ? `/${club.id}` : ""}`, {
        method: isEdit ? "PATCH" : "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed.");

      toast({ title: isEdit ? "Club updated." : "Club created." });
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: isEdit ? "Couldn't update club" : "Couldn't create club",
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
          <DialogTitle>{club ? `Edit ${club.name}` : "New club"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Slug can't be changed here." : "Slug can't be changed after this."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="club-name">Name</Label>
            <Input id="club-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {!isEdit && (
            <div>
              <Label htmlFor="club-slug">Slug</Label>
              <Input
                id="club-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="robotics-club"
              />
              <p className="mt-1 text-xs text-neutral-500">Lowercase letters, numbers, hyphens only.</p>
            </div>
          )}

          <div>
            <Label htmlFor="club-category">Category</Label>
            <Input
              id="club-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="technical, cultural, board, hostel…"
            />
          </div>

          <div>
            <Label htmlFor="club-description">Description</Label>
            <textarea
              id="club-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 flex w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
            />
          </div>

          <div>
            <Label>Default accent colour</Label>
            <RadioGroup
              value={accent}
              onValueChange={(v) => setAccent(v as AccentToken)}
              className="mt-2 flex flex-wrap gap-2"
            >
              {ACCENT_TOKENS.map((token) => (
                <RadioGroupItem
                  key={token}
                  value={token}
                  aria-label={token}
                  className="h-8 w-8 border-2 border-transparent data-[state=checked]:border-neutral-900"
                  style={{ backgroundColor: ACCENT_SWATCHES[token] }}
                />
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="club-pattern">Default header pattern</Label>
            <Select value={pattern} onValueChange={(v) => setPattern(v as PatternToken)}>
              <SelectTrigger id="club-pattern">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                {PATTERN_TOKENS.map((token) => (
                  <SelectItem key={token} value={token}>
                    {token.charAt(0).toUpperCase() + token.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !name || (!isEdit && !slug)}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
