"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

/** Where "up" is from a page, for when there's no history to go back to (e.g. opened from a link). */
function parentOf(path: string): string {
  if (/^\/study\/|^\/listen\/(?!demo)/.test(path)) return "/library";
  if (/^\/exams\/(bank|mock)\//.test(path)) return "/exams";
  if (/^\/rooms\//.test(path)) return "/rooms";
  if (/^\/battle\//.test(path)) return "/rooms";
  if (/^\/projects\//.test(path)) return "/projects";
  if (/^\/practice\//.test(path)) return "/practice";
  if (/^\/(login|signup|forgot-password|reset-password|privacy|terms|offline|listen\/demo)/.test(path)) return "/";
  return "/library";
}

/**
 * A back arrow in the header. Installed on a phone, the app has no browser back button,
 * so every page except the homepage gets one.
 */
export default function BackButton() {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname === "/") return null;

  const back = () => {
    const cameFromHere = typeof document !== "undefined" && document.referrer.startsWith(window.location.origin);
    if (cameFromHere && window.history.length > 1) router.back();
    else router.push(parentOf(pathname));
  };

  return (
    <button
      type="button"
      onClick={back}
      aria-label="Go back"
      title="Back"
      className="-ml-2 grid size-10 shrink-0 place-items-center rounded-full text-ink transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
    >
      <ArrowLeft className="size-5" aria-hidden="true" />
    </button>
  );
}
