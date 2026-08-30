"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import {
  ACCENT_TOKENS,
  ACCENT_SWATCHES,
  PATTERN_TOKENS,
  DEFAULT_ACCENT,
  DEFAULT_PATTERN,
  type AccentToken,
  type PatternToken,
} from "@swc-blogs/shared";
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

interface PublishDialogProps {
  post: {
    id: string;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    accentColor: string | null;
    pattern: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SubmitState = "idle" | "submitting" | "success" | "error";

/**
 * Design doc §6, "Customisation, deliberately bounded": accent and
 * pattern are preset tokens the author picks from, never free colour
 * input — never the article body, only the header/chrome. This is the
 * publish-confirmation screen: a small settings step, not a blind
 * button (§7 step 5).
 */
export function PublishDialog({ post, open, onOpenChange }: PublishDialogProps) {
  const [tags, setTags] = useState("");
  const [accent, setAccent] = useState<AccentToken>((post.accentColor as AccentToken) ?? DEFAULT_ACCENT);
  const [pattern, setPattern] = useState<PatternToken>((post.pattern as PatternToken) ?? DEFAULT_PATTERN);
  const [state, setState] = useState<SubmitState>("idle");
  const { toast } = useToast();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const isFirstPublish = post.status === "DRAFT";

  async function handleConfirm() {
    setState("submitting");
    try {
      const res = await fetch(`${API_BASE}/posts/${post.id}/publish`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tagSlugs: tags
            .split(",")
            .map((t) => t.trim().toLowerCase().replace(/\s+/g, "-"))
            .filter(Boolean),
          accentColor: accent,
          pattern,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Publish failed.");

      // One orchestrated moment (§4: "spend your boldness in one place"),
      // held briefly before closing — then the toast below. revalidatePath
      // invalidates but regenerates on the NEXT request, so word this as
      // "in a moment," not instant (design doc §11).
      setState("success");
      setTimeout(
        () => {
          onOpenChange(false);
          setState("idle");
          toast({
            title: isFirstPublish ? "Published — live in a moment" : "Updated — live in a moment",
            description: "The page will reflect this within a few seconds.",
          });
          router.refresh();
        },
        reduceMotion ? 0 : 650
      );
    } catch (err) {
      setState("error");
      toast({
        variant: "destructive",
        title: isFirstPublish ? "Publish failed" : "Update failed",
        description: err instanceof Error ? err.message : "Try again, or contact SWC if it persists.",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => state !== "submitting" && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isFirstPublish ? "Publish post" : "Update post"}</DialogTitle>
          <DialogDescription>
            These apply to the header and accents only — never the article text.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div>
            <Label htmlFor="tags">Tags</Label>
            <Input
              id="tags"
              placeholder="hackathon, workshop, results"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <p className="mt-1 text-xs text-neutral-500">Comma-separated.</p>
          </div>

          <div>
            <Label>Accent colour</Label>
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
            <Label htmlFor="pattern">Header pattern</Label>
            <Select value={pattern} onValueChange={(v) => setPattern(v as PatternToken)}>
              <SelectTrigger id="pattern">
                <SelectValue />
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={state === "submitting"}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={state === "submitting" || state === "success"}>
            <AnimatePresence mode="wait" initial={false}>
              {state === "success" ? (
                <motion.span
                  key="success"
                  initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-1.5"
                >
                  <Check className="h-4 w-4" /> Done
                </motion.span>
              ) : (
                <motion.span key="label" className="flex items-center gap-1.5">
                  {state === "submitting" && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isFirstPublish ? "Publish" : "Update"}
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
