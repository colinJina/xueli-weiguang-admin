import type { DictionaryItem } from "@/lib/review/types";

export type PvdexMatchMethod = "primary" | "alternate";

export type PvdexSuggestionResult =
  | {
      status: "matched";
      fetchedAt: string;
      match: {
        id: string;
        title: string;
        url: string;
        method: PvdexMatchMethod;
      };
      categoryId: string | null;
      categories: DictionaryItem[];
      tags: Array<{ name: string; item: DictionaryItem | null; ambiguous: boolean }>;
      colors: Array<{
        hex: string;
        percentage: number;
        order: number;
      }>;
      analysisStatus: string | null;
    }
  | {
      status: "not_found" | "ambiguous" | "unavailable" | "unsupported";
      message: string;
      fetchedAt?: string;
      matches?: Array<{ id: string; title: string; url: string }>;
    };

export type PvdexColor = {
  hex: string;
  percentage: number;
  order: number;
};

/** Only normalized external data belongs in the shared directory cache. */
export type PvdexCatalogEntry = {
  id: string;
  title: string;
  primaryKey: string;
  alternateKeys: string[];
  tags: string[];
  categoryNames: string[];
  colors: PvdexColor[];
  analysisStatus: string | null;
};

export type PvdexCatalog = {
  fetchedAt: string;
  entries: PvdexCatalogEntry[];
};
