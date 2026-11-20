import { formatOrderId } from '../format.ts'
import type { SkippedRecord } from '../types.ts'

interface SkippedListProps {
  skipped: readonly SkippedRecord[]
  onClose: () => void
}

export default function SkippedList({ skipped, onClose }: SkippedListProps) {
  return (
    <section aria-label="Skipped records">
      <h2>Skipped records</h2>
      <button type="button" onClick={onClose}>
        Close
      </button>
      <table>
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Reasons</th>
          </tr>
        </thead>
        <tbody>
          {skipped.map((s) => (
            <tr key={s.index}>
              <td>
                {s.orderId === null
                  ? `(no ID), record ${s.index + 1}`
                  : formatOrderId(s.orderId)}
              </td>
              <td>
                <ul>
                  {s.reasons.map((r, i) => (
                    <li key={i}>{r.message}</li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
