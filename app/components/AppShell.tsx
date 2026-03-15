import TopBar from "./TopBar";
import BottomNav from "./BottomNav";

type AppShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export default function AppShell({
  title,
  subtitle,
  children,
}: AppShellProps) {
  return (
    <main className="min-h-screen bg-gray-900 text-white">
      <TopBar title={title} subtitle={subtitle} />

      <div className="mx-auto w-full max-w-md px-4 pb-24 pt-4">
        {children}
      </div>

      <BottomNav />
    </main>
  );
}