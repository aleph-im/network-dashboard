"use client";

import { useSlotRoll } from "@/hooks/use-slot-roll";
import type { SlotDigit } from "@/hooks/use-slot-roll";

type SlotRollNumberProps = {
  value: number;
  decimals?: number;
  formatted?: boolean;
  duration?: number;
  className?: string;
  prefix?: React.ReactNode;
  decimalClassName?: string;
};

function Digit({ char, offset }: SlotDigit) {
  if (!/\d/.test(char)) {
    return <span>{char}</span>;
  }

  return (
    <span className="inline-block overflow-hidden" style={{ lineHeight: 1 }}>
      <span
        className="inline-block"
        style={{
          transform: `translateY(${offset}%)`,
          transition: offset === 0 ? "none" : undefined,
        }}
      >
        {char}
      </span>
    </span>
  );
}

export function SlotRollNumber({
  value,
  decimals = 0,
  formatted = true,
  duration,
  className,
  prefix,
  decimalClassName,
}: SlotRollNumberProps) {
  const digits = useSlotRoll(value, { decimals, formatted, duration });
  const dotIndex = digits.findIndex((d) => d.char === ".");

  return (
    <span className={className}>
      {prefix}
      {digits.map((d, i) => {
        const inDecimal =
          decimalClassName && dotIndex >= 0 && i >= dotIndex;
        return (
          <span key={i} className={inDecimal ? decimalClassName : undefined}>
            <Digit {...d} />
          </span>
        );
      })}
    </span>
  );
}
