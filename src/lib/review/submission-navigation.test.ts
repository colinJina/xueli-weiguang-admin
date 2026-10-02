import { describe, expect, it } from "vitest";

import { buildSubmissionsHref, coerceSubmissionPage, getSubmissionReturnPath } from "./submission-navigation";

describe("submission navigation", () => {
  it.each(["NaN", "Infinity", "2oops", "1.5", "0", "-1", "9007199254740992", "1000001"])("normalizes invalid page %s", (page) => {
    expect(coerceSubmissionPage(page)).toBe(1);
  });

  it("retains the status and page after batch actions, discarding old messages", () => {
    expect(getSubmissionReturnPath("/dashboard/submissions?status=all&page=3&error=old"))
      .toBe("/dashboard/submissions?status=all&page=3");
    expect(buildSubmissionsHref("rejected", 2)).toBe("/dashboard/submissions?status=rejected&page=2");
  });

  it.each(["https://evil.test", "//evil.test", "/dashboard/submissions/other?status=all", "/dashboard/submissions?status=evil&page=-3&next=https://evil.test"])("rejects untrusted return URL %s", (url) => {
    expect(getSubmissionReturnPath(url)).toBe("/dashboard/submissions");
  });
});
