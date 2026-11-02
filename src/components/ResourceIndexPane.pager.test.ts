import { describe, expect, it } from "vitest";
import { resourcePagerLabel } from "./ResourceIndexPane";

describe("item list pager", () => {
  it("says the list is loading while the first answer is on its way, not that it is empty", () => {
    expect(resourcePagerLabel({ currentPage: 0, pageCount: 1, isLoading: true, shown: 0 })).toBe("Loading items…");
  });

  it("counts pages once there is something to show, also while the next page loads", () => {
    expect(resourcePagerLabel({ currentPage: 0, pageCount: 1807, isLoading: false, shown: 48 })).toBe("Page 1 of 1807");
    expect(resourcePagerLabel({ currentPage: 2, pageCount: 1807, isLoading: true, shown: 48 })).toBe("Page 3 of 1807");
  });

  it("says an empty answer is one page", () => {
    expect(resourcePagerLabel({ currentPage: 0, pageCount: 1, isLoading: false, shown: 0 })).toBe("Page 1 of 1");
  });
});
