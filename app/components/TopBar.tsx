import Link from "next/link";

type TopBarProps = {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
};

export default function TopBar({
  title,
  subtitle,
  backHref,
  backLabel,
}: TopBarProps) {
  const content = (
    <div className="mx-auto w-full max-w-md px-4 py-4">
      {backHref ? (
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-200">
          <span aria-hidden="true">←</span>
          <span>{backLabel ?? title}</span>
        </div>
      ) : (
        <h1 className="text-xl font-bold text-white">{title}</h1>
      )}
      {subtitle ? (
        <p className={`text-sm text-gray-400 ${backHref ? "mt-2" : "mt-1"}`}>{subtitle}</p>
      ) : null}
    </div>
  );

  return (
    <header className="sticky top-0 z-20 border-b border-gray-800 bg-gray-900/95 backdrop-blur">
      {backHref ? (
        <Link href={backHref} className="block transition hover:bg-gray-800/60">
          {content}
        </Link>
      ) : (
        content
      )}
    </header>
  );
}
