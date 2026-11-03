// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const site = vi.hoisted(() => ({ REQUEST_FORM_ENABLED: false }));
vi.mock("@/lib/site", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/site")>();
  return {
    ...actual,
    get REQUEST_FORM_ENABLED() {
      return site.REQUEST_FORM_ENABLED;
    },
  };
});

import { OPEN_REQUEST_DIALOG_EVENT } from "@/lib/requests/send-request";
import { MenuLinks } from "./HeaderLinks";

afterEach(cleanup);

describe("Send a request in the Help menu", () => {
  it("is absent from a build without the request form", () => {
    site.REQUEST_FORM_ENABLED = false;
    render(<MenuLinks auxiliary />);
    expect(screen.queryByRole("button", { name: "Send a request" })).toBeNull();
  });

  it("asks the header for the dialog and closes the menu", () => {
    site.REQUEST_FORM_ENABLED = true;
    const onAction = vi.fn();
    const opened = vi.fn();
    window.addEventListener(OPEN_REQUEST_DIALOG_EVENT, opened);
    render(<MenuLinks auxiliary onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "Send a request" }));
    expect(opened).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_REQUEST_DIALOG_EVENT, opened);
  });
});
