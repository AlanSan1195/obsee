import React from 'react';

export function InlineEmphasis({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => (
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={`${part}-${index}`} className="font-semibold text-primary">{part.slice(2, -2)}</strong>
      : <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
  ));
}
