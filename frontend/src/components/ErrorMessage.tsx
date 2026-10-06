export function ErrorMessage({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="rounded-xl border border-impostor/50 bg-impostor/15 px-4 py-3 text-sm font-bold text-rose-200">
      {error}
    </p>
  )
}
