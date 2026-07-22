import AppShell from "../components/AppShell";

export default function PrivacyPage() {
  return (
    <AppShell
      title="Privacy Policy"
      subtitle="Closed beta data and account notes"
      backHref="/settings"
      backLabel="Settings"
    >
      <div className="mx-auto max-w-md space-y-4 pb-24">
        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h1 className="text-xl font-bold text-white">Macro OS Privacy Policy</h1>
          <p className="mt-2 text-sm text-gray-400">
            This closed beta policy explains what Macro OS stores so testers can use meal planning,
            grocery, workout, onboarding, household, and account features.
          </p>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Information We Store</h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-gray-400">
            <p>
              Account information may include your email address, display name, username, avatar URL,
              bio, profile visibility, and role label.
            </p>
            <p>
              App data may include onboarding answers, macro targets, recipes, meal plans, grocery
              lists, household membership, workout templates, workout sessions, inventory entries,
              barcode lookups, and nutrition-related inputs you choose to save.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-white">How We Use It</h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-400">
            Data is used to run core app features, personalize recommendations, sync your account
            across devices, support household sharing, and improve the closed beta experience.
          </p>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Third-Party Services</h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-400">
            Macro OS uses Supabase for authentication and database storage. Catalog features may use
            food, barcode, or exercise data providers when you search, scan, or import information.
          </p>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Control Your Data</h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-400">
            You can edit profile and onboarding details in Settings. Account deletion is available
            from Settings when server-side deletion is configured for the deployment.
          </p>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Beta Notice</h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-400">
            This policy is a beta draft and should be reviewed before a public app store release.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
