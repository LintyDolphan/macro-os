import AppShell from "../components/AppShell";

export default function TermsPage() {
  return (
    <AppShell
      title="Terms of Use"
      subtitle="Closed beta expectations and safety notes"
      backHref="/settings"
      backLabel="Settings"
    >
      <div className="mx-auto max-w-md space-y-4 pb-24">
        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h1 className="text-xl font-bold text-white">Macro OS Terms of Use</h1>
          <p className="mt-2 text-sm text-gray-400">
            These beta terms set expectations for testers using Macro OS during closed testing.
          </p>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Health & Fitness Disclaimer</h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-400">
            Macro OS is a planning and tracking tool. It does not provide medical advice, diagnosis,
            or treatment. Nutrition, exercise, and weight goals should be reviewed with a qualified
            professional when health conditions, injuries, medications, pregnancy, or eating disorder
            risk may be involved.
          </p>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Nutrition Accuracy</h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-400">
            Macro, barcode, recipe, and ingredient data can be incomplete or incorrect. Treat values
            as estimates and verify labels, serving sizes, allergens, and dietary restrictions before
            relying on them.
          </p>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Workout Safety</h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-400">
            Exercise plans and library content are informational. Stop if you feel pain, use proper
            equipment and form, and get professional guidance for injuries or unfamiliar movements.
          </p>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Closed Beta Use</h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-400">
            During beta, features may change, break, or lose polish while feedback is incorporated.
            Please avoid uploading sensitive data that you would not want stored in a test product.
          </p>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Account Responsibility</h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-400">
            You are responsible for keeping your sign-in details secure and for any data you add to
            shared household features.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
