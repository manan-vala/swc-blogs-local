"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/api";

/**
 * "New Post" — design doc §7 step 2. The website is the front door,
 * not Notion: this creates the Notion page (pre-filled, correct
 * database) and a matching draft row together, then hands the author
 * straight into Notion to write.
 */
export function NewPostButton() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/posts`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create the post.");

      window.open(data.notionUrl, "_blank", "noopener,noreferrer");
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't start a new post",
        description: err instanceof Error ? err.message : "Try again, or contact SWC if it persists.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleClick} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      New post
    </Button>
  );
}
