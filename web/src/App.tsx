import { useQuery } from '@tanstack/react-query'

type HealthResponse = {
  status: string
}

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<HealthResponse>
}

function App() {
  const { data, error, isPending } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
  })

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold tracking-tight">kpanel</h1>
      <p className="text-gray-400 text-sm">Lightweight Kafka GUI</p>
      <div className="mt-2 px-4 py-3 rounded-lg bg-gray-900 border border-gray-800 text-sm font-mono min-w-48 text-center">
        {error ? (
          <span className="text-red-400">API error: {error.message}</span>
        ) : isPending ? (
          <span className="text-gray-500">connecting...</span>
        ) : (
          <span className="text-green-400">API {data.status}</span>
        )}
      </div>
    </div>
  )
}

export default App
