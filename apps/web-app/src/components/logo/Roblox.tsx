import * as React from 'react'

const Roblox = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={800}
    height={800}
    viewBox="0 0 48 48"
    {...props}
  >
    {/* Outer tilted square */}
    <path
      d="M41.265 12.672 14.712 5.557a1.666 1.666 0 0 0-2.04 1.178L5.557 33.288a1.666 1.666 0 0 0 1.178 2.04l26.553 7.114a1.666 1.666 0 0 0 2.04-1.178l7.114-26.552a1.666 1.666 0 0 0-1.178-2.04Z"
      fill="red"
    />
    {/* Inner square (cutout) */}
    <path
      d="m29.32 20.51-8.182-2.192a.513.513 0 0 0-.628.363l-2.192 8.18a.513.513 0 0 0 .363.63l8.18 2.191a.513.513 0 0 0 .63-.363l2.191-8.18a.513.513 0 0 0-.363-.629Z"
      fill="white"
    />
  </svg>
)

export { Roblox }
