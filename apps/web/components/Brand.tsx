import Link from "next/link";
import { LogoMark } from "./Logo";

/** The Webbrik mark and wordmark. Inherits theme colours and stays crisp at any size. */
export function Brand({ href = "/dashboard", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} aria-label="Webbrik home" className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <LogoMark />
      <span>Webbrik</span>
    </Link>
  );
}
