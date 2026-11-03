"use client";

import { useDropdownDismiss } from "@/lib/hooks/use-dropdown-dismiss";

import { Menu, Settings, X } from "lucide-react";
import { useRef, useState } from "react";
import { AccountMenu } from "./community/AccountMenu";
import { AppIdentity, useHasPackChoice } from "./AppIdentity";
import { BoardActions } from "./BoardActions";
import { MenuLinks } from "./HeaderLinks";
import { useT } from "@/lib/i18n";

interface AppMenuProps {
  onLoadDatasetVersion: (versionId: string) => void;
  /** Opens the share dialog, which the header owns; see AppHeader. */
  onShare?: () => void;
  /** Opens the export-image dialog, also owned by the header. */
  onExportImage: () => void;
  /** Opens the settings dialog, also owned by the header. */
  onOpenSettings: () => void;
}

/**
 * The whole top bar folded into one button, for compact windows. An
 * overflowing bar makes a mobile browser widen the layout viewport and shrink
 * the page, so the bar keeps only the name and version chip and everything
 * else moves here: a sheet under the header, dismissed by a tap elsewhere.
 */
export function AppMenu({
  onLoadDatasetVersion,
  onShare,
  onExportImage,
  onOpenSettings,
}: AppMenuProps) {
  const t = useT();
  const [isOpen, setOpen] = useState(false);
  const hasPackChoice = useHasPackChoice();
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useDropdownDismiss(isOpen, { refs: [sheetRef, triggerRef], onClose: () => setOpen(false) });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-label={isOpen ? t("Close the menu") : t("Open the menu")}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line-strong bg-surface text-fg-subtle hover:bg-surface-raised"
      >
        {isOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>
      {isOpen ? (
        <div
          ref={sheetRef}
          // Anchored to the header (the app's one `relative` bar). `text-sm`
          // here because the global font reset outranks text-* on buttons,
          // which inherit this size instead.
          className="absolute right-2 top-full z-[90] mt-1 flex w-[min(320px,calc(100*var(--ui-vw)-16px))] flex-col gap-1 rounded border border-line-strong bg-surface p-2 text-sm shadow-[0_12px_28px_rgba(0,0,0,0.5)]"
        >
          {/* Shown with the header's pack picker: only when there is a choice. */}
          {hasPackChoice ? (
            <MenuSection label={t("Pack")}>
              <div className="px-2 py-1">
                <AppIdentity onLoadDatasetVersion={onLoadDatasetVersion} />
              </div>
            </MenuSection>
          ) : null}
          <MenuSection label={t("This plan")}>
            <BoardActions
              variant="list"
              onAction={() => setOpen(false)}
              onShare={onShare}
              onExportImage={onExportImage}
            />
          </MenuSection>
          <MenuSection label={t("Planner")}>
            <button
              type="button"
              onClick={() => {
                onOpenSettings();
                setOpen(false);
              }}
              className="flex h-10 w-full items-center gap-2.5 rounded px-2 text-left text-sm text-fg-subtle hover:bg-surface-sunken"
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                <Settings className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="truncate">{t("Settings")}</span>
            </button>
            <MenuLinks onAction={() => setOpen(false)} />
            <div className="flex px-2 py-1">
              <AccountMenu />
            </div>
          </MenuSection>
        </div>
      ) : null}
    </>
  );
}

function MenuSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-1 first:border-t-0 first:pt-0">
      <h2 className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-fg-muted">
        {label}
      </h2>
      {children}
    </section>
  );
}
