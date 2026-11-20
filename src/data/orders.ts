import type { RawOrder } from '../types.ts'

// Synthetic records only. Malformed records are written as raw literals on
// purpose: validation turns them into skipped records with reasons.
export const DATASET: readonly RawOrder[] = [
  // Flagged, 27 h; same payment time as 1042, sorts first by numeric ID.
  { orderId: '998', paymentStatus: 'paid', paymentTimestamp: '2026-11-19T09:00:00Z', canceled: false, refundStatus: 'none', orderedQuantity: 1, fulfilledQuantity: 0 },
  // Flagged, 27 h 0 min, 0 of 2 units fulfilled (BRD row 3).
  { orderId: '1042', paymentStatus: 'paid', paymentTimestamp: '2026-11-19T09:00:00Z', canceled: false, refundStatus: 'none', orderedQuantity: 2, fulfilledQuantity: 0 },
  // Flagged, exactly 24 h (BRD row 2).
  { orderId: '1043', paymentStatus: 'paid', paymentTimestamp: '2026-11-19T12:00:00Z', canceled: false, refundStatus: 'none', orderedQuantity: 1, fulfilledQuantity: 0 },
  // Excluded, 23 h 59 min (BRD row 1).
  { orderId: '1044', paymentStatus: 'paid', paymentTimestamp: '2026-11-19T12:01:00Z', canceled: false, refundStatus: 'none', orderedQuantity: 1, fulfilledQuantity: 0 },
  // Excluded, canceled (BRD row 4).
  { orderId: '1045', paymentStatus: 'paid', paymentTimestamp: '2026-11-18T08:00:00Z', canceled: true, refundStatus: 'none', orderedQuantity: 1, fulfilledQuantity: 0 },
  // Excluded, fully refunded (BRD row 4).
  { orderId: '1046', paymentStatus: 'paid', paymentTimestamp: '2026-11-18T09:00:00Z', canceled: false, refundStatus: 'full', orderedQuantity: 1, fulfilledQuantity: 0 },
  // Excluded, unpaid and not skipped (BRD row 5).
  { orderId: '1047', paymentStatus: 'pending', paymentTimestamp: '2026-11-18T10:00:00Z', canceled: false, refundStatus: 'none', orderedQuantity: 1, fulfilledQuantity: 0 },
  // Excluded, units fulfilled (BRD row 5).
  { orderId: '1048', paymentStatus: 'paid', paymentTimestamp: '2026-11-18T11:00:00Z', canceled: false, refundStatus: 'none', orderedQuantity: 3, fulfilledQuantity: 1 },
  // Flagged, partially refunded.
  { orderId: '1049', paymentStatus: 'paid', paymentTimestamp: '2026-11-18T10:00:00Z', canceled: false, refundStatus: 'partial', orderedQuantity: 2, fulfilledQuantity: 0 },
  // Flagged, payment status normalized with trim and lowercase.
  { orderId: '1050', paymentStatus: ' PAID ', paymentTimestamp: '2026-11-19T06:30:00Z', canceled: false, refundStatus: 'none', orderedQuantity: 1, fulfilledQuantity: 0 },
  // Flagged, oldest payment.
  { orderId: '1051', paymentStatus: 'paid', paymentTimestamp: '2026-11-16T15:00:00Z', canceled: false, refundStatus: 'none', orderedQuantity: 4, fulfilledQuantity: 0 },
  // Excluded, paid at the evaluation time (valid, 0 h).
  { orderId: '1052', paymentStatus: 'paid', paymentTimestamp: '2026-11-20T12:00:00Z', canceled: false, refundStatus: 'none', orderedQuantity: 1, fulfilledQuantity: 0 },
  // Skipped, invalid timestamp (BRD row 6).
  { orderId: '1053', paymentStatus: 'paid', paymentTimestamp: 'yesterday', canceled: false, refundStatus: 'none', orderedQuantity: 1, fulfilledQuantity: 0 },
  // Skipped, timestamp later than the evaluation time.
  { orderId: '1054', paymentStatus: 'paid', paymentTimestamp: '2026-11-21T00:00:00Z', canceled: false, refundStatus: 'none', orderedQuantity: 1, fulfilledQuantity: 0 },
  // Skipped, negative fulfilled quantity.
  { orderId: '1055', paymentStatus: 'paid', paymentTimestamp: '2026-11-18T09:00:00Z', canceled: false, refundStatus: 'none', orderedQuantity: 2, fulfilledQuantity: -1 },
  // Skipped, missing payment timestamp.
  { orderId: '1056', paymentStatus: 'paid', canceled: false, refundStatus: 'none', orderedQuantity: 1, fulfilledQuantity: 0 },
  // Skipped, duplicate order ID (the first 1043 is kept).
  { orderId: '1043', paymentStatus: 'paid', paymentTimestamp: '2026-11-18T09:00:00Z', canceled: false, refundStatus: 'none', orderedQuantity: 1, fulfilledQuantity: 0 },
]
