type TopBarProps = {
  title: string;
  subtitle?: string;
};

export default function TopBar({ title, subtitle }: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-gray-800 bg-gray-900/95 backdrop-blur">
      <div className="mx-auto w-full max-w-md px-4 py-4">
        <h1 className="text-xl font-bold text-white">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-gray-400">{subtitle}</p>
        ) : null}
      </div>
    </header>
  );
}