export type IconName = 'open' | 'reviewed' | 'late' | 'very-late' | 'back'

interface IconProps {
  name: IconName
  /**
   * Text alternative for an icon that stands alone. Leave it out when a text
   * label sits next to the icon; the icon is then hidden from assistive technology.
   */
  label?: string
}

function Shapes({ name }: { name: IconName }) {
  switch (name) {
    case 'open':
      return <circle cx="12" cy="12" r="8" />
    case 'reviewed':
      return <path d="M5 12.5l4.5 4.5L19 7.5" />
    case 'late':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      )
    case 'very-late':
      return (
        <>
          <path d="M12 3.5L21.5 20h-19z" />
          <path d="M12 10v4.5M12 17.5v.01" />
        </>
      )
    case 'back':
      return <path d="M19 12H5M11 6l-6 6 6 6" />
  }
}

export default function Icon({ name, label }: IconProps) {
  const a11y =
    label === undefined
      ? ({ 'aria-hidden': 'true' } as const)
      : ({ role: 'img', 'aria-label': label } as const)
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...a11y}
    >
      <Shapes name={name} />
    </svg>
  )
}
