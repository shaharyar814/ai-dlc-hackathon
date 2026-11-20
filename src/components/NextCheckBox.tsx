import { SUGGESTED_ACTION } from '../config.ts'

export default function NextCheckBox() {
  return (
    <section className="next-check" aria-labelledby="next-check-heading">
      <h2 id="next-check-heading">What to check next</h2>
      <p>{SUGGESTED_ACTION}</p>
    </section>
  )
}
