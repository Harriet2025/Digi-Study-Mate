"use client";

import { Download } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Spinner } from "@/components/ui";

/** The file name from a Content-Disposition header, if there is one. */
function nameFrom(header: string | null, fallback: string) {
  const m = header?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return m ? decodeURIComponent(m[1]!) : fallback;
}

/**
 * Downloads a file without leaving the page. Plain download links open the file in place, which
 * leaves an installed phone app (no browser bar) on a blank screen with no way back.
 * The file is fetched in the background, then saved; if the phone can't save it directly,
 * the system share sheet opens so it can be saved to Files, Drive, WhatsApp, etc.
 */
export default function DownloadButton({
  url,
  filename,
  className,
  children,
}: {
  url: string;
  filename: string;
  className: string;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status === 401 ? "Please log in again." : "The file isn't ready. Please try again.");
      const blob = await res.blob();
      const name = nameFrom(res.headers.get("content-disposition"), filename);
      const href = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = href;
        a.download = name;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch {
        const file = new File([blob], name, { type: blob.type });
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: name });
        else throw new Error("Your browser couldn't save the file.");
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed. Please try again.");
    }
    setBusy(false);
  };

  return (
    <span className="inline-flex flex-col items-start">
      <button type="button" onClick={download} disabled={busy} className={className}>
        {busy ? <Spinner className="size-4" /> : <Download className="size-4" aria-hidden="true" />}
        {busy ? "Preparing…" : children}
      </button>
      {error && (
        <span role="alert" className="mt-1 text-xs text-brand-deep">
          {error}
        </span>
      )}
    </span>
  );
}
