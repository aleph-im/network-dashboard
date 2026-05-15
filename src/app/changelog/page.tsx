"use client";

import { usePageHeader } from "@aleph-front/ds/page-header";
import { Badge } from "@aleph-front/ds/badge";
import { Card } from "@aleph-front/ds/card";
import { CHANGELOG } from "@/changelog";
import type { ChangeType } from "@/changelog";

const TYPE_LABEL: Record<ChangeType, string> = {
  feature: "Feature",
  ui: "UI",
  fix: "Fix",
  infra: "Infra",
  refactor: "Refactor",
};

const TYPE_VARIANT: Record<
  ChangeType,
  "success" | "info" | "warning" | "default" | "error"
> = {
  feature: "success",
  ui: "info",
  fix: "error",
  infra: "warning",
  refactor: "default",
};

export default function ChangelogPage() {
  usePageHeader({ title: "Changelog" });
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="mb-10">
        <h1 className="text-4xl">Changelog</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Version history and notable updates
        </p>
      </div>

      <div className="space-y-6">
        {CHANGELOG.map((entry) => (
          <Card key={entry.version} padding="md">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-lg font-bold tabular-nums">
                v{entry.version}
              </h2>
              <time className="text-xs tabular-nums text-muted-foreground">
                {entry.date}
              </time>
            </div>
            <ul className="divide-y divide-edge">
              {entry.changes.map((change, i) => (
                <li
                  key={i}
                  className="flex items-start gap-6 py-4"
                >
                  <Badge
                    fill="outline"
                    variant={TYPE_VARIANT[change.type]}
                    size="sm"
                    className="mt-0.5 w-20 shrink-0 justify-center"
                  >
                    {TYPE_LABEL[change.type]}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {change.text}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
