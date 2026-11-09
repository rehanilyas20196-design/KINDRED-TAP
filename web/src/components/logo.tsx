import Image from "next/image";

export function Logo({ className = "h-10 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/herbal-therapy-logo.png"
      alt="Kindred Tap"
      width={1054}
      height={702}
      className={`block shrink-0 object-contain ${className}`}
    />
  );
}
