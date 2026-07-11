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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

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
    isFiniteNumber(candidate.viewCount) &&
    isFiniteNumber(candidate.likeCount) &&
    isFiniteNumber(candidate.duration) &&
    isFiniteNumber(candidate.pubdate) &&
    candidate.pubdate > 0;

  return hasRequiredStrings && hasRequiredNumbers ? (candidate as ReviewFetchedMeta) : null;
}
