/** Live world state from the server's Server-Sent Events stream. */
import type { WorldState } from '../../shared/types'

export type ConnectionStatus = 'connecting' | 'online' | 'offline'

export function connect(onState: (world: WorldState) => void, onStatus: (status: ConnectionStatus) => void): () => void {
  // EventSource reconnects by itself after a drop; we only report the status.
  const source = new EventSource('/stream')
  onStatus('connecting')
  source.addEventListener('open', () => onStatus('online'))
  source.addEventListener('error', () => onStatus(source.readyState === EventSource.CLOSED ? 'offline' : 'connecting'))
  source.addEventListener('state', event => {
    try {
      onState(JSON.parse((event as MessageEvent<string>).data) as WorldState)
    } catch {
      // ignore a malformed message; the next one carries the whole state again
    }
  })
  return () => source.close()
}
