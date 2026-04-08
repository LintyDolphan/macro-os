import TopBar from "./TopBar";
import BottomNav from "./BottomNav";

type AppShellProps = {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
};

export default function AppShell({
  title,
  subtitle,
  backHref,
  backLabel,
  children,
}: AppShellProps) {
  return (
    <main className="min-h-screen bg-gray-900 text-white">
      <TopBar
        title={title}
        subtitle={subtitle}
        backHref={backHref}
        backLabel={backLabel}
      />

      <div className="mx-auto w-full max-w-md px-4 pb-24 pt-4">
        {children}
      </div>

      <BottomNav />
    </main>
  );
}
