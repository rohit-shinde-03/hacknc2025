import React from 'react'

type BlockProps = {
  trackIndex: number
  stepIndex: number
  isActive: boolean
  onToggle: (trackIndex: number, stepIndex: number) => void
}

const Block = React.memo(function Block({
  trackIndex,
  stepIndex,
  isActive,
  onToggle,
}: BlockProps) {
  function handleClick() {
    onToggle(trackIndex, stepIndex)
  }

  const classes =
    'h-8 w-8 rounded-sm border ' +
    (isActive ? 'bg-red-500 border-slate-900' : 'bg-white border-slate-600')

  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={handleClick}
      className={classes}
    />
  )
})

export default Block