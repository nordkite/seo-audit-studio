import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  /** The report to delete; null keeps the dialog closed. */
  slug: string | null;
  onClose: () => void;
  /** Resolves once the report is gone; rejects to keep the dialog open. */
  onDelete: (slug: string) => Promise<void>;
}

/** Confirmation for deleting a report, shared by the toolbar and the home cards. */
export function DeleteReportDialog({ slug, onClose, onDelete }: Props) {
  const [deleting, setDeleting] = useState(false);

  const confirm = async () => {
    if (!slug) return;
    setDeleting(true);
    try {
      await onDelete(slug);
      onClose();
    } catch {
      /* the caller has reported it; leave the dialog up */
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={slug !== null} onOpenChange={(o) => !o && !deleting && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this report?</DialogTitle>
          <DialogDescription>
            <span className="font-mono">reports/{slug}.json</span> will be removed from the
            Studio. A copy is kept in <span className="font-mono">.studio-backups/{slug}/</span>,
            which is the only way to get it back. Images in{" "}
            <span className="font-mono">assets/{slug}/</span> are not touched.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={deleting}>
            {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
