export type ReviewFetchedMeta = {
  title: string;
  pic: string;
  desc: string;
  ownerName: string;
  ownerAvatar: string;
  viewCount: number;
  likeCount: number;
  duration: number;
  pubdate: number;
};

export function asReviewFetchedMeta(value: unknown): ReviewFetchedMeta | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ReviewFetchedMeta>;
  const hasRequiredStrings =
    typeof candidate.title === "string" &&
    typeof candidate.pic === "string" &&
    typeof candidate.desc === "string" &&
    typeof candidate.ownerName === "string" &&
    typeof candidate.ownerAvatar === "string";
  const hasRequiredNumbers =
    typeof candidate.viewCount === "number" &&
    typeof candidate.likeCount === "number" &&
    typeof candidate.duration === "number" &&
    typeof candidate.pubdate === "number";

  return hasRequiredStrings && hasRequiredNumbers ? (candidate as ReviewFetchedMeta) : null;
}
