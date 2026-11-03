// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnstileRenderOptions } from "@/lib/requests/turnstile";

/** A stand-in Turnstile: the test hands out tokens through the rendered widget's callback. */
const turnstile = vi.hoisted(() => {
  const state = {
    options: undefined as TurnstileRenderOptions | undefined,
    resets: 0,
    removes: 0,
  };
  const api = {
    render: (_: HTMLElement, options: TurnstileRenderOptions) => {
      state.options = options;
      return "widget-1";
    },
    reset: () => {
      state.resets += 1;
    },
    remove: () => {
      state.removes += 1;
    },
  };
  return { state, api, load: vi.fn(async () => api) };
});
vi.mock("@/lib/requests/turnstile", () => ({ loadTurnstile: turnstile.load }));

import { TURNSTILE_ACTION } from "@/lib/requests/request-schema";
import { APP_VERSION } from "@/lib/version";
import { useFactoryStore } from "@/store/factory-store";
import { RequestDialog, SEND_ERRORS } from "./RequestDialog";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  turnstile.state.options = undefined;
  turnstile.state.resets = 0;
  turnstile.state.removes = 0;
  turnstile.load.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  useFactoryStore.setState({ dataset: { datasetVersionId: "stable-2.9.0" } as never });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openDialog(onClose = vi.fn()) {
  render(<RequestDialog onClose={onClose} siteKey="test-site-key" />);
  await waitFor(() => expect(turnstile.state.options).toBeDefined());
  return onClose;
}

function passCheck(token = "token-1") {
  act(() => turnstile.state.options!.callback(token));
}

function fill({ title = "Solver hangs", details = "It never finishes on my board.", contact = "" } = {}) {
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: title } });
  fireEvent.change(screen.getByLabelText(/^Details/), { target: { value: details } });
  fireEvent.change(screen.getByLabelText("How can we reach you? Optional."), { target: { value: contact } });
}

const send = () => fireEvent.click(screen.getByRole("button", { name: "Send" }));

describe("RequestDialog", () => {
  it("loads Turnstile only when it opens and renders it explicitly with the form's action", async () => {
    expect(turnstile.load).not.toHaveBeenCalled();
    await openDialog();
    expect(turnstile.load).toHaveBeenCalledTimes(1);
    expect(turnstile.state.options).toMatchObject({ sitekey: "test-site-key", action: TURNSTILE_ACTION });
    cleanup();
    expect(turnstile.state.removes).toBe(1);
  });

  it("keeps Send off until the bot check passes", async () => {
    await openDialog();
    fill();
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Waiting for the bot check.")).toBeTruthy();
    passCheck();
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", false);
    act(() => turnstile.state.options!["expired-callback"]!());
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", true);
  });

  it("checks each field's length before sending anything", async () => {
    await openDialog();
    passCheck();
    fill({ title: "ab", details: "short" });
    send();
    expect(await screen.findByText("Use 3 to 120 characters.")).toBeTruthy();
    expect(screen.getByText("Use 10 to 5,000 characters.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the request with the app and dataset versions only, then thanks and resets", async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    await openDialog();
    passCheck("token-1");
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "recipe-data" } });
    fill({ title: "  Wrong output  ", details: "The macerator recipe is wrong.", contact: "me#1234" });
    send();
    expect(await screen.findByText("Request sent. Thank you.")).toBeTruthy();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/request");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({
      kind: "recipe-data",
      title: "Wrong output",
      details: "The macerator recipe is wrong.",
      contact: "me#1234",
      context: { appVersion: APP_VERSION, datasetVersion: "stable-2.9.0" },
      turnstileToken: "token-1",
    });
    expect(turnstile.state.resets).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Send another" }));
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("");
  });

  it.each([
    [429, { ok: false, error: "rate-limited" }, SEND_ERRORS["rate-limited"]],
    [403, { ok: false, error: "bot-check-failed" }, SEND_ERRORS["bot-check-failed"]],
    [502, { ok: false, error: "send-failed" }, SEND_ERRORS.failed],
    [503, { ok: false, error: "unavailable" }, SEND_ERRORS.failed],
  ])("keeps the text and explains a %i", async (status, body, message) => {
    fetchMock.mockResolvedValue(Response.json(body, { status }));
    await openDialog();
    passCheck();
    fill({ details: "Keep this text please." });
    send();
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", message);
    expect((screen.getByLabelText(/^Details/) as HTMLTextAreaElement).value).toBe("Keep this text please.");
    // The spent token is gone; Send waits for the reset check's new one.
    expect(turnstile.state.resets).toBe(1);
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", true);
    passCheck("token-2");
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", false);
  });

  it("explains a network failure the same way", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    await openDialog();
    passCheck();
    fill();
    send();
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", SEND_ERRORS.failed);
  });

  it("says so when the bot check cannot load", async () => {
    turnstile.load.mockRejectedValueOnce(new Error("blocked"));
    render(<RequestDialog onClose={vi.fn()} siteKey="test-site-key" />);
    expect(await screen.findByText("The bot check could not load. Reload the page and try again.")).toBeTruthy();
  });

  it("closes on Escape", async () => {
    const onClose = await openDialog();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
