"use client";


import { tt } from "@/lib/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * A trader's crew, next to their name: the crew's short tag, opening the crew page. Inside another link
 * (a feed author line) it renders as a span that navigates on tap, since links can't nest.
 */
export function CrewTag({ crew, nested = true, className = "" }: { crew?: { slug: string; tag: string } | null; nested?: boolean; className?: string }) {
  const router = useRouter();
  if (!crew) return null;
  const href = `/crew/${crew.slug}`;
  if (!nested) return <Link href={href} className={`crew-tag ${className}`} title={tt("Crew")}>{crew.tag}</Link>;
  return (
    <span role="link" tabIndex={0} className={`crew-tag ${className}`} title={tt("Crew")}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(href); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); router.push(href); } }}>
      {crew.tag}
    </span>
  );
}
