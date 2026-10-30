import Link from "next/link";

/** Post bodies with live $TICKER and @handle links. */
export function RichText({ text, className = "say" }: { text: string; className?: string }) {
  const parts = text.split(/(\$[A-Za-z]{2,10}\b|@[a-z0-9_]{3,20}\b|https?:\/\/\S+)/g);
  return (
    <p className={className}>
      {parts.map((p, i) => {
        if (/^\$[A-Za-z]{2,10}$/.test(p)) return <Link key={i} href={`/markets/${p.slice(1).toUpperCase()}`} className="tag">{p.toUpperCase()}</Link>;
        if (/^@[a-z0-9_]{3,20}$/.test(p)) return <Link key={i} href={`/u/${p.slice(1)}`} className="tag">{p}</Link>;
        if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noreferrer" className="tag">{p.replace(/^https?:\/\//, "").slice(0, 40)}</a>;
        return <span key={i}>{p}</span>;
      })}
    </p>
  );
}
