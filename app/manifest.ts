import type { MetadataRoute } from "next";

/** Makes Study Mate installable on phones, tablets and desktops. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Study Mate",
    short_name: "Study Mate",
    description: "Turn lecture slides into lessons, flashcards, quizzes and presentation practice.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f8fa",
    theme_color: "#1e3a5f",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Study new notes", url: "/upload", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My library", url: "/library", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Flashcards", url: "/flashcards", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
