import { useToastStore } from './toastStore'

export function Toast() {
  const { message, id } = useToastStore()
  if (!message) return null
  return (
    <div key={id} className="toast" role="status" aria-live="polite">
      {message}
    </div>
  )
}
