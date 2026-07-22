import BackButton from "./BackButton";

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
    <div className="w-full px-4 pb-4 pt-7">
      {backHref ? (
        <div className="flex items-center gap-2 text-sm font-semibold text-[#f8fbff]">
          <span aria-hidden="true">←</span>
          <span>{backLabel ?? title}</span>
        </div>
      ) : (
        <h1 className="text-xl font-bold tracking-[-0.03em] text-[#f8fbff]">{title}</h1>
      )}
      {subtitle ? (
        <p className={`text-sm text-[#b9c4c9] ${backHref ? "mt-2" : "mt-1"}`}>{subtitle}</p>
      ) : null}
    </div>
  );

  return (
    <div role="banner" className="fixed inset-x-0 top-0 z-50 px-4">
      <div className="monolith-lightline mx-auto w-full max-w-md overflow-hidden border border-white/10 bg-[#030506] shadow-[0_18px_44px_rgba(0,0,0,0.62)]">
        {backHref ? (
          <BackButton
            fallbackHref={backHref}
            className="block w-full text-left transition hover:bg-white/[0.035]"
          >
            {content}
          </BackButton>
        ) : (
          content
        )}
      </div>
    </div>
  );
}
