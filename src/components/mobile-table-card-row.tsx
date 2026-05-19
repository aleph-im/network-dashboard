"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type MobileCardField = {
  label: string;
  value: ReactNode;
  stack?: boolean;
};

type Props = {
  primary: ReactNode;
  fields: MobileCardField[];
  href?: string;
};

export function MobileTableCardRow({ primary, fields, href }: Props) {
  const body = (
    <div className="space-y-2 rounded-lg border border-foreground/[0.06] bg-foreground/[0.03] p-3">
      <div>{primary}</div>
      {fields.length > 0 && (
        <dl className="space-y-1">
          {fields.map(({ label, value, stack }) =>
            stack ? (
              <div key={label} className="space-y-1 text-xs">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ) : (
              <div
                key={label}
                className="flex items-center justify-between text-xs"
              >
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ),
          )}
        </dl>
      )}
    </div>
  );
  if (!href) return body;
  return (
    <Link href={href} className="block">
      {body}
    </Link>
  );
}
