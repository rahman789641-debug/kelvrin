import * as React from "react";
import { cn } from "@/lib/utils";

export type BorderBeamSize = number | "sm" | "md" | "lg";
export type BorderBeamTheme = "light" | "dark" | "auto";
export type BorderBeamColorVariant = "colorful" | "default" | "neon" | "ocean";

export interface BorderBeamProps {
  className?: string;
  size?: BorderBeamSize;
  duration?: number;
  borderWidth?: number;
  anchor?: number;
  colorFrom?: string;
  colorTo?: string;
  delay?: number;
  colorVariant?: BorderBeamColorVariant;
  active?: boolean;
  children?: React.ReactNode;
}

export const BorderBeamOverlay: React.FC<Omit<BorderBeamProps, "children">> = ({
  className,
  duration = 8,
  borderWidth = 1.5,
  colorFrom = "#3b82f6",
  colorTo = "#8b5cf6",
  colorVariant = "colorful",
  active = true,
}) => {
  const gradient =
    colorVariant === "colorful"
      ? "conic-gradient(from 0deg, transparent 0deg 300deg, #3b82f6 320deg, #8b5cf6 340deg, #10b981 360deg)"
      : colorVariant === "neon"
      ? "conic-gradient(from 0deg, transparent 0deg 310deg, #06b6d4 330deg, #ec4899 360deg)"
      : `conic-gradient(from 0deg, transparent 0deg 320deg, ${colorFrom} 340deg, ${colorTo} 360deg)`;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden transition-opacity duration-300 z-20",
        active ? "opacity-100" : "opacity-0",
        className
      )}
      style={{
        padding: borderWidth,
        mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
        WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
        maskComposite: "exclude",
        WebkitMaskComposite: "xor",
      }}
    >
      <div
        className="absolute inset-[-150%]"
        style={{
          background: gradient,
          animation: `border-beam-spin ${duration}s linear infinite`,
        }}
      />
    </div>
  );
};

export const BorderBeam: React.FC<BorderBeamProps> = ({
  className,
  duration = 8,
  borderWidth = 1.5,
  colorFrom = "#3b82f6",
  colorTo = "#8b5cf6",
  colorVariant = "colorful",
  active = true,
  children,
}) => {
  return (
    <div className="relative w-full rounded-[inherit]">
      {children}
      <BorderBeamOverlay
        className={className}
        duration={duration}
        borderWidth={borderWidth}
        colorFrom={colorFrom}
        colorTo={colorTo}
        colorVariant={colorVariant}
        active={active}
      />
    </div>
  );
};

export default BorderBeam;

