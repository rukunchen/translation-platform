export default function AppLoading() {
  return (
    <div className="flex h-screen bg-canvas">
      <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-black/20 bg-ink-900 md:flex">
        <div className="px-6 py-7">
          <div className="mb-3 h-10 w-10 rounded-xl bg-white/10" />
          <div className="h-3 w-20 rounded bg-white/15" />
          <div className="mt-2 h-2 w-32 rounded bg-white/10" />
        </div>
        <div className="mx-6 h-px bg-white/10" />
        <div className="space-y-3 px-4 py-6">
          {[0, 1, 2, 3, 4, 5].map(item => (
            <div key={item} className="rounded-xl border border-white/5 bg-white/[0.04] p-3">
              <div className="h-3 w-24 rounded bg-white/12" />
              <div className="mt-2 h-2 w-32 rounded bg-white/8" />
            </div>
          ))}
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-5">
        <div className="min-h-[calc(100vh-40px)] rounded-2xl border border-line bg-white">
          <div className="mx-auto w-full max-w-7xl px-6 py-12 sm:px-10 lg:px-14">
            <div className="mb-10 border-b border-line pb-8">
              <div className="mb-4 h-3 w-24 rounded bg-brand-50" />
              <div className="h-8 w-48 rounded bg-ink-100" />
              <div className="mt-4 h-3 w-full max-w-md rounded bg-canvas" />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              {[0, 1, 2, 3].map(item => (
                <div key={item} className="rounded-2xl border border-line bg-white p-7">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <div className="h-5 w-40 rounded bg-ink-100" />
                      <div className="mt-3 h-3 w-56 rounded bg-canvas" />
                    </div>
                    <div className="h-8 w-20 rounded-lg bg-brand-50" />
                  </div>
                  <div className="space-y-3">
                    <div className="h-3 w-full rounded bg-canvas" />
                    <div className="h-3 w-5/6 rounded bg-canvas" />
                    <div className="h-3 w-2/3 rounded bg-canvas" />
                  </div>
                  <div className="mt-7 h-10 rounded-xl border border-line bg-surface" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
