"use client";

import "./app-chrome.css";

import { Settings } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { OPEN_SHARE_DIALOG_EVENT } from "@/lib/setups-tab";
import { OPEN_REQUEST_DIALOG_EVENT } from "@/lib/requests/send-request";
import { RequestDialog } from "./RequestDialog";
import { useIsCompactViewport } from "@/lib/compact-view";
import { markNotesReadAndNotify, subscribeToNotesRead, unseenEntries } from "@/lib/whats-new";
import { ChangelogDialog } from "./ChangelogDialog";
import { APP_VERSION } from "@/lib/version";
import { useT } from "@/lib/i18n";
import { AccountMenu } from "./community/AccountMenu";
import { SharePlanDialog } from "./community/SharePlanDialog";
import { ONLINE_FEATURES, REQUEST_FORM_ENABLED } from "@/lib/site";
import { AppIdentity, useHasPackChoice } from "./AppIdentity";
import { DesignTabs } from "./DesignTabs";
import { AppMenu } from "./AppMenu";
import { BoardActions } from "./BoardActions";
import { ExportImageDialog } from "./export/ExportImageDialog";
import { DevMenu } from "./DevMenu";
import { SettingsDialog } from "./SettingsDialog";
import { HeaderLinks, SupportButton } from "./HeaderLinks";

interface AppHeaderProps {
  onLoadDatasetVersion: (versionId: string) => void;
}

/**
 * The one top bar for the whole app: title and version chip, design tabs,
 * plan actions, settings, links and account.
 */
export function AppHeader({ onLoadDatasetVersion }: AppHeaderProps) {
  const t = useT();
  // The chip wears a dot while a shipped release has notes this browser has
  // not opened. It has its own stamp, separate from the release notice's
  // (see whats-new.ts).
  const hasUnread = useSyncExternalStore(
    subscribeToNotesRead,
    () => unseenEntries().length > 0,
    () => false,
  );
  // Captured at the moment of the click, because opening the notes marks them
  // read: without this the sheet would have nothing above its divider.
  const [unseenVersions, setUnseenVersions] = useState<Set<string>>();
  const [isChangelogOpen, setChangelogOpen] = useState(false);
  // Shift-click the version chip. See DevMenu.
  const [isDevMenuOpen, setDevMenuOpen] = useState(false);
  // The share dialog lives up here rather than in BoardActions so the compact
  // menu can close behind it without unmounting it. The export dialog for the
  // same reason.
  const [isShareOpen, setShareOpen] = useState(false);
  const [isExportOpen, setExportOpen] = useState(false);
  // The shelf asks for the share dialog by event after putting a design on
  // the canvas ("Update post"): same dialog, same board, no second copy.
  useEffect(() => {
    const open = () => setShareOpen(true);
    window.addEventListener(OPEN_SHARE_DIALOG_EVENT, open);
    return () => window.removeEventListener(OPEN_SHARE_DIALOG_EVENT, open);
  }, []);
  // Settings lives up here for the same reason as the share dialog: the
  // compact menu closes behind it without unmounting it.
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  // The request form too; the Help menu (and the compact menu) open it by event.
  const [isRequestOpen, setRequestOpen] = useState(false);
  useEffect(() => {
    const open = () => setRequestOpen(true);
    window.addEventListener(OPEN_REQUEST_DIALOG_EVENT, open);
    return () => window.removeEventListener(OPEN_REQUEST_DIALOG_EVENT, open);
  }, []);
  const closeRequest = useCallback(() => setRequestOpen(false), []);
  // Narrow windows keep the name and the version chip and fold the rest into
  // one menu — see AppMenu for why a bar that overflows costs a phone more than
  // the buttons that fall off the end of it.
  const isCompact = useIsCompactViewport();
  const hasPackChoice = useHasPackChoice();

  return (
    <header className="app-header relative flex h-[30px] shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-3 compact:h-auto compact:flex-wrap compact:gap-y-0">
      <h1 className="flex min-w-0 items-center gap-2 text-sm font-bold tracking-tight">
        <span className="shrink-0">
          GTNH <span className="text-cyan-500">Planner</span> Retro
        </span>
        {/* Release notes open only on request. Shift-click opens the dev menu. */}
        <button
          type="button"
          onClick={(event) => {
            if (event.shiftKey) {
              setDevMenuOpen(true);
              return;
            }
            // Read what is unread BEFORE stamping, or the sheet opens with
            // nothing above its divider. Opening it IS reading it, so the dot
            // goes now rather than on close.
            setUnseenVersions(new Set(unseenEntries().map((entry) => entry.version)));
            markNotesReadAndNotify();
            setChangelogOpen(true);
          }}
          title={t("What's new")}
          aria-label={t("Version {version}: see what's new", { version: APP_VERSION })}
          className="relative shrink-0 rounded border border-line px-1 py-px text-[10px] font-semibold leading-none text-fg-muted tabular-nums hover:border-cyan-600 hover:text-cyan-500"
        >
          v{APP_VERSION}
          {hasUnread ? (
            <span
              aria-label={t("Unread release notes")}
              className="absolute -right-1 -top-1 h-2 w-2 rounded-full border border-surface bg-cyan-400"
            />
          ) : null}
        </button>
        {/* The pack picker sits beside the app version (in the menu on a
            phone), shown only when the manifest offers more than one pack. */}
        {isCompact || !hasPackChoice ? null : (
          <>
            <span className="ml-3 h-3.5 w-px bg-line" aria-hidden />
            <AppIdentity onLoadDatasetVersion={onLoadDatasetVersion} />
          </>
        )}
      </h1>
      <div className="app-header-tabs min-w-0 flex-1 compact:order-last compact:basis-full">
        <DesignTabs />
      </div>
      {isChangelogOpen ? (
        <ChangelogDialog unseenVersions={unseenVersions} onClose={() => setChangelogOpen(false)} />
      ) : null}
      {/* The one popup that opens by itself, once per browser. */}
      {isDevMenuOpen ? <DevMenu onClose={() => setDevMenuOpen(false)} /> : null}
      {isShareOpen ? <SharePlanDialog onClose={() => setShareOpen(false)} /> : null}
      {isExportOpen ? <ExportImageDialog onClose={() => setExportOpen(false)} /> : null}
      {isSettingsOpen ? <SettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
      {isRequestOpen && REQUEST_FORM_ENABLED ? <RequestDialog onClose={closeRequest} /> : null}
      {isCompact ? (
        <AppMenu
          onLoadDatasetVersion={onLoadDatasetVersion}
          onShare={ONLINE_FEATURES ? () => setShareOpen(true) : undefined}
          onExportImage={() => setExportOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : (
        // The global `font: inherit` reset outranks any text-* on a button, so
        // the cluster sets the one size every control in it renders at.
        <div className="app-header-tools flex shrink-0 items-center gap-3 text-xs">
          <BoardActions
            onShare={ONLINE_FEATURES ? () => setShareOpen(true) : undefined}
            onExportImage={() => setExportOpen(true)}
          />
          {/* Settings is a plain utility square, not a coloured call to action. */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title={t("Settings")}
            aria-label={t("Open settings")}
            className="inline-flex h-5 w-5 items-center justify-center rounded border border-line-strong bg-surface text-fg-subtle hover:bg-surface-raised hover:text-fg"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
          <SupportButton />
          <HeaderLinks />
          {/* No What's new button: the version chip opens the notes and wears
              the unread dot. */}
          <AccountMenu />
        </div>
      )}
    </header>
  );
}
