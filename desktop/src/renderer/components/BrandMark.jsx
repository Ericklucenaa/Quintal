import React from 'react';

/**
 * Marca do Quintal: portão de quintal sob o sol. Traço em `currentColor`,
 * no mesmo estilo dos ícones Lucide (viewBox 24, traço 2), para substituí-los
 * diretamente em barras e botões.
 */
export default function BrandMark({ size = 24, className = '', title }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d="M6 20v-8a6 6 0 0 1 12 0v8" />
      <path d="M10 15v5M12 14v6M14 15v5" />
      <path d="M3 20.5h18" />
      <circle cx="20" cy="4.5" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  );
}
