import Image from "next/image";

/**
 * Full "KINDRED TAP" lockup with transparent background.
 * Use `variant="onDark"` on dark surfaces (the black wordmark flips to white).
 */
export function Logo({
  className = "h-9 w-auto",
  variant = "solid",
}: {
  className?: string;
  variant?: "solid" | "onDark";
}) {
  return (
    <Image
      src={variant === "onDark" ? "/logo-light.png" : "/logo.png"}
      alt="Kindred Tap"
      width={1024}
      height={678}
      unoptimized
      className={`shrink-0 ${className}`}
    />
  );
}
