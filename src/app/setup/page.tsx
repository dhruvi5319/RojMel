import { Fuel } from 'lucide-react'
import { isConfigured } from '@/lib/supabase/session'
import { Alert, Card } from '@/components/ui'

/** Shown until NEXT_PUBLIC_SUPABASE_* point at a real project. */
export default function SetupPage() {
  const configured = isConfigured()

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-xl bg-brand text-white">
          <Fuel className="size-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rojmel</h1>
          <p className="text-muted">One more step before the books open</p>
        </div>
      </div>

      {configured ? (
        <Alert tone="ok">
          Supabase is configured. Go to <a href="/login" className="underline">sign in</a>.
        </Alert>
      ) : (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Connect your Supabase project</h2>
          <ol className="mt-4 flex list-decimal flex-col gap-3 pl-5 text-[15px]">
            <li>
              Create a free project at{' '}
              <span className="font-medium">supabase.com</span>. Pick the
              Mumbai (ap-south-1) region so the pump is not talking to a server
              on the other side of the world.
            </li>
            <li>
              In the SQL editor, run the files in{' '}
              <code className="rounded bg-surface-2 px-1.5 py-0.5">
                supabase/migrations
              </code>{' '}
              in order, 0001 through 0008.
            </li>
            <li>
              Copy <code className="rounded bg-surface-2 px-1.5 py-0.5">.env.local.example</code>{' '}
              to <code className="rounded bg-surface-2 px-1.5 py-0.5">.env.local</code> and
              paste in the project URL and anon key from Settings → API.
            </li>
            <li>
              Run{' '}
              <code className="rounded bg-surface-2 px-1.5 py-0.5">
                supabase/setup/create_pump.sql
              </code>{' '}
              to create your pump and make the first owner account.
            </li>
            <li>Restart the dev server.</li>
          </ol>
          <p className="mt-5 text-sm text-muted">
            The full walkthrough is in README.md.
          </p>
        </Card>
      )}
    </main>
  )
}
