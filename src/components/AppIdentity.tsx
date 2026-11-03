"use client";

import { datasetVersionLabel, listSelectableDatasetVersions } from "@/lib/datasets/remote";
import { useT } from "@/lib/i18n";
import { useFactoryStore } from "@/store/factory-store";

/**
 * Whether there is a pack to choose: the picker shows only when the manifest
 * offers more than one dataset (the plain pack and an addon set, say).
 */
export function useHasPackChoice(): boolean {
  return useFactoryStore((state) =>
    state.datasetManifest ? listSelectableDatasetVersions(state.datasetManifest).length > 1 : false,
  );
}

interface AppIdentityProps {
  onLoadDatasetVersion: (versionId: string) => void;
}

/**
 * Game-version (pack) picker, in the top bar beside the app version chip so
 * the two version numbers read as a pair. Choosing a pack sets it on the open
 * plan, which is what loads the dataset; a plan viewed read-only keeps its own.
 */
export function AppIdentity({ onLoadDatasetVersion }: AppIdentityProps) {
  const t = useT();
  const manifest = useFactoryStore((state) => state.datasetManifest);
  const selectedDatasetVersionId = useFactoryStore((state) => state.selectedDatasetVersionId);
  const isDatasetLoading = useFactoryStore((state) => state.isDatasetLoading);
  const isReadOnly = useFactoryStore((state) => state.isReadOnly);
  const versions = manifest ? listSelectableDatasetVersions(manifest) : [];

  return (
    <label
      className="flex min-w-0 items-center gap-1.5"
      title={t("Pack version")}
    >
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
        {t("Game")}
      </span>
      <select
        value={selectedDatasetVersionId ?? ""}
        disabled={isDatasetLoading || isReadOnly || !versions.length}
        onChange={(event) => onLoadDatasetVersion(event.target.value)}
        // In the compact menu it gets the sheet's whole width: a truncated pack
        // version is the one string here nobody can afford to guess at.
        // On the bar it is the opposite: `min-w-0` so a tight window shrinks it
        // instead of letting it slide underneath the right-hand buttons.
        className="h-6 min-w-0 max-w-[300px] compact:h-9 compact:max-w-none compact:flex-1 rounded-[4px] border border-line-strong bg-surface-sunken px-1.5 text-xs compact:text-sm font-normal normal-case tracking-normal text-fg outline-none disabled:cursor-not-allowed disabled:text-fg-muted"
      >
        {versions.length ? (
          versions.map((version) => (
            <option key={version.id} value={version.id}>
              {datasetVersionLabel(version)}
            </option>
          ))
        ) : (
          <option value="">{t("No versions")}</option>
        )}
      </select>
    </label>
  );
}
